/**
 * 真实模型适配器基础层（服务端唯一模型调用入口）
 *
 * 设计原则：
 *  - 浏览器/前端永远不接触模型 API Key；所有调用均在本服务端完成。
 *  - 阶段一仅接入一个 OpenAI 兼容协议供应商，供应商与模型由环境变量统一配置，
 *    不接受前端任意提交 providerId/modelId 后无条件执行。
 *  - 缺失环境变量 → MODEL_NOT_CONFIGURED(503)，绝不静默回退为模拟结果。
 *  - 不在任何日志中写入原始 Prompt 或完整模型响应。
 */

import {
  isSupportedModelProtocol,
  validateModelBaseUrlForRequest,
  SUPPORTED_MODEL_PROTOCOLS,
} from "@/lib/model-endpoint";

export interface ModelExecutionRequest {
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ModelExecutionUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ModelExecutionResult {
  text: string;
  usage: ModelExecutionUsage;
  providerId: string;
  modelId: string;
  providerRequestId?: string | null;
  latencyMs: number;
}

export interface ModelAdapter {
  providerId: string;
  modelId: string;
  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

export type ModelErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_TIMEOUT"
  | "MODEL_AUTH_ERROR"
  | "MODEL_FORBIDDEN"
  | "MODEL_RATE_LIMITED"
  | "MODEL_UPSTREAM_ERROR"
  | "MODEL_BAD_REQUEST"
  | "MODEL_BAD_INPUT"
  | "MODEL_PROTOCOL_UNSUPPORTED"
  | "MODEL_ENDPOINT_BLOCKED";

export class ModelAdapterError extends Error {
  code: ModelErrorCode;
  status: number;
  constructor(code: ModelErrorCode, message: string, status: number) {
    super(message);
    this.name = "ModelAdapterError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS) || 60_000;

/** 当前生效的模型调用超时（毫秒）；用于落库/诊断记录（不含密钥与提示词） */
export function getModelTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS;
}
const MAX_INPUT_CHARS = Number(process.env.MODEL_MAX_INPUT_CHARS) || 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = Number(process.env.MODEL_MAX_OUTPUT_TOKENS) || 2_000;

/**
 * 适配器运行配置（由模型注册表解析结果注入）。
 * 生产运行时**不读取任何模型环境变量**：provider/model/baseUrl 一律来自数据库注册表，
 * apiKey 由注册表的 apiKeyEnv 指示的环境变量名解析后注入。
 */
export interface AdapterConfig {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  providerId: string;
  modelId: string;
  private baseURL: string;
  private apiKey: string;

  constructor(config: AdapterConfig) {
    this.providerId = config.providerId;
    this.baseURL = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const userPrompt = req.userPrompt || "";
    // 最大输入长度限制（防止超大请求打爆上下文）
    if (userPrompt.length > MAX_INPUT_CHARS) {
      throw new ModelAdapterError(
        "MODEL_BAD_INPUT",
        `输入内容过长（${userPrompt.length} 字符），超过单次调用上限 ${MAX_INPUT_CHARS} 字符。`,
        400,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
    messages.push({ role: "user", content: userPrompt });

    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) {
        throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", `模型服务地址不合法：${endpoint.error}`, 400);
      }
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          temperature: typeof req.temperature === "number" ? req.temperature : 0.5,
          max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          stream: false,
        }),
        signal: controller.signal,
        // 禁止自动跟随重定向，防止跳转到未校验地址（SSRF）
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        throw new ModelAdapterError(
          "MODEL_ENDPOINT_BLOCKED",
          "模型服务返回重定向，已拒绝跟随（禁止跳转到未校验地址）。",
          502,
        );
      }

      if (!res.ok) {
        throw this.mapHttpError(res.status, await this.safeReadErrorText(res));
      }

      const data: any = await res.json();
      // 部分网关在 HTTP 200 下返回错误体，优先识别并透传，避免被误判为「内容为空」
      if (data?.error) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || JSON.stringify(data.error).slice(0, 200);
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `上游返回错误：${detail}`, 502);
      }
      const msg: any = data?.choices?.[0]?.message ?? {};
      // 兼容各厂商推理模型：content 优先；缺失时回退常见的思考字段(reasoning_content / reasoning / thinking)
      const content: string = msg?.content?.toString() ?? "";
      const reasoning: string =
        msg?.reasoning_content?.toString() ??
        msg?.reasoning?.toString() ??
        msg?.thinking?.toString() ??
        "";
      const text: string = content || reasoning;
      const rawUsage = data?.usage;
      const usage: ModelExecutionUsage = {
        inputTokens: typeof rawUsage?.prompt_tokens === "number" ? rawUsage.prompt_tokens : null,
        outputTokens: typeof rawUsage?.completion_tokens === "number" ? rawUsage.completion_tokens : null,
        totalTokens: typeof rawUsage?.total_tokens === "number" ? rawUsage.total_tokens : null,
      };

