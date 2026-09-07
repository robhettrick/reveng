#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

function unzip(buf) {
	const files = new Map();
	let eocd = -1;
	for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("not a zip file");
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) break;
		const method = buf.readUInt16LE(p + 10);
		const csize = buf.readUInt32LE(p + 20);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const lho = buf.readUInt32LE(p + 42);
		const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

		const lNameLen = buf.readUInt16LE(lho + 26);
		const lExtraLen = buf.readUInt16LE(lho + 28);
		const start = lho + 30 + lNameLen + lExtraLen;
		const raw = buf.subarray(start, start + csize);
		files.set(name, method === 0 ? raw : inflateRawSync(raw));
		p += 46 + nameLen + extraLen + commentLen;
	}
	return files;
}

const unescapeXml = (s) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#x([0-9A-Fa-f]+);/g, (_, h) =>
			String.fromCodePoint(parseInt(h, 16)),
		)
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&amp;/g, "&");

const colToIndex = (ref) => {
	let n = 0;
	for (const c of ref.match(/^([A-Z]+)/)[1])
		n = n * 26 + (c.charCodeAt(0) - 64);
	return n - 1;
};

export const indexToCol = (i) => {
	let s = "",
		n = i + 1;
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
};

function sharedStrings(zip) {
	const f = zip.get("xl/sharedStrings.xml");
	if (!f) return [];
	const xml = f.toString("utf8");
	return xml
		.split("<si>")
		.slice(1)
		.map((chunk) => {
			const si = chunk.split("</si>")[0].replace(/<rPh[\s\S]*?<\/rPh>/g, "");
			return unescapeXml(
				[...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""),
			);
		});
}

export function sheetNames(path) {
	const zip = unzip(readFileSync(path));
	const wb = zip.get("xl/workbook.xml").toString("utf8");
	const rels = zip.get("xl/_rels/workbook.xml.rels").toString("utf8");
	const target = new Map(
		[...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g)].map((m) => [
			m[1],
			m[2],
		]),
	);
	return [...wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)].map(
		(m) => ({
			name: unescapeXml(m[1]),
			file: (target.get(m[2]) || "")
				.replace(/^\/?(xl\/)?/, "")
				.replace(/\.xml$/, ""),
		}),
	);
}

export function readSheet(path, sheetFile) {
	const zip = unzip(readFileSync(path));
	const ss = sharedStrings(zip);
	const xml = zip.get(`xl/${sheetFile}.xml`).toString("utf8");
	const merges = [
		...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g),
	].map((m) => [m[1], m[2]]);
	const rows = new Map();
	for (const chunk of xml.split("<row").slice(1)) {
		const body = chunk.split("</row>")[0];
		const rn = body.match(/\br="(\d+)"/);
		if (!rn) continue;
		const cells = new Map();
		for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const attrs = cm[1] || "",
				inner = cm[2] || "";
			const ref = attrs.match(/\br="([A-Z]+\d+)"/);
			if (!ref) continue;
			const t = attrs.match(/\bt="(\w+)"/)?.[1] ?? "n";
			const v = inner.match(/<v>([\s\S]*?)<\/v>/);
			let val = "";
			if (t === "s") {
				const i = v ? Number(v[1]) : NaN;
				val = Number.isInteger(i) && i < ss.length ? ss[i] : "";
			} else if (t === "inlineStr" || t === "str") {
				val = unescapeXml(
					[...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
						.map((m) => m[1])
						.join("") || (v ? v[1] : ""),
				);
			} else if (v) {
				val = unescapeXml(v[1]);
			}
			cells.set(colToIndex(ref[1]), val.replace(/\r\n|\n/g, " ").trim());
		}
		if (cells.size) rows.set(Number(rn[1]), cells);
	}
	if (!rows.size) return { grid: [], merges };
	const maxR = Math.max(...rows.keys());
	const maxC = Math.max(
		...[...rows.values()].map((c) => Math.max(...c.keys())),
	);
	const grid = [];
	for (let r = 1; r <= maxR; r++) {
		const row = rows.get(r);
		grid.push(
			Array.from({ length: maxC + 1 }, (_, c) =>
				row ? (row.get(c) ?? "") : "",
			),
		);
	}
	return { grid, merges };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [path, sheet, limit] = process.argv.slice(2);
	if (!sheet) {
		for (const s of sheetNames(path)) console.log(`${s.file}\t${s.name}`);
	} else {
		const { grid, merges } = readSheet(path, sheet);
		console.log(
			`# ${grid.length} rows x ${grid[0]?.length ?? 0} cols; merges=${JSON.stringify(merges)}`,
		);
		grid.slice(0, limit ? Number(limit) : undefined).forEach((r, i) => {
			const cells = r
				.map((v, j) => (v ? `${indexToCol(j)}=${v}` : ""))
				.filter(Boolean);
			if (cells.length)
				console.log(`r${i + 1}: ${cells.join("  ")}`.slice(0, 1000));
		});
	}
}
