import { prisma } from "@/lib/prisma";
import seedDictJson from "../../prisma/data/billing-dict.json";

/**
 * 账单 / 算力点流水「显示字典」（字段名、字段值、词根的中文标签）
 * 遵循知阁·舟坊设计系统标准：运行时 100% 以数据库 system_config.billing_display_dict 存储的配置为准。
 * 严禁在代码中写死任何业务字典数据！本文件的 JSON 种子仅作为「首次落库默认值 + 兜底」，
 * 管理员可在库内直接覆盖/扩展标签，无需改代码。
 */
export interface BillingDictPayload {
  fields: Record<string, string>;
  values: Record<string, string>;
  words: Record<string, string>;
}

export const SYSTEM_CONFIG_KEY = "billing_display_dict";

/**
 * 懒种子落库：若数据库尚未初始化或内容残缺，自动将外部 JSON 字典写入数据库 system_config 表持久化
 */
export async function ensureBillingDictSeeded(): Promise<void> {
  try {
    const seedData = seedDictJson as unknown as BillingDictPayload;
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
    console.warn("[账单字典] 懒种子落库 system_config 异常:", e);
  }
}

/**
 * 核心方法：100% 从数据库 system_config 表动态查询账单显示字典
 * 机制：以数据库中的实时配置为第一真源，若库中配置残缺或缺失，自动完成数据库自愈并返回完整字典！
 */
export async function getBillingDictFromDb(): Promise<BillingDictPayload> {
  const seed = seedDictJson as unknown as BillingDictPayload;

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

    // 完整性校验：必须含 fields 与非空 values
    const isComplete =
      parsed &&
      typeof parsed === "object" &&
      parsed.fields &&
      typeof parsed.fields === "object" &&
      parsed.values &&
      typeof parsed.values === "object" &&
      Object.keys(parsed.values).length > 0;

    // 若库中不存在或数据不完整，立即执行数据库自愈（落库种子），再读回
    if (!isComplete) {
      await ensureBillingDictSeeded();
      record = await prisma.systemconfig.findUnique({
        where: { key: SYSTEM_CONFIG_KEY },
      });
      if (record?.value) {
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed) {
      // 数据库优先：保留数据库中自定义标签，合并种子补齐缺失键
      return {
        fields: { ...seed.fields, ...(parsed.fields || {}) },
        values: { ...seed.values, ...(parsed.values || {}) },
        words: { ...seed.words, ...(parsed.words || {}) },
      };
    }
  } catch (e) {
    console.error("[账单字典] 查询数据库 system_config 异常:", e);
  }

  return seed;
}
