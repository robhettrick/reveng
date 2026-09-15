#!/usr/bin/env python3
"""Check agent and skill definitions for the drift that review keeps finding.

Five rounds of hand-review turned up the same shapes of defect: a shell command
the frontmatter does not permit, a step or phase referenced by a number that no
longer exists, a tool named in prose that is not granted. All of those are
mechanical, and none of them needs a reader.

Run from the repo root:  python3 scripts/lint-agents.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Commands a definition may name without granting: illustrative shell inside a
# fenced block that belongs to another tool's docs, not to this agent.
IGNORED_COMMANDS = {"uv", "git", "python3", "node", "npm", "reveng"}

FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n", re.S)
BASH_GRANT = re.compile(r"Bash\(([^)]*)\)")
FENCE = re.compile(r"```(\w*)\n(.*?)```", re.S)
# Only these verbs are treated as shell. Guessing from the first word of a
# fenced line reads prose and YAML as commands, which buries the real findings.
SHELL_VERBS = {
    "cat", "mkdir", "shasum", "md5sum", "sort", "ls", "cp", "mv", "rm",
    "grep", "find", "sed", "awk", "head", "tail", "wc", "touch", "command",
}


def frontmatter(text: str) -> dict[str, str]:
    m = FRONTMATTER.match(text)
    if not m:
        return {}
    out = {}
    for line in m.group(1).split("\n"):
        if ":" in line and not line.startswith((" ", "-")):
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip()
    return out


def shell_commands(text: str) -> set[str]:
    """Shell verbs invoked inside fenced blocks.

    Restricted to a known set: a fenced block may hold markdown, YAML or a tool
    call, and treating the first word of every line as a command turns ordinary
    prose into hundreds of false findings.
    """
    found = set()
    for lang, block in FENCE.findall(text):
        if lang and lang not in {"sh", "bash", "shell", ""}:
            continue
        for line in block.split("\n"):
            line = line.strip().lstrip("$ ")
            if not line or line.startswith("#"):
                continue
            m = re.match(r"([a-z][a-z0-9_-]*)\b", line)
            if m and m.group(1) in SHELL_VERBS and m.group(1) not in IGNORED_COMMANDS:
                found.add(m.group(1))
    return found


def check_bash(path: Path, text: str, problems: list[str]) -> None:
    fm = frontmatter(text)
    tools = fm.get("tools") or fm.get("allowed-tools") or ""
    grants = BASH_GRANT.findall(tools)
    verbs = {g.split()[0].rstrip("*:") for g in grants if g}
    has_bare_bash = re.search(r"(^|,\s*)Bash(\s*,|\s*$)", tools) is not None

    for cmd in sorted(shell_commands(text)):
        if has_bare_bash or cmd in verbs:
            continue
        problems.append(f"{path.parent.name}: runs `{cmd}` but frontmatter does not grant it")

    # Colon and bare forms both appear in the wild; flag the inconsistency so a
    # repo settles on one rather than mixing them.
    if any(":" in g for g in grants) and any(":" not in g for g in grants):
        problems.append(f"{path.parent.name}: mixes Bash(cmd*) and Bash(cmd:*) grant forms")


def check_references(path: Path, text: str, problems: list[str]) -> None:
    steps = {int(m) for m in re.findall(r"^(\d+)\. \*\*", text, re.M)}
    if steps:
        for ref in {int(m) for m in re.findall(r"\bstep (\d+)\b", text)}:
            if ref not in steps:
                problems.append(f"{path.parent.name}: refers to step {ref}, which does not exist")

    phases = set(re.findall(r"^### Phase ([A-Z])", text, re.M))
    if phases:
        for ref in set(re.findall(r"\bPhase ([A-Z])\b", text)):
            if ref not in phases:
                problems.append(f"{path.parent.name}: refers to Phase {ref}, which does not exist")


def check_fences(path: Path, text: str, problems: list[str]) -> None:
    """Unbalanced code fences, and duplicated lines inside one.

    Scripted edits to these files have twice left a stray fence or a repeated
    command, which swallows the prose after it. Both are cheap to detect.
    """
    if text.count("```") % 2:
        problems.append(f"{path.parent.name}: odd number of ``` fences")

    for _, block in FENCE.findall(text):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        for a, b in zip(lines, lines[1:]):
            if a == b and re.match(r"[a-z][a-z0-9_-]*\s", a):
                problems.append(
                    f"{path.parent.name}: repeated line in a fenced block: `{a[:48]}`"
                )


def check_duplicate_paragraphs(path: Path, text: str, problems: list[str]) -> None:
    """A bolded lead sentence appearing twice is almost always a bad merge."""
    leads = re.findall(r"^\*\*([^*]{25,90})\*\*", text, re.M)
    for lead in {x for x in leads if leads.count(x) > 1}:
        problems.append(f"{path.parent.name}: duplicated paragraph lead: `{lead[:48]}`")


def check_tools(path: Path, text: str, problems: list[str]) -> None:
    """A tool invoked in an example must be granted."""
    fm = frontmatter(text)
    tools = fm.get("tools") or fm.get("allowed-tools") or ""
    for called in set(re.findall(r"^\s*(Task|Agent|Skill)\(", text, re.M)):
        if called not in tools:
            problems.append(f"{path.parent.name}: calls {called}() but does not grant {called}")


def check_converted_outputs(problems: list[str]) -> None:
    """`sections_found` must equal the `##` count in its own file.

    The field is only worth having if it can be verified without trusting the
    writer; a corpus where it means different things per file cannot be
    compared. Checks any workspace output beside this repo, and is silent when
    there is none.
    """
    for out in sorted(ROOT.parent.glob("*/output/use-cases/*.md")):
        text = out.read_text(encoding="utf-8")
        m = re.search(r"^sections_found: (\d+)", text, re.M)
        if not m:
            continue
        heads = len(re.findall(r"^## ", text, re.M))
        # Match headings, not mentions: a warning that discusses the generated
        # index quotes its name in prose, and a substring test counts that.
        for generated in ("## Extraction warnings", "## Extracted index"):
            if re.search(rf"^{re.escape(generated)}\s*$", text, re.M):
                heads -= 1
        if int(m.group(1)) != heads:
            problems.append(
                f"{out.name}: sections_found is {m.group(1)} but the file has "
                f"{heads} sections"
            )


def main() -> int:
    targets = sorted(ROOT.glob("agents/*/AGENT.md")) + sorted(
        ROOT.glob("skills/*/SKILL.md")
    )
    problems: list[str] = []
    for path in targets:
        text = path.read_text(encoding="utf-8")
        if not frontmatter(text):
            problems.append(f"{path.parent.name}: no frontmatter")
            continue
        check_bash(path, text, problems)
        check_references(path, text, problems)
        check_tools(path, text, problems)
        check_fences(path, text, problems)
        check_duplicate_paragraphs(path, text, problems)

    check_converted_outputs(problems)

    for p in problems:
        print(f"  {p}")
    print(f"\n{len(targets)} definitions checked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
