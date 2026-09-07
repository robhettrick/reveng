#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";

const latin1 = (b) => Buffer.from(b).toString("latin1");

function inflate(buf) {
	for (const fn of [inflateSync, inflateRawSync]) {
		try {
			return fn(buf);
		} catch {
			/* try next */
		}
	}
	return null;
}

function parseObjects(data) {
	const s = latin1(data),
		objs = new Map();
	const re = /(\d+)\s+(\d+)\s+obj\b/g;
	let m = re.exec(s);
	for (; m !== null; m = re.exec(s)) {
		const end = s.indexOf("endobj", re.lastIndex);
		if (end === -1) continue;
		objs.set(Number(m[1]), {
			start: re.lastIndex,
			end,
			body: s.slice(re.lastIndex, end),
		});
	}
	return { s, objs };
}

function streamOf(data, s, obj, objs) {
	if (!obj) return null;
	const i = obj.body.indexOf("stream");
	if (i === -1) return null;
	let start = obj.start + i + "stream".length;
	if (s[start] === "\r" && s[start + 1] === "\n") start += 2;
	else if (s[start] === "\n") start += 1;
	else if (s[start] === "\r") start += 1;

	// The stream's extent, by `endstream`. Two forms: `trimmed` drops the EOL
	// that conventionally precedes the keyword and is the right guess when no
	// length is declared; `raw` keeps it, because those bytes may belong to the
	// stream. Only `raw` is a safe upper bound — clamping a declared length to
	// the trimmed position truncates any stream whose real data ends in a byte
	// that happens to look like an EOL, which for a Flate stream breaks the
	// whole page.
	const endstreamEnd = (trim) => {
		const endRel = obj.body.indexOf("endstream", i);
		if (endRel === -1) return -1;
		let e = obj.start + endRel;
		if (trim) {
			while (e > start && (s[e - 1] === "\n" || s[e - 1] === "\r")) e--;
		}
		return e;
	};

	// /Length may be a literal count or an indirect reference (`N G R`), which
	// is spec-legal and common in writers that stream output without buffering
	// it. A naive \d+ match reads the object *number* as the byte count, so
	// `/Length 6 0 R` truncates the stream to 6 bytes. For a Flate stream the
	// inflate simply fails and the endstream fallback rescues it, but an
	// uncompressed stream would be returned truncated with nothing to signal it
	// — a page reduced to a few bytes of garbage, which is worse than an empty
	// one because it looks like content.
	let declaredLength = null;
	const indirectLen = obj.body.match(/\/Length\s+(\d+)\s+(\d+)\s+R\b/);
	if (indirectLen) {
		const target = objs?.get(Number(indirectLen[1]));
		const v = target?.body.match(/\s*(\d+)/);
		if (v) declaredLength = Number(v[1]);
	} else {
		const literalLen = obj.body.match(/\/Length\s+(\d+)(?!\s+\d+\s+R\b)/);
		if (literalLen) declaredLength = Number(literalLen[1]);
	}

	let end;
	if (declaredLength !== null) {
		end = start + declaredLength;
		// Clamp only against the untrimmed boundary, and only when the declared
		// length runs past `endstream` altogether — that cannot be right
		// whatever produced it. A length landing inside the trailing EOL is
		// legitimate and must be left alone.
		const hardLimit = endstreamEnd(false);
		if (end < start || (hardLimit !== -1 && end > hardLimit)) {
			end = endstreamEnd(true);
			if (end === -1) return null;
		}
	} else {
		end = endstreamEnd(true);
		if (end === -1) return null;
	}

	const raw = data.subarray(start, end);
	if (!/FlateDecode/.test(obj.body)) return raw;
	const out = inflate(raw);
	if (out) return out;
	// A declared length can still be wrong in a malformed file; retry on the
	// structural boundary before giving up.
	const alt = endstreamEnd(true);
	if (alt === -1 || alt === end) return null;
	return inflate(data.subarray(start, alt));
}

function parseCMap(buf) {
	const t = buf.toString("latin1"),
		map = new Map();
	for (const blk of t.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
		for (const [, src, dst] of blk.matchAll(
			/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
		)) {
			map.set(
				parseInt(src, 16),
				Buffer.from(dst, "hex").toString("utf16le").length
					? Buffer.from(dst, "hex").swap16().toString("utf16le")
					: "",
			);
		}
	}
	for (const blk of t.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
		for (const [, lo, hi, dst] of blk.matchAll(
			/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
		)) {
			const a = parseInt(lo, 16),
				b = parseInt(hi, 16),
				base = parseInt(dst, 16);
			for (let i = 0; i <= b - a; i++)
				map.set(a + i, String.fromCodePoint(base + i));
		}
	}
	return map;
}

