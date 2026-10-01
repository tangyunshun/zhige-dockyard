import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const base = path.join(process.cwd(), "src", "lib", "__tests__", "fixtures", "legacy");
const docBuf = fs.readFileSync(path.join(base, "sample-real.doc"));
const pptBuf = fs.readFileSync(path.join(base, "sample-real.ppt"));

function extractDoc(buf: Buffer): string {
  const cfb = (XLSX as any).CFB.read(buf, { type: "buffer" });
  const wdEntry = (XLSX as any).CFB.find(cfb, "WordDocument");
  if (!wdEntry) return "";
  const wd = Buffer.from(wdEntry.content);
  const flags = wd.readUInt16LE(0x0a);
  const candidates = (flags & 0x0200) ? ["1Table", "0Table"] : ["0Table", "1Table"];
  let tbl: Buffer | null = null;
  for (const name of candidates) {
    const e = (XLSX as any).CFB.find(cfb, name);
    if (e) { tbl = Buffer.from(e.content); break; }
  }
  const fcClx = wd.readUInt32LE(0x1a2);
  const lcbClx = wd.readUInt32LE(0x1a6);
  let plcPcd: Buffer | null = null;
  if (tbl && fcClx + 5 <= tbl.length) {
    let pos = fcClx;
    const end = Math.min(fcClx + lcbClx, tbl.length);
    while (pos + 5 <= end) {
      const tag = tbl[pos];
      if (tag === 0x01) pos += 3 + tbl.readUInt16LE(pos + 1);
      else if (tag === 0x02) {
        const lcb = tbl.readUInt32LE(pos + 1);
        plcPcd = tbl.subarray(pos + 5, Math.min(pos + 5 + lcb, tbl.length));
        break;
      } else break;
    }
  }
  const out: string[] = [];
  if (!plcPcd || plcPcd.length < 16) {
    const fcMin = wd.readUInt32LE(0x18);
    const fcMac = wd.readUInt32LE(0x1c);
    const raw = wd.subarray(fcMin, Math.min(fcMac, wd.length));
    const oddZero = raw.filter((b, i) => i % 2 === 1 && b === 0).length;
    out.push(oddZero > raw.length / 4 ? raw.toString("utf16le") : raw.toString("latin1"));
  } else {
    const n = Math.floor((plcPcd.length - 4) / 12);
    const cps: number[] = [];
    for (let i = 0; i <= n; i++) cps.push(plcPcd.readUInt32LE(i * 4));
    for (let i = 0; i < n; i++) {
      const fcRaw = plcPcd.readUInt32LE(4 * (n + 1) + i * 8 + 2);
      const compressed = (fcRaw & 0x40000000) !== 0;
      const fc = compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw & 0x3fffffff;
      const len = cps[i + 1] - cps[i];
      if (len <= 0 || fc >= wd.length) continue;
      out.push(
        compressed
          ? wd.subarray(fc, Math.min(fc + len, wd.length)).toString("latin1")
          : wd.subarray(fc, Math.min(fc + len * 2, wd.length)).toString("utf16le"),
      );
    }
  }
  return out.join("").replace(/\u0000/g, "").trim();
}

function extractPpt(buf: Buffer): string {
  const cfb = (XLSX as any).CFB.read(buf, { type: "buffer" });
  const entry = (XLSX as any).CFB.find(cfb, "PowerPoint Document");
  if (!entry) return "";
  const s = Buffer.from(entry.content);
  const out: string[] = [];
  const walk = (start: number, end: number, depth: number) => {
    let pos = start;
    while (pos + 8 <= end && depth < 40) {
      const recVer = s.readUInt16LE(pos) & 0x000f;
      const recType = s.readUInt16LE(pos + 2);
      const recLen = s.readUInt32LE(pos + 4);
      const ds = pos + 8;
      if (ds + recLen > end) break;
      if (recVer === 0x0f) walk(ds, ds + recLen, depth + 1);
      else if (recType === 0x0fa0) out.push(s.subarray(ds, ds + recLen).toString("utf16le"));
      else if (recType === 0x0fa8) out.push(s.subarray(ds, ds + recLen).toString("latin1"));
      pos = ds + recLen;
    }
  };
  walk(0, s.length, 0);
  return out.join("\n").trim();
}

console.log("DOC_TEXT=", JSON.stringify(extractDoc(docBuf)));
console.log("PPT_TEXT=", JSON.stringify(extractPpt(pptBuf)));
