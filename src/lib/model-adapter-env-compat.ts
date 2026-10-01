/**
 * ⚠️ 测试兼容入口 —— 严禁在生产执行路径调用。
 *
 * 该模块保留「单组 MODEL_* 环境变量」形态的适配器读取，仅供历史单元测试使用。
 * 生产执行唯一入口：resolveModelExecutionPlan() + createModelAdapter()（走数据库模型注册表）。
 * 受 src/lib/__tests__/model-architecture.test.ts 架构测试保护：
 *   - 生产文件 model-adapter.ts / model-registry.ts 不得出现 MODEL_PROVIDER_ID / MODEL_ID / MODEL_BASE_URL；
 *   - /api/studio 路由不得引用本模块。
 */
import {
  ModelAdapter,
  ModelAdapterError,
  OpenAICompatibleAdapter,
} from "@/lib/model-adapter";

export interface RealModelEnv {
  providerId: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
}

/** 【测试专用】读取并校验真实模型环境变量；缺失则抛出 MODEL_NOT_CONFIGURED(503) */
export function readRealModelEnv(): RealModelEnv {
  const providerId = process.env.MODEL_PROVIDER_ID?.trim();
  const baseURL = process.env.MODEL_BASE_URL?.trim();
  const apiKey = process.env.MODEL_API_KEY?.trim();
  const modelId = process.env.MODEL_ID?.trim();
  if (!providerId || !baseURL || !apiKey || !modelId) {
    const missing = [
      !providerId && "MODEL_PROVIDER_ID",
      !baseURL && "MODEL_BASE_URL",
      !apiKey && "MODEL_API_KEY",
      !modelId && "MODEL_ID",
    ].filter(Boolean) as string[];
    throw new ModelAdapterError(
      "MODEL_NOT_CONFIGURED",
      `真实模型服务未配置（缺少环境变量：${missing.join("、")}），无法执行真实模型调用。`,
      503,
    );
  }
  return { providerId, baseURL, apiKey, modelId };
}

let cachedAdapter: ModelAdapter | null = null;

/** 【测试专用】环境变量形态的适配器单例 */
export function getRealModelAdapter(): ModelAdapter {
  if (cachedAdapter) return cachedAdapter;
  const env = readRealModelEnv();
  cachedAdapter = new OpenAICompatibleAdapter({
    providerId: env.providerId,
    baseUrl: env.baseURL,
    apiKey: env.apiKey,
    modelId: env.modelId,
  });
  return cachedAdapter;
}

/** 【测试专用】清除适配器缓存 */
export function resetModelAdapterCache() {
  cachedAdapter = null;
}
