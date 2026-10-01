/**
 * 组件成本/工时「真实历史基准」存取（数据驱动，替代硬编码假设）
 *
 * 设计：
 *  - 基准存入既有的 systemconfig 键值表（键 = COST_BASELINE_CONFIG_KEY），**无需数据库迁移**；
 *  - 未配置 / 配置非法时返回 null，由调用方回退到合同内的**显式参考基准假设**（并明确标注为假设值）；
 *  - 只读消费：本模块不写库；写入由 `scripts/set-cost-baseline.ts` 显式完成。
 *
 * 合同侧通过在 promptTemplate 中声明 `{{COST_BASELINE}}` 占位符来消费本基准（由生产路由注入）。
 */

import { prisma } from "@/lib/prisma";

export const COST_BASELINE_CONFIG_KEY = "COMPONENT_COST_BASELINE";
export const COST_BASELINE_PLACEHOLDER = "{{COST_BASELINE}}";

export interface CostBaseline {
  /** 人月单价（元/人月） */
  personMonthYuan: number;
  /** 云与硬件资源成本区间（元） */
  cloudHardwareRangeYuan: [number, number];
  /** 项目管理与测试占开发工时比例（%） */
  pmTestRatioPercent: number;
  /** 数据来源说明（必须真实可追溯，如「2024-2025 交付项目工时台账」） */
  source: string;
  /** 基准更新时间（ISO） */
  updatedAt: string;
}

/** 读取真实历史基准；未配置或结构非法时返回 null（绝不猜测、绝不伪造） */
export async function getComponentCostBaseline(): Promise<CostBaseline | null> {
  const row = await prisma.systemconfig.findUnique({ where: { key: COST_BASELINE_CONFIG_KEY } });
  const raw = row?.value;
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateCostBaseline(parsed);
}

export function validateCostBaseline(input: unknown): CostBaseline | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const personMonthYuan = Number(o.personMonthYuan);
  const ratio = Number(o.pmTestRatioPercent);
  const range = o.cloudHardwareRangeYuan;
  const source = typeof o.source === "string" ? o.source.trim() : "";
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt.trim() : "";
  if (!Number.isFinite(personMonthYuan) || personMonthYuan <= 0) return null;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) return null;
  if (!Array.isArray(range) || range.length !== 2) return null;
  const lo = Number(range[0]);
  const hi = Number(range[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi < lo) return null;
  if (!source) return null;
  if (!updatedAt || isNaN(Date.parse(updatedAt))) return null;
  return { personMonthYuan, cloudHardwareRangeYuan: [lo, hi], pmTestRatioPercent: ratio, source, updatedAt };
}

/**
 * 渲染注入到模型提示词中的基准文本。
 * 未配置真实基准时，返回**显式假设**文本（必须由模型在报告中标注为假设值）。
 */
export function renderCostBaselineText(baseline: CostBaseline | null): string {
  if (!baseline) {
    return (
      "参考基准假设（未接入真实历史数据集，以下为假设值而非客户实测数据，必须在报告中逐条声明）：\n" +
      "人月单价按 2.0 万元/人月；云与硬件资源按项目规模 3~12 万元区间；项目管理与测试占比按开发工时的 15%。"
    );
  }
  return (
    `真实历史基准（来源：${baseline.source}，更新于 ${baseline.updatedAt}）：\n` +
    `人月单价 ${baseline.personMonthYuan} 元/人月；云与硬件资源区间 ${baseline.cloudHardwareRangeYuan[0]}~${baseline.cloudHardwareRangeYuan[1]} 元；` +
    `项目管理与测试占比 ${baseline.pmTestRatioPercent}%。\n请在计算依据中注明该基准来源。`
  );
}