      if (!text) {
        const fr = data?.choices?.[0]?.finish_reason;
        const hint = reasoning
          ? "（该模型以 reasoning/思考内容返回，未输出常规 content，可能是推理模型）"
          : fr
            ? `（finish_reason=${fr}，上游未产出可见文本）`
            : "（上游响应未包含 choices[0].message.content，可能协议/字段不匹配或返回了空结果）";
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型返回内容为空，无法生成结果。${hint}`, 502);
      }

      return {
        text,
        usage,
        providerId: this.providerId,
        modelId: this.modelId,
        providerRequestId: (data?.id as string) || null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof ModelAdapterError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ModelAdapterError(
          "MODEL_TIMEOUT",
          `模型调用超时（>${DEFAULT_TIMEOUT_MS}ms），请稍后重试。`,
          504,
        );
      }
      if (err instanceof TypeError && /fetch failed|network|ECONNREFUSED/i.test(err.message)) {
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "无法连接模型服务，请检查网络或服务地址。", 502);
      }
      // 未知异常：不泄露内部细节，仅记录分类错误
      console.error("[model-adapter] 调用异常:", (err as Error)?.message);
      throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "模型服务调用失败，请稍后重试。", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  private async safeReadErrorText(res: Response): Promise<string> {
    try {
      const t = await res.text();
      return t.slice(0, 200);
    } catch {
      return "";
    }
  }

  private mapHttpError(status: number, _body: string): ModelAdapterError {
    switch (status) {
      case 400:
        return new ModelAdapterError("MODEL_BAD_REQUEST", "模型请求参数被拒绝（400）。", 400);
      case 401:
        return new ModelAdapterError("MODEL_AUTH_ERROR", "模型服务鉴权失败（401），请检查 API Key 配置。", 401);
      case 403:
        return new ModelAdapterError("MODEL_FORBIDDEN", "模型服务禁止访问（403），当前密钥无权限。", 403);
      case 408:
        return new ModelAdapterError("MODEL_TIMEOUT", "模型服务请求超时（408）。", 408);
      case 429:
        return new ModelAdapterError("MODEL_RATE_LIMITED", "模型服务触发限流（429），请稍后重试。", 429);
      default:
        if (status >= 500) {
          return new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型服务异常（${status}）。`, 502);
        }
        return new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型服务返回错误（${status}）。`, 502);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) return { ok: false, message: endpoint.error };
      const res = await fetch(`${this.baseURL}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        return { ok: false, message: "模型服务返回重定向，已拒绝跟随" };
      }
      return { ok: res.ok, message: res.ok ? "ok" : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: (e as Error)?.message || "unreachable" };
    }
  }
}

/** 统一的 HTTP 错误映射（所有适配器共用） */
function mapModelHttpError(status: number): ModelAdapterError {
  switch (status) {
    case 400:
      return new ModelAdapterError("MODEL_BAD_REQUEST", "模型请求参数被拒绝（400）。", 400);
    case 401:
      return new ModelAdapterError("MODEL_AUTH_ERROR", "模型服务鉴权失败（401），请检查 API Key 配置。", 401);
    case 403:
      return new ModelAdapterError("MODEL_FORBIDDEN", "模型服务禁止访问（403），当前密钥无权限。", 403);
    case 408:
      return new ModelAdapterError("MODEL_TIMEOUT", "模型服务请求超时（408）。", 408);
    case 429:
      return new ModelAdapterError("MODEL_RATE_LIMITED", "模型服务触发限流（429），请稍后重试。", 429);
    default:
      if (status >= 500) {
        return new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型服务异常（${status}）。`, 502);
      }
      return new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型服务返回错误（${status}）。`, 502);
  }
}

/** Anthropic Messages API 适配器 */
export class AnthropicAdapter implements ModelAdapter {
  providerId: string;
  modelId: string;
  private baseURL: string;
  private apiKey: string;

