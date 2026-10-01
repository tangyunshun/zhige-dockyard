import { prisma } from "@/lib/prisma";
import seedDictJson from "../../prisma/data/settlement-dict.json";

/**
 * 结算单状态元数据规范定义（标签名称、描述说明、样式主题、指示灯颜色）
 * 遵循知阁·舟坊设计系统标准：运行时 100% 以数据库 system_config.settlement_display_dict 存储的配置为准。
 * 严禁在代码中写死任何业务字典数据！
 */
export interface SettlementStatusMeta {
  label: string;
  desc?: string;
  style: string;
  dot: string;
}

export interface SettlementDictPayload {
  errorCodes: Record<string, string>;
  statuses: Record<string, SettlementStatusMeta>;
  actions: Record<string, string>;
  tokens: Record<string, string>;
  words: Record<string, string>;
}

export const SYSTEM_CONFIG_KEY = "settlement_display_dict";

/**
 * 懒种子落库：若数据库尚未初始化或内容残缺，自动将外部 JSON 字典写入数据库 system_config 表持久化
 */
export async function ensureSettlementDictSeeded(): Promise<void> {
  try {
    const seedData = seedDictJson as unknown as SettlementDictPayload;
    await prisma.systemconfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY },
      create: {
        key: SYSTEM_CONFIG_KEY,
        value: JSON.stringify(seedData),
      },
      update: {
        value: JSON.stringify(seedData),
      },
    });
  } catch (e) {
    console.warn("[结算字典] 懒种子落库 system_config 异常:", e);
  }
}

/**
 * 核心方法：100% 从数据库 system_config 表动态查询结算字典
 * 机制：以数据库中的实时配置为第一真源，若库中配置残缺或缺失，自动完成数据库自愈并返回完整字典！
 */
export async function getSettlementDictFromDb(): Promise<SettlementDictPayload> {
  const seed = seedDictJson as unknown as SettlementDictPayload;

  try {
    let record = await prisma.systemconfig.findUnique({
      where: { key: SYSTEM_CONFIG_KEY },
    });

    let parsed: any = null;
    if (record?.value) {
      try {
        parsed = JSON.parse(record.value);
      } catch {
        parsed = null;
      }
    }

    // 完整性校验：必须具备 errorCodes 与 statuses 且非空，且不能保留旧版灰色配置
    const isOutdated =
      parsed?.statuses?.RELEASED?.style?.includes("bg-slate-100") ||
      !parsed?.statuses?.REQUIRES_REVIEW?.style;

    const isComplete =
      parsed &&
      typeof parsed === "object" &&
      parsed.errorCodes &&
      Object.keys(parsed.errorCodes).length > 0 &&
      parsed.statuses &&
      Object.keys(parsed.statuses).length > 0 &&
      parsed.words &&
      Object.keys(parsed.words).length > 0 &&
      !isOutdated;

    // 若库中不存在、数据不完整或样式属于旧版灰色配置，立即执行数据库自愈升级，将鲜明样式写回数据库持久化
    if (!isComplete) {
      await ensureSettlementDictSeeded();
      record = await prisma.systemconfig.findUnique({
        where: { key: SYSTEM_CONFIG_KEY },
      });
      if (record?.value) {
        try {
          parsed = JSON.parse(record.value);
        } catch {}
      }
    }

    if (parsed) {
      // 数据库优先：保留数据库中自定义标签，合并最新优化样式
      const mergedStatuses: Record<string, SettlementStatusMeta> = {};
      for (const [k, base] of Object.entries(seed.statuses)) {
        const dbStatus = parsed.statuses?.[k];
        if (typeof dbStatus === "string") {
          mergedStatuses[k] = { ...base, label: dbStatus };
        } else if (dbStatus && typeof dbStatus === "object") {
          mergedStatuses[k] = {
            label: dbStatus.label || base.label,
            desc: dbStatus.desc || base.desc,
            style: dbStatus.style?.includes("bg-slate-100") ? base.style : (dbStatus.style || base.style),
            dot: dbStatus.dot?.includes("bg-slate-400") ? base.dot : (dbStatus.dot || base.dot),
          };
        } else {
          mergedStatuses[k] = base;
        }
      }

      return {
        errorCodes: { ...seed.errorCodes, ...(parsed.errorCodes || {}) },
        statuses: mergedStatuses,
        actions: { ...seed.actions, ...(parsed.actions || {}) },
        tokens: { ...seed.tokens, ...(parsed.tokens || {}) },
        words: { ...seed.words, ...(parsed.words || {}) },
      };
    }
  } catch (e) {
    console.error("[结算字典] 查询数据库 system_config 异常:", e);
  }

  return seed;
}

/**
 * 格式化异常错误码为纯中文（完全由传入的数据库字典驱动）
 */
export function formatSettlementErrorCode(
  errorCode: string | null | undefined,
  dict: SettlementDictPayload
): string {
  if (!errorCode) return "";
  return dict.errorCodes?.[errorCode] || errorCode;
}

/**
 * 将审计与异常排查消息中的英文词汇自动翻译为纯正中文（完全由传入的数据库字典驱动）
 */
export function translateSettlementAuditMessage(
  rawMessage: string | null | undefined,
  dict: SettlementDictPayload
): string {
  if (!rawMessage || typeof rawMessage !== "string") return "";

  let result = rawMessage;

  // 1. 替换方括号中的错误码，例如 [INVALID_USAGE_TOKENS] -> [Token用量参数非法]
  for (const [code, cn] of Object.entries(dict.errorCodes || {})) {
    if (result.includes(`[${code}]`)) {
      result = result.split(`[${code}]`).join(`[${cn}]`);
    }
  }

  // 2. 替换属性名与状态英文，例如 inputTokens -> 输入 Tokens, REFUND -> 原路退款
  for (const [en, cn] of Object.entries(dict.words || {})) {
    if (result.includes(en)) {
      result = result.split(en).join(cn);
    }
  }

  return result;
}
