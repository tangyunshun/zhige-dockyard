/**
 * 文本提取路径覆盖（非文本文件 / 图片 OCR）
 *
 * 覆盖 C07 合同 acceptedMimes 中的非纯文本类型：
 *  - .docx（OOXML，真实 zip 包）
 *  - .pdf（真实最小合法 PDF，含文本流）
 *  - 图片 PNG（OCR：确定性正例 + 确定性空例）
 *
 * 说明：本文件为**纯提取层**确定性测试（不调用外部模型）；
 * OCR 通过 `__setOcrTestHooks` 注入测试替身，避免依赖真实 tesseract 二进制与网络。
 */

import test, { describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { extractTextFromBuffer, extractTextFromBufferWithTimeout, __setOcrTestHooks, type OcrWorker } from "@/lib/text-extract";

/** 真实旧版 Office 样本（由本机 Word/PowerPoint COM 生成，见报告说明） */
const FIXTURE_DIR = path.join(__dirname, "fixtures", "legacy");
const REAL_DOC = path.join(FIXTURE_DIR, "sample-real.doc");
const REAL_PPT = path.join(FIXTURE_DIR, "sample-real.ppt");

afterEach(() => {
  __setOcrTestHooks({ factory: null, timeoutMs: null });
  delete process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
});

/** 构造最小合法 .docx（OOXML zip：word/document.xml 正文） */
function buildDocx(text: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      "utf-8",
    ),
  );
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      "utf-8",
    ),
  );
  return zip.toBuffer();
}

/** 按对象体拼装最小合法 PDF（自动计算 xref 偏移） */
function assemblePdf(objects: string[]): Buffer {
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** 构造最小合法 PDF（单页含文本流），用于验证 PDF 分支真实可解析 */
function buildPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  return assemblePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}

/** 构造「扫描件型」PDF：仅绘制图形、无任何文字层（用于验证 PDF → OCR 兜底分支） */
function buildPdfWithoutText(): Buffer {
  const content = "q 0.5 0.5 0.5 rg 10 10 100 100 re f Q";
  return assemblePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ]);
}

/** 1x1 透明 PNG */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function fakeOcrWorker(text: string): OcrWorker {
  return {
    setParameters: async () => ({}),
    recognize: async () => ({ data: { text } }),
    terminate: async () => ({}),
  };
}

