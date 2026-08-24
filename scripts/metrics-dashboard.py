#!/usr/bin/env -S uv run --quiet --with streamlit --with plotly --with pandas streamlit run
"""Cost and quality dashboard for reveng runs.

Reads the JSONL written by `record_run_metrics` (one row per Claude invocation)
and renders cost, duration, cache efficiency, and cost-per-output comparisons
grouped by run id, command, and model.

Run it with:

    uv run --with streamlit --with plotly --with pandas \
      streamlit run scripts/metrics-dashboard.py

Point it at a different log with REVENG_METRICS_LOG.
"""

import json
import os
import pathlib

import pandas as pd
import plotly.express as px
import streamlit as st

DEFAULT_LOG = pathlib.Path(
    os.environ.get(
        "REVENG_METRICS_LOG",
        pathlib.Path.home() / ".config" / "reveng" / "metrics" / "metrics.jsonl",
    )
)

st.set_page_config(page_title="reveng metrics", page_icon="📊", layout="wide")
st.title("reveng — run cost and quality")


@st.cache_data(ttl=10)
def load(path: pathlib.Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # a partial write; skip rather than fail the dashboard
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["ts"], errors="coerce")
    for col in (
        "cost_usd",
        "duration_ms",
        "num_turns",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_write_tokens",
    ):
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["duration_s"] = df["duration_ms"] / 1000
    # Cache hit ratio: reads as a share of all input the model saw.
    denom = df["cache_read_tokens"] + df["input_tokens"]
    df["cache_hit_pct"] = (df["cache_read_tokens"] / denom.where(denom > 0)).fillna(0) * 100
    return df.sort_values("ts")


path_input = st.sidebar.text_input("Metrics log", str(DEFAULT_LOG))
df = load(pathlib.Path(path_input))

if df.empty:
    st.info(
        f"No metrics found at `{path_input}`.\n\n"
        "Run any `reveng` command to record the first row."
    )
    st.stop()

# ── Filters ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Filters")
    commands = sorted(df["command"].dropna().unique())
    models = sorted(df["model"].dropna().unique())
    sel_cmd = st.multiselect("Command", commands, default=commands)
    sel_model = st.multiselect("Model", models, default=models)
    if "workspace" in df:
        spaces = sorted(df["workspace"].dropna().unique())
        sel_space = st.multiselect("Workspace", spaces, default=spaces)
        df = df[df["workspace"].isin(sel_space)]

view = df[df["command"].isin(sel_cmd) & df["model"].isin(sel_model)]
if view.empty:
    st.warning("No rows match the current filters.")
    st.stop()

# ── Headline metrics ─────────────────────────────────────────────────────────
c1, c2, c3, c4, c5, c6 = st.columns(6)
c1.metric("Total spend", f"${view['cost_usd'].sum():,.2f}")
c2.metric("Runs", f"{view['run_id'].nunique():,}")
c3.metric("Mean cost / run", f"${view.groupby('run_id')['cost_usd'].sum().mean():,.2f}")
# Weighted across all tokens, not a mean of per-call ratios: a tiny call with a
# great ratio would otherwise outweigh a huge one with a poor ratio.
_reads = view["cache_read_tokens"].sum()
_fresh = view["input_tokens"].sum()
c4.metric(
    "Cache hit rate",
    f"{(_reads / (_reads + _fresh) * 100) if (_reads + _fresh) else 0:.0f}%",
    help="Cached input tokens as a share of all input tokens, weighted by volume.",
)
_out_k = view["output_tokens"].sum() / 1000
c5.metric(
    "Cost / 1k output",
    f"${(view['cost_usd'].sum() / _out_k) if _out_k else 0:,.3f}",
    help="Total spend divided by total output tokens — the value-per-pound comparison across models.",
)
c6.metric("Total time", f"{view['duration_s'].sum() / 3600:,.1f} h")