function unescapeLiteral(str) {
	return str
		.replace(
			/\\([nrtbf()\\])/g,
			(_, c) =>
				({
					n: "\n",
					r: "\r",
					t: "\t",
					b: "\b",
					f: "\f",
					"(": "(",
					")": ")",
					"\\": "\\",
				})[c],
		)
		.replace(/\\([0-7]{1,3})/g, (_, o) =>
			String.fromCharCode(parseInt(o, 8) & 0xff),
		);
}

function decodeHex(hex, cmap) {
	let h = hex.replace(/[^0-9A-Fa-f]/g, "");
	if (h.length % 2) h += "0";
	const b = Buffer.from(h, "hex");
	if (cmap?.size) {
		let out = "";
		for (let i = 0; i + 1 < b.length; i += 2)
			out += cmap.get((b[i] << 8) | b[i + 1]) ?? "";
		if (out.trim()) return out;
		let single = "";
		for (const c of b) single += cmap.get(c) ?? "";
		if (single.trim()) return single;
	}
	return b.length % 2 === 0
		? b.swap16().toString("utf16le")
		: b.toString("latin1");
}

function decodeLiteral(str, cmap) {
	const raw = unescapeLiteral(str);
	if (cmap?.size) {
		let out = "";
		for (let i = 0; i < raw.length; i++) {
			const c = raw.charCodeAt(i);
			out += cmap.get(c) ?? (c >= 32 && c < 127 ? raw[i] : "");
		}
		if (out.trim()) return out;
	}
	return raw;
}

export function extractPages(path) {
	const data = readFileSync(path);
	const { s, objs } = parseObjects(data);

	const byObj = new Map();
	for (const [num, obj] of objs) {
		const m = obj.body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
		if (!m) continue;
		const cs = streamOf(data, s, objs.get(Number(m[1])), objs);
		if (cs) byObj.set(num, parseCMap(cs));
	}
	const byName = new Map();
	for (const [, obj] of objs) {
		for (const [, name, ref] of obj.body.matchAll(
			/\/([A-Za-z0-9_.-]+)\s+(\d+)\s+0\s+R/g,
		)) {
			const cm = byObj.get(Number(ref));
			if (cm) byName.set(name, cm);
		}
	}

	const pages = [];
	for (const [, obj] of objs) {
		if (!/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.body)) continue;
		let refs = [...obj.body.matchAll(/\/Contents\s+(\d+)\s+0\s+R/g)].map((m) =>
			Number(m[1]),
		);
		if (!refs.length) {
			const arr = obj.body.match(/\/Contents\s*\[([\s\S]*?)\]/);
			if (arr)
				refs = [...arr[1].matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
		}
		let buf = "";
		for (const r of refs) {
			const st = streamOf(data, s, objs.get(r), objs);
			if (st) buf += `${st.toString("latin1")}\n`;
		}
		if (!buf) continue;

		let cmap = null;
		const out = [];
		const op =
			/\/([A-Za-z0-9_.-]+)\s+[\d.]+\s+Tf|\[([\s\S]*?)\]\s*TJ|\(((?:[^()\\]|\\.|\([^)]*\))*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\bT\*|\bTD\b|\bTd\b|\bET\b/g;
		let m = op.exec(buf);
		for (; m !== null; m = op.exec(buf)) {
			if (m[1] !== undefined) {
				cmap = byName.get(m[1]) ?? null;
			} else if (m[2] !== undefined) {
				let str = "";
				for (const p of m[2].matchAll(
					/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>/g,
				))
					str +=
						p[1] !== undefined
							? decodeLiteral(p[1], cmap)
							: decodeHex(p[2], cmap);
				out.push(str);
			} else if (m[3] !== undefined) out.push(decodeLiteral(m[3], cmap));
			else if (m[4] !== undefined) out.push(decodeHex(m[4], cmap));
			else out.push("\n");
		}
		pages.push(out.join(""));
	}
	return pages;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	for (const p of process.argv.slice(2)) {
		const pages = extractPages(p);
		console.log(`=== ${p} (${pages.length} pages) ===`);
		pages.forEach((t, i) => {
			console.log(`--- p${i + 1} ---`);
			console.log(
				t
					.replace(/\n{3,}/g, "\n\n")
					.replace(/[ \t]{2,}/g, " ")
					.trim(),
			);
		});
	}
}
