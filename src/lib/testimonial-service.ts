import { prisma } from "@/lib/prisma";
import type { Testimonial, TestimonialCategory } from "@/lib/testimonials";

/**
 * 首页「用户评价」服务层
 * ==================================================================
 * 职责：分组管理 + 每周自动轮换 + 公开读取（供首页与后台共用）
 *
 * 轮换机制（无需外部定时任务）：
 *   采用「读取时惰性轮换」——每次读取当前展示组时，若距上次轮换已满 7 天，
 *   自动推进到下一组并回写轮换时间。这样不依赖 cron / 计划任务，
 *   多实例下也能保证最终一致（略有并发冗余，但结果幂等）。
 */

/** 展示分组总数（1..TESTIMONIAL_GROUP_COUNT） */
export const TESTIMONIAL_GROUP_COUNT = 5;

/** 自动轮换周期：7 天 */
export const TESTIMONIAL_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 复用项目既有 system_config 键值表存储轮换状态 */
export const TESTIMONIAL_CONFIG_KEYS = {
  mode: "testimonial_rotation_mode", // auto | manual
  activeGroup: "testimonial_active_group", // "1".."5"
  lastRotatedAt: "testimonial_last_rotated_at", // ISO 时间字符串
} as const;

export type RotationMode = "auto" | "manual";

export interface RotationState {
  mode: RotationMode;
  /** 当前展示组（1..5） */
  activeGroup: number;
  /** 上次轮换时间（ISO），auto 模式下用于计算下次轮换 */
  lastRotatedAt: string | null;
  /** 下次自动轮换时间（ISO），manual 模式为 null */
  nextRotateAt: string | null;
}

export interface PublicTestimonialsPayload {
  groupNo: number;
  mode: RotationMode;
  nextRotateAt: string | null;
  testimonials: Testimonial[];
  /** 数据来源：db=数据库；fallback=当前组为空时回退到的其它组 */
  source: "db" | "fallback-group";
}