# Failed runs record a row with a null cost, so they are visible as a count even
# though their spend is unknown. Without this they would vanish from the totals.
if "is_error" in view:
    _failed = int(view["is_error"].fillna(False).astype(bool).sum())
    if _failed:
        st.warning(
            f"{_failed} of {len(view)} recorded calls failed. "
            "A call that died before reporting usage has no cost figure, "
            "so spend on failures is under-counted."
        )

st.divider()

# ── Cost by run, coloured by model ───────────────────────────────────────────
per_run = (
    view.groupby(["run_id", "command", "model"], as_index=False)
    .agg(
        cost_usd=("cost_usd", "sum"),
        duration_s=("duration_s", "sum"),
        output_tokens=("output_tokens", "sum"),
        calls=("cost_usd", "size"),
    )
    .sort_values("cost_usd", ascending=False)
)

left, right = st.columns([3, 2])
with left:
    st.subheader("Cost per run")
    st.plotly_chart(
        px.bar(
            per_run.head(25),
            x="cost_usd",
            y="run_id",
            color="model",
            orientation="h",
            labels={"cost_usd": "USD", "run_id": ""},
            height=460,
        ),
        use_container_width=True,
    )

with right:
    st.subheader("Mean cost by command and model")
    st.plotly_chart(
        px.bar(
            per_run.groupby(["command", "model"], as_index=False)["cost_usd"].mean(),
            x="command",
            y="cost_usd",
            color="model",
            barmode="group",
            labels={"cost_usd": "mean USD / run"},
            height=460,
        ),
        use_container_width=True,
    )

# ── Cost efficiency by model ─────────────────────────────────────────────────
_eff = (
    view.groupby("model", as_index=False)
    .agg(cost_usd=("cost_usd", "sum"), output_tokens=("output_tokens", "sum"))
    .assign(
        # A model with cost but no recorded output tokens would divide by zero;
        # report it as 0 rather than inf so the chart stays readable.
        cost_per_1k_out=lambda d: (
            d["cost_usd"] / (d["output_tokens"] / 1000).where(d["output_tokens"] > 0)
        ).fillna(0)
    )
    .sort_values("cost_per_1k_out")
)
if len(_eff) > 1:
    st.subheader("Cost per 1k output tokens, by model")
    st.plotly_chart(
        px.bar(
            _eff, x="model", y="cost_per_1k_out", color="model",
            labels={"cost_per_1k_out": "USD per 1k output tokens", "model": ""},
        ),
        use_container_width=True,
    )

# ── Trend and efficiency ─────────────────────────────────────────────────────
a, b = st.columns(2)
with a:
    st.subheader("Cumulative spend")
    trend = view.sort_values("ts").assign(cumulative=lambda d: d["cost_usd"].cumsum())
    st.plotly_chart(
        px.line(trend, x="ts", y="cumulative", labels={"cumulative": "USD", "ts": ""}),
        use_container_width=True,
    )

with b:
    st.subheader("Cost vs output volume")
    st.plotly_chart(
        px.scatter(
            per_run,
            x="output_tokens",
            y="cost_usd",
            color="model",
            size="duration_s",
            hover_name="run_id",
            labels={"output_tokens": "output tokens", "cost_usd": "USD"},
        ),
        use_container_width=True,
    )

# ── Per-phase breakdown (one row per analyst, one for the PRD) ───────────────
if view["phase"].nunique() > 1:
    st.subheader("Spend by phase")
    st.plotly_chart(
        px.bar(
            view.groupby(["phase", "model"], as_index=False)["cost_usd"].sum(),
            x="cost_usd",
            y="phase",
            color="model",
            orientation="h",
            labels={"cost_usd": "USD", "phase": ""},
        ),
        use_container_width=True,
    )

st.subheader("Runs")
st.dataframe(
    per_run.assign(
        cost_usd=lambda d: d["cost_usd"].round(4),
        duration_s=lambda d: d["duration_s"].round(0),
    ),
    use_container_width=True,
    hide_index=True,
)