  constructor(config: AdapterConfig) {
    this.providerId = config.providerId;
    this.baseURL = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const userPrompt = req.userPrompt || "";
    if (userPrompt.length > MAX_INPUT_CHARS) {
      throw new ModelAdapterError(
        "MODEL_BAD_INPUT",
        `输入内容过长（${userPrompt.length} 字符），超过单次调用上限 ${MAX_INPUT_CHARS} 字符。`,
        400,
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) {
        throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", `模型服务地址不合法：${endpoint.error}`, 400);
      }
      const res = await fetch(`${this.baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.modelId,
          system: req.systemPrompt || undefined,
          messages: [{ role: "user", content: userPrompt }],
          max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: typeof req.temperature === "number" ? req.temperature : 0.5,
        }),
        signal: controller.signal,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", "模型服务返回重定向，已拒绝跟随。", 502);
      }
      if (!res.ok) throw mapModelHttpError(res.status);
      const data: any = await res.json();
      if (data?.error) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || JSON.stringify(data.error).slice(0, 200);
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `上游返回错误：${detail}`, 502);
      }
      const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
      // 文本优先；推理模型(扩展思考)内容在 type==="thinking" 的块里，缺失时回退之
      const textBlocks = blocks.filter((b) => b?.type === "text").map((b) => String(b?.text ?? ""));
      const thinkingBlocks = blocks
        .filter((b) => b?.type === "thinking")
        .map((b) => String(b?.thinking ?? b?.text ?? ""));
      const text: string = textBlocks.join("") || thinkingBlocks.join("");
      const usage: ModelExecutionUsage = {
        inputTokens: typeof data?.usage?.input_tokens === "number" ? data.usage.input_tokens : null,
        outputTokens: typeof data?.usage?.output_tokens === "number" ? data.usage.output_tokens : null,
        totalTokens:
          typeof data?.usage?.input_tokens === "number" && typeof data?.usage?.output_tokens === "number"
            ? data.usage.input_tokens + data.usage.output_tokens
            : null,
      };
      if (!text) {
        const hint = data?.stop_reason
          ? `（stop_reason=${data.stop_reason}，上游未产出可见文本）`
          : "（上游响应未包含文本内容块，可能协议/字段不匹配或返回了空结果）";
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型返回内容为空，无法生成结果。${hint}`, 502);
      }
      return {
        text,
        usage,
        providerId: this.providerId,
        modelId: this.modelId,
        providerRequestId: null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof ModelAdapterError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ModelAdapterError("MODEL_TIMEOUT", `模型调用超时（>${DEFAULT_TIMEOUT_MS}ms），请稍后重试。`, 504);
      }
      if (err instanceof TypeError && /fetch failed|network|ECONNREFUSED/i.test(err.message)) {
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "无法连接模型服务，请检查网络或服务地址。", 502);
      }
      console.error("[model-adapter] Anthropic 调用异常:", (err as Error)?.message);
      throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "模型服务调用失败，请稍后重试。", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) return { ok: false, message: endpoint.error };
      return { ok: true, message: "ok" };
    } catch (e) {
      return { ok: false, message: (e as Error)?.message || "unreachable" };
    }
  }
}

/** Google Gemini API 适配器（密钥以 query 参数下发，不进请求头） */
export class GeminiAdapter implements ModelAdapter {
  providerId: string;
  modelId: string;
  private baseURL: string;
  private apiKey: string;

