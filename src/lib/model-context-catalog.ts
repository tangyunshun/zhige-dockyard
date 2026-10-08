/**
 * 模型上下文目录（实时拉取，后台不做手工填写）。
 *
 * 用途：模型部署的「上下文窗口上限」取自权威公开模型目录，避免管理员手写导致口径错误。
 * 数据源优先级：
 *   1. https://models.dev/api.json —— 公开模型目录（provider -> models -> limit.context）
 *   2. https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json —— 回退源
 * 两者均为第三方维护的权威汇编。
 * 取不到时不猜测，返回 null 由上层提示。
 */

export interface ContextInfo {
  contextLimit: number | null;
  outputLimit: number | null;
  source: string | null;
  matchedKey: string | null;
}

interface Entry {
  provider: string;
  context: number;
  output?: number;
}

interface Catalog {
  at: number;
  index: Map<string, Entry>;
  source: string;
}

const MODEL_DEV_URL = "https://models.dev/api.json";
const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

declare global {
  var __modelContextCatalog: Catalog | undefined;
}

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "").replace(/_/g, "-");
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} 返回 ${res.status}`);
  return (await res.json()) as unknown;
}

function addEntry(index: Map<string, Entry>, key: string, entry: Entry): void {
  if (!key) return;
  if (!index.has(key)) index.set(key, entry);
}

/** models.dev 结构：{ providerKey: { models: { modelKey: { id, limit: { context, output } } } } } */
function buildFromModelsDev(raw: unknown): Map<string, Entry> {
  const index = new Map<string, Entry>();
  const root = (raw ?? {}) as Record<string, unknown>;
  for (const [providerKey, providerRaw] of Object.entries(root)) {
    const models = (providerRaw as { models?: Record<string, unknown> } | null)?.models;
    if (!models || typeof models !== "object") continue;
    for (const [modelKey, mRaw] of Object.entries(models)) {
      const m = (mRaw ?? {}) as { id?: string; limit?: { context?: number; output?: number } };
      const context = m?.limit?.context;
      if (typeof context !== "number" || context <= 0) continue;
      const entry: Entry = {
        provider: providerKey,
        context,
        output: typeof m?.limit?.output === "number" ? m.limit.output : undefined,
      };
      addEntry(index, normalizeKey(modelKey), entry);
      addEntry(index, `${normalizeKey(providerKey)}/${normalizeKey(modelKey)}`, entry);
      if (m?.id) addEntry(index, normalizeKey(m.id), entry);
    }
  }
  return index;
}

/** LiteLLM 结构：{ modelKey: { litellm_provider, max_input_tokens, max_output_tokens } } */
function buildFromLiteLLM(raw: unknown): Map<string, Entry> {
  const index = new Map<string, Entry>();
  const root = (raw ?? {}) as Record<string, unknown>;
  for (const [key, mRaw] of Object.entries(root)) {
    const m = (mRaw ?? {}) as {
      max_input_tokens?: number;
      max_output_tokens?: number;
      litellm_provider?: string;
    };
    const context = m?.max_input_tokens;
    if (typeof context !== "number" || context <= 0) continue;
    addEntry(index, normalizeKey(key), {
      provider: m?.litellm_provider ?? "",
      context,
      output: typeof m?.max_output_tokens === "number" ? m.max_output_tokens : undefined,
    });
  }
  return index;
}

async function loadCatalog(): Promise<Catalog> {
  try {
    const index = buildFromModelsDev(await fetchJson(MODEL_DEV_URL));
    if (index.size > 0) return { at: Date.now(), index, source: "models.dev" };
    throw new Error("models.dev 索引为空");
  } catch (e) {
    const index = buildFromLiteLLM(await fetchJson(LITELLM_URL));
    if (index.size === 0) throw new Error(`上下文目录获取失败：${(e as Error).message}`);
    return { at: Date.now(), index, source: "litellm" };
  }
}

async function getCatalog(): Promise<Catalog | null> {
  const cached = globalThis.__modelContextCatalog;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  try {
    const fresh = await loadCatalog();
    globalThis.__modelContextCatalog = fresh;
    return fresh;
  } catch (e) {
    console.error("[model-context-catalog] 拉取失败:", (e as Error)?.message);
    return cached ?? null;
  }
}

/** 候选匹配键：原样 / 去厂商前缀 / 去冒号前缀 / 去具体日期版本后缀 */
function candidates(q: string): string[] {
  const base = normalizeKey(q);
  if (!base) return [];
  const list: string[] = [];
  const push = (v: string) => {
    if (v && !list.includes(v)) list.push(v);
  };
  push(base);
  const slash = base.split("/");
  if (slash.length > 1) push(slash[slash.length - 1]);
  const colon = base.split(":");
  if (colon.length > 1) push(colon[colon.length - 1]);
  push(base.replace(/-20\d{2}-\d{2}-\d{2}$/, ""));
  return list;
}

/**
 * 查询模型上下文窗口上限（取自公开目录，优先用 upstreamModel 匹配）。
 * @param modelId 平台内部模型代号
 * @param upstreamModel 厂商上游模型名（优先用于匹配）
 * @returns 命中返回 contextLimit 与来源；未命中或拉取失败返回全 null，由上层决定是否允许手写。
 */
export async function lookupModelContext(modelId: string, upstreamModel?: string): Promise<ContextInfo> {
  const miss: ContextInfo = { contextLimit: null, outputLimit: null, source: null, matchedKey: null };
  const queries = [upstreamModel, modelId].filter((v): v is string => !!v && !!v.trim());
  if (queries.length === 0) return miss;
  const catalog = await getCatalog();
  if (!catalog) return miss;
  for (const q of queries) {
    for (const cand of candidates(q)) {
      const hit = catalog.index.get(cand);
      if (hit) {
        return {
          contextLimit: hit.context,
          outputLimit: hit.output ?? null,
          source: catalog.source,
          matchedKey: cand,
        };
      }
    }
  }
  return miss;
}