async function readConfig(key: string): Promise<string | null> {
  const row = await prisma.systemconfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeConfig(key: string, value: string): Promise<void> {
  await prisma.systemconfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

function clampGroup(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(TESTIMONIAL_GROUP_COUNT, Math.max(1, Math.trunc(value)));
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

/** 数据库记录 ➔ 前端展示结构 */
function toTestimonial(row: {
  id: string;
  category: string;
  name: string;
  role: string | null;
  org: string | null;
  avatar: string | null;
  rating: number;
  content: string;
  tags: unknown;
  highlightLabel: string | null;
  highlightValue: string | null;
}): Testimonial {
  const category: TestimonialCategory = row.category === "enterprise" ? "enterprise" : "personal";
  return {
    id: row.id,
    category,
    name: row.name,
    role: row.role || "",
    org: row.org || undefined,
    avatar: row.avatar || undefined,
    avatarText: row.name.trim().charAt(0) || "评",
    rating: row.rating,
    content: row.content,
    tags: normalizeTags(row.tags),
    highlight:
      row.highlightLabel && row.highlightValue
        ? { label: row.highlightLabel, value: row.highlightValue }
        : undefined,
  };
}

/** 读取轮换状态（不做惰性推进） */
export async function getRotationState(): Promise<RotationState> {
  const [modeRaw, groupRaw, lastRaw] = await Promise.all([
    readConfig(TESTIMONIAL_CONFIG_KEYS.mode),
    readConfig(TESTIMONIAL_CONFIG_KEYS.activeGroup),
    readConfig(TESTIMONIAL_CONFIG_KEYS.lastRotatedAt),
  ]);

  const mode: RotationMode = modeRaw === "manual" ? "manual" : "auto";
  const activeGroup = clampGroup(Number(groupRaw ?? 1));
  const lastRotatedAt = lastRaw || null;
  const nextRotateAt =
    mode === "auto" && lastRotatedAt
      ? new Date(Date.parse(lastRotatedAt) + TESTIMONIAL_ROTATION_INTERVAL_MS).toISOString()
      : null;

  return { mode, activeGroup, lastRotatedAt, nextRotateAt };
}

/** 手动指定当前展示组（并重置轮换计时点） */
export async function setActiveGroup(groupNo: number): Promise<RotationState> {
  const group = clampGroup(groupNo);
  await writeConfig(TESTIMONIAL_CONFIG_KEYS.activeGroup, String(group));
  await writeConfig(TESTIMONIAL_CONFIG_KEYS.lastRotatedAt, new Date().toISOString());
  return getRotationState();
}

/** 切换轮换模式；切到 auto 时重置计时点，避免立刻触发轮换 */
export async function setRotationMode(mode: RotationMode): Promise<RotationState> {
  await writeConfig(TESTIMONIAL_CONFIG_KEYS.mode, mode === "manual" ? "manual" : "auto");
  if (mode === "auto") {
    await writeConfig(TESTIMONIAL_CONFIG_KEYS.lastRotatedAt, new Date().toISOString());
  }
  return getRotationState();
}

/** 惰性周轮换：auto 模式下满 7 天才推进，返回推进后的状态 */
export async function ensureActiveGroup(): Promise<RotationState> {
  const state = await getRotationState();

  if (state.mode !== "auto") return state;

  const last = state.lastRotatedAt ? Date.parse(state.lastRotatedAt) : Number.NaN;
  const now = Date.now();

  // 首次运行或时间缺失：仅落一个计时起点，不轮换
  if (!Number.isFinite(last)) {
    const startedAt = new Date(now).toISOString();
    await writeConfig(TESTIMONIAL_CONFIG_KEYS.lastRotatedAt, startedAt);
    return { ...state, lastRotatedAt: startedAt, nextRotateAt: new Date(now + TESTIMONIAL_ROTATION_INTERVAL_MS).toISOString() };
  }

  const elapsed = now - last;
  if (elapsed < TESTIMONIAL_ROTATION_INTERVAL_MS) return state;

  // 停机超过多个周期时一次性补齐（避免逐周循环）
  const steps = Math.floor(elapsed / TESTIMONIAL_ROTATION_INTERVAL_MS);
  const nextGroup = ((state.activeGroup - 1 + steps) % TESTIMONIAL_GROUP_COUNT) + 1;
  const newLastRotatedAt = new Date(last + steps * TESTIMONIAL_ROTATION_INTERVAL_MS).toISOString();

  await Promise.all([
    writeConfig(TESTIMONIAL_CONFIG_KEYS.activeGroup, String(nextGroup)),
    writeConfig(TESTIMONIAL_CONFIG_KEYS.lastRotatedAt, newLastRotatedAt),
  ]);

  return {
    mode: "auto",
    activeGroup: nextGroup,
    lastRotatedAt: newLastRotatedAt,
    nextRotateAt: new Date(Date.parse(newLastRotatedAt) + TESTIMONIAL_ROTATION_INTERVAL_MS).toISOString(),
  };
}

/** 读取指定分组的可见评价 */
export async function getGroupTestimonials(groupNo: number): Promise<Testimonial[]> {
  const rows = await prisma.testimonial.findMany({
    where: { groupNo: clampGroup(groupNo), status: "active" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toTestimonial);
}

/** 公开读取：惰性轮换 + 当前组评价（当前组为空时回退到最近的非空组） */
export async function getPublicTestimonials(): Promise<PublicTestimonialsPayload> {
  const state = await ensureActiveGroup();

  let groupNo = state.activeGroup;
  let testimonials = await getGroupTestimonials(groupNo);
  let source: PublicTestimonialsPayload["source"] = "db";

  if (testimonials.length === 0) {
    // 回退：优先取当前组之后的组，保证轮换期间不会出现空白
    for (let offset = 1; offset < TESTIMONIAL_GROUP_COUNT; offset++) {
      const candidate = ((groupNo - 1 + offset) % TESTIMONIAL_GROUP_COUNT) + 1;
      const list = await getGroupTestimonials(candidate);
      if (list.length > 0) {
        testimonials = list;
        groupNo = candidate;
        source = "fallback-group";
        break;
      }
    }
  }

  return { groupNo, mode: state.mode, nextRotateAt: state.nextRotateAt, testimonials, source };
}

/** 后台用：各分组条目统计（含隐藏） */
export async function getGroupSummaries(): Promise<
  { groupNo: number; total: number; active: number }[]
> {
  const rows = await prisma.testimonial.groupBy({
    by: ["groupNo"],
    _count: { _all: true },
  });
  const activeRows = await prisma.testimonial.groupBy({
    by: ["groupNo"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const totalMap = new Map(rows.map((r) => [r.groupNo, r._count._all]));
  const activeMap = new Map(activeRows.map((r) => [r.groupNo, r._count._all]));

  return Array.from({ length: TESTIMONIAL_GROUP_COUNT }, (_, i) => {
    const groupNo = i + 1;
    return {
      groupNo,
      total: totalMap.get(groupNo) ?? 0,
      active: activeMap.get(groupNo) ?? 0,
    };
  });
}