  constructor(config: AdapterConfig) {
    this.providerId = config.providerId;
    this.baseURL = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const userPrompt = req.userPrompt || "";
    if (userPrompt.length > MAX_INPUT_CHARS) {
      throw new ModelAdapterError(
        "MODEL_BAD_INPUT",
        `输入内容过长（${userPrompt.length} 字符），超过单次调用上限 ${MAX_INPUT_CHARS} 字符。`,
        400,
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) {
        throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", `模型服务地址不合法：${endpoint.error}`, 400);
      }
      const url = `${this.baseURL}/v1beta/models/${encodeURIComponent(this.modelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: req.systemPrompt ? { parts: [{ text: req.systemPrompt }] } : undefined,
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: typeof req.temperature === "number" ? req.temperature : 0.5,
            maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          },
        }),
        signal: controller.signal,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", "模型服务返回重定向，已拒绝跟随。", 502);
      }
      if (!res.ok) throw mapModelHttpError(res.status);
      const data: any = await res.json();
      if (data?.error) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || JSON.stringify(data.error).slice(0, 200);
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `上游返回错误：${detail}`, 502);
      }
      const cand: any = data?.candidates?.[0] ?? {};
      const parts: any[] = cand?.content?.parts ?? [];
      // 文本优先；推理模型的思考在 thought 标记的 part 或 thinkingProcess，缺失时回退之
      const textParts = parts.filter((p) => !p?.thought).map((p) => String(p?.text ?? ""));
      const thoughtParts = parts.filter((p) => p?.thought).map((p) => String(p?.text ?? ""));
      const thinkingProcess = (cand?.thinkingProcess?.parts ?? []).map((p: any) => String(p?.text ?? "")).join("");
      const text: string = textParts.join("") || thoughtParts.join("") || thinkingProcess;
      const um = data?.usageMetadata;
      const inputTokens = typeof um?.promptTokenCount === "number" ? um.promptTokenCount : null;
      const outputTokens = typeof um?.candidatesTokenCount === "number" ? um.candidatesTokenCount : null;
      const usage: ModelExecutionUsage = {
        inputTokens,
        outputTokens,
        totalTokens:
          typeof um?.totalTokenCount === "number"
            ? um.totalTokenCount
            : inputTokens !== null && outputTokens !== null
              ? inputTokens + outputTokens
              : null,
      };
      if (!text) {
        const fr = data?.candidates?.[0]?.finishReason;
        const hint = fr
          ? `（finishReason=${fr}，上游未产出可见文本）`
          : "（上游响应未包含文本内容，可能协议/字段不匹配或返回了空结果）";
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", `模型返回内容为空，无法生成结果。${hint}`, 502);
      }
      return {
        text,
        usage,
        providerId: this.providerId,
        modelId: this.modelId,
        providerRequestId: null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof ModelAdapterError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ModelAdapterError("MODEL_TIMEOUT", `模型调用超时（>${DEFAULT_TIMEOUT_MS}ms），请稍后重试。`, 504);
      }
      if (err instanceof TypeError && /fetch failed|network|ECONNREFUSED/i.test(err.message)) {
        throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "无法连接模型服务，请检查网络或服务地址。", 502);
      }
      console.error("[model-adapter] Gemini 调用异常:", (err as Error)?.message);
      throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "模型服务调用失败，请稍后重试。", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const endpoint = await validateModelBaseUrlForRequest(this.baseURL);
      if (!endpoint.ok) return { ok: false, message: endpoint.error };
      return { ok: true, message: "ok" };
    } catch (e) {
      return { ok: false, message: (e as Error)?.message || "unreachable" };
    }
  }
}

/**
 * 按已解析的模型执行计划创建适配器（多协议分发）。
 * 强制校验协议与 Base URL：
 *  - 协议必须受支持（后台可配置 OPENAI_COMPATIBLE / ANTHROPIC / GEMINI）；
 *  - Base URL 必须通过 SSRF 校验（仅 https、禁止内网/元数据地址）；
 *  - 密钥只来自执行计划（环境变量或加密落库），绝不由请求体传入。
 */
export async function createModelAdapter(plan: {
  providerId: string;
  modelId: string;
  upstreamModelId: string;
  baseUrl: string;
  apiKey: string;
  protocol: string;
}): Promise<ModelAdapter> {
  const protocol = (plan.protocol || "").trim().toUpperCase();
  if (!isSupportedModelProtocol(protocol)) {
    throw new ModelAdapterError(
      "MODEL_PROTOCOL_UNSUPPORTED",
      `模型供应商协议（${plan.protocol || "缺失"}）暂不支持，可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}。`,
      400,
    );
  }
  const endpoint = await validateModelBaseUrlForRequest(plan.baseUrl);
  if (!endpoint.ok) {
    throw new ModelAdapterError("MODEL_ENDPOINT_BLOCKED", `模型服务地址不合法：${endpoint.error}`, 400);
  }
  const config: AdapterConfig = {
    providerId: plan.providerId,
    baseUrl: endpoint.url,
    apiKey: plan.apiKey,
    modelId: plan.upstreamModelId || plan.modelId,
  };
  switch (protocol) {
    case "ANTHROPIC":
      return new AnthropicAdapter(config);
    case "GEMINI":
      return new GeminiAdapter(config);
    case "OPENAI_COMPATIBLE":
    default:
      return new OpenAICompatibleAdapter(config);
  }
}

// 环境变量单例入口已迁移至 src/lib/model-adapter-env-compat.ts（仅测试兼容，禁止生产路由调用）。