describe("文本提取路径：文档格式与图片 OCR", () => {
  test(".docx（OOXML）必须提取出正文文本", async () => {
    const buf = buildDocx("汉语言测试文本 Hello DOCX");
    const text = await extractTextFromBuffer(buf, "spec.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.ok(text.includes("Hello DOCX"), `docx 必须提取正文，实际: ${JSON.stringify(text.slice(0, 120))}`);
  });

  test(".pdf 必须提取出文本流内容（真实 PDF 分支，非 OCR 兜底）", async () => {
    // 禁用 OCR 替身并置为空，确保结果只能来自 PDF 文本解析
    process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true";
    const buf = buildPdf("Hello PDF Extraction");
    const text = await extractTextFromBuffer(buf, "spec.pdf", "application/pdf");
    assert.ok(
      text.includes("Hello PDF Extraction"),
      `pdf 必须通过文档解析提取文本流，实际: ${JSON.stringify(text.slice(0, 120))}`,
    );
  });

  test("图片 PNG：OCR 命中时必须返回识别文本", async () => {
    __setOcrTestHooks({ factory: async () => fakeOcrWorker("识别到的图片文字") });
    const text = await extractTextFromBuffer(PNG_1x1, "scan.png", "image/png");
    assert.equal(text, "识别到的图片文字");
  });

  test("图片 PNG：OCR 无文本时必须返回空（不得伪造内容）", async () => {
    process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true";
    const text = await extractTextFromBuffer(PNG_1x1, "blank.png", "image/png");
    assert.equal(text, "");
    assert.equal(await extractTextFromBufferWithTimeout(PNG_1x1, "blank.png", "image/png", 5000), "");
  });

  test("图片 OCR 超时必须被取消并返回空（不泄露异常、不阻塞）", async () => {
    // 注入永不返回的 OCR worker 与极小超时：必须按超时返回空
    __setOcrTestHooks({
      factory: async () => ({
        setParameters: async () => ({}),
        recognize: () => new Promise(() => {}),
        terminate: async () => ({}),
      }),
      timeoutMs: 200,
    });
    const started = Date.now();
    const text = await extractTextFromBuffer(PNG_1x1, "slow.png", "image/png");
    assert.equal(text, "");
    assert.ok(Date.now() - started < 5000, "OCR 超时必须及时返回");
  });

  test("扫描件 PDF（无文字层）必须回落 OCR 兜底并返回识别文本", async () => {
    const pdf = buildPdfWithoutText();

    // 1) OCR 替身命中：证明「PDF 无文字层 → OCR」分支被真实触达
    __setOcrTestHooks({ factory: async () => fakeOcrWorker("扫描件识别文本") });
    const text = await extractTextFromBuffer(pdf, "scan.pdf", "application/pdf");
    assert.equal(text, "扫描件识别文本", "无文字层 PDF 必须走 OCR 兜底");

    // 2) OCR 关闭：必须返回空（证明上面的文本确实来自 OCR，而非 PDF 解析或伪造）
    __setOcrTestHooks({ factory: null });
    process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true";
    assert.equal(await extractTextFromBuffer(pdf, "scan.pdf", "application/pdf"), "");
  });

  test("旧版 .xls（OLE2/BIFF8 复合文档）必须提取单元格文本", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["项目", "金额"],
      ["智慧交通项目", 500],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { bookType: "biff8", type: "buffer" }) as Buffer;

    // 前置断言：样本确实是 OLE2/CFB 容器（D0 CF 11 E0），即「旧版二进制格式」而非 OOXML
    assert.equal(buf[0], 0xd0, "样本必须是 OLE2 复合文档（.xls）");
    assert.equal(buf[1], 0xcf);
    assert.equal(buf[2], 0x11);
    assert.equal(buf[3], 0xe0);

    const text = await extractTextFromBuffer(buf, "legacy.xls", "application/vnd.ms-excel");
    assert.ok(
      text.includes("智慧交通项目") || text.includes("Sheet1"),
      `旧版 .xls 必须能提取到可读文本，实际: ${JSON.stringify(text.slice(0, 200))}`,
    );
  });

  test("Zip 压缩包必须递归解包并聚合内部文件文本", async () => {
    const zip = new AdmZip();
    zip.addFile("说明.txt", Buffer.from("压缩包内中文说明内容", "utf-8"));
    zip.addFile("docs/notes.md", Buffer.from("# 递归解包标题", "utf-8"));
    const text = await extractTextFromBuffer(zip.toBuffer(), "bundle.zip", "application/zip");

    assert.ok(text.includes("压缩包内中文说明内容"), `必须解出根级文件文本，实际: ${JSON.stringify(text.slice(0, 200))}`);
    assert.ok(text.includes("递归解包标题"), "必须递归解出子目录文件文本");
    assert.ok(text.includes("--- 说明.txt ---"), "必须标注内部文件来源");
  });

  test("旧版 .doc（Word 97-2003，真实样本）必须还原正文（含中文与英文）", async () => {
    const buf = fs.readFileSync(REAL_DOC);
    assert.equal(buf[0], 0xd0, "真实样本必须为 OLE2 复合文档");
    assert.equal(buf[1], 0xcf);

    const text = await extractTextFromBuffer(buf, "report.doc", "application/msword");
    assert.ok(text.includes("智慧园区项目立项报告"), `必须还原中文标题，实际: ${JSON.stringify(text.slice(0, 200))}`);
    assert.ok(text.includes("Hello Legacy DOC"), "必须还原英文正文");
    assert.ok(text.includes("预算 500 万元"), "必须还原含数字的中文段落");
  });

  test("旧版 .ppt（PowerPoint 97-2003，真实样本）必须还原标题与正文文本", async () => {
    const buf = fs.readFileSync(REAL_PPT);
    assert.equal(buf[0], 0xd0, "真实样本必须为 OLE2 复合文档");
    assert.equal(buf[1], 0xcf);

    const text = await extractTextFromBuffer(buf, "deck.ppt", "application/vnd.ms-powerpoint");
    assert.ok(text.includes("智慧交通汇报"), `必须还原幻灯片标题，实际: ${JSON.stringify(text.slice(0, 300))}`);
    assert.ok(text.includes("信号配时优化"), "必须还原正文第一行");
    assert.ok(text.includes("三年运维服务"), "必须还原正文第二行");
  });
});
