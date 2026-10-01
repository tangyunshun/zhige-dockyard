import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractTextFromBuffer, extractTextFromBufferWithTimeout, __setOcrTestHooks, type OcrWorker } from "../text-extract";

const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** 可注入的假 OCR worker：记录调用次数；terminate 会让未完成的 recognize 失败（模拟真实行为） */
function makeFakeWorker() {
  const calls = { setParameters: 0, recognize: 0, terminate: 0 };
  let rejectRecognize: ((e: unknown) => void) | null = null;
  const worker: OcrWorker = {
    setParameters: async () => {
      calls.setParameters++;
    },
    recognize: () => {
      calls.recognize++;
      return new Promise<{ data?: { text?: string } }>((_resolve, reject) => {
        rejectRecognize = reject;
      });
    },
    terminate: async () => {
      calls.terminate++;
      rejectRecognize?.(new Error("worker terminated"));
    },
  };
  return { worker, calls };
}

describe("extractTextFromBuffer 可取消（AbortSignal）", () => {
  test("已中止的 signal：立即返回空串，解析请求可正常结束", async () => {
    const controller = new AbortController();
    controller.abort();
    const buf = Buffer.from("这是一段用于测试的文本内容，包含足够的中文字符以供识别。", "utf-8");
    const started = Date.now();
    const result = await extractTextFromBuffer(buf, "note.txt", "text/plain", 0, controller.signal);
    assert.equal(result, "");
    assert.ok(Date.now() - started < 2000, "应在极短时间内返回，不等待 60s 超时");
  });

  test("图片 + 已中止 signal：不启动 OCR，直接返回空串", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await extractTextFromBuffer(PNG_BUFFER, "image.png", "image/png", 0, controller.signal);
    assert.equal(result, "");
  });

  test("正常文本文件：无 signal 时仍可提取文本", async () => {
    const buf = Buffer.from("hello world 这是一段测试文本内容用于验证提取流程。", "utf-8");
    const result = await extractTextFromBuffer(buf, "note.txt", "text/plain");
    assert.ok(result.includes("hello world"));
  });

  test("OCR worker 创建后 abort：terminate 被调用，且不产生第二次 recognize", async () => {
    const { worker, calls } = makeFakeWorker();
    __setOcrTestHooks({ factory: async () => worker, timeoutMs: 60000 });
    try {
      const controller = new AbortController();
      const p = extractTextFromBuffer(PNG_BUFFER, "image.png", "image/png", 0, controller.signal);
      // 等待 worker 创建并进入第一次 recognize
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(calls.recognize, 1);
      controller.abort();
      const result = await p;
      assert.equal(result, "");
      assert.ok(calls.terminate >= 1, "abort 后应调用 worker.terminate 真正终止 OCR");
      assert.equal(calls.recognize, 1, "terminate 后不得继续第二次 recognize");
    } finally {
      __setOcrTestHooks({ factory: null, timeoutMs: null });
    }
  });

  test("OCR 超时后 Promise 能结束并终止 worker", async () => {
    const { worker, calls } = makeFakeWorker();
    __setOcrTestHooks({ factory: async () => worker, timeoutMs: 40 });
    try {
      const started = Date.now();
      const result = await extractTextFromBuffer(PNG_BUFFER, "image.png", "image/png");
      assert.equal(result, "");
      assert.ok(Date.now() - started < 2000, "超时后应立即结束等待");
      assert.ok(calls.terminate >= 1, "超时后应终止 worker");
    } finally {
      __setOcrTestHooks({ factory: null, timeoutMs: null });
    }
  });

  test("abort 后不产生未处理 rejection", async () => {
    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", handler);
    const { worker } = makeFakeWorker();
    __setOcrTestHooks({ factory: async () => worker, timeoutMs: 60000 });
    try {
      const controller = new AbortController();
      const p = extractTextFromBuffer(PNG_BUFFER, "image.png", "image/png", 0, controller.signal);
      await new Promise((r) => setTimeout(r, 30));
      controller.abort();
      await p;
      // 留出宏任务时间窗口，确保没有延迟的未处理 rejection
      await new Promise((r) => setTimeout(r, 40));
    } finally {
      __setOcrTestHooks({ factory: null, timeoutMs: null });
      process.off("unhandledRejection", handler);
    }
    assert.equal(unhandled.length, 0);
  });
});

describe("extractTextFromBufferWithTimeout（统一可取消超时入口）", () => {
  test("worker 创建延迟：超时后仍会终止最终创建的 worker（无泄漏）", async () => {
    const calls = { recognize: 0, terminate: 0 };
    let rejectRecognize: ((e: unknown) => void) | null = null;
    const worker: OcrWorker = {
      setParameters: async () => {},
      recognize: () => {
        calls.recognize++;
        return new Promise((_res, reject) => {
          rejectRecognize = reject;
        });
      },
      terminate: async () => {
        calls.terminate++;
        rejectRecognize?.(new Error("terminated"));
      },
    };
    // 创建耗时超过超时时间，模拟 createWorker 尚未完成即超时的竞态
    const slowFactory = async () => {
      await new Promise((r) => setTimeout(r, 120));
      return worker;
    };
    __setOcrTestHooks({ factory: slowFactory, timeoutMs: 30 });
    try {
      const started = Date.now();
      const result = await extractTextFromBufferWithTimeout(PNG_BUFFER, "image.png", "image/png", 30);
      assert.equal(result, "");
      assert.ok(Date.now() - started < 1000, "超时应尽快结束等待");
      // 等待延迟创建的 worker 真正完成创建并被终止
      await new Promise((r) => setTimeout(r, 220));
      assert.ok(calls.terminate >= 1, "延迟创建的 worker 也必须被终止，不得继续后台运行");
      assert.equal(calls.recognize, 0, "取消后不应开始 recognize");
    } finally {
      __setOcrTestHooks({ factory: null, timeoutMs: null });
    }
  });

  test("正常文本：统一入口无超时可直接提取", async () => {
    const buf = Buffer.from("hello world 这是一段用于验证统一超时入口的测试文本。", "utf-8");
    const result = await extractTextFromBufferWithTimeout(buf, "note.txt", "text/plain", 60000);
    assert.ok(result.includes("hello world"));
  });
});
