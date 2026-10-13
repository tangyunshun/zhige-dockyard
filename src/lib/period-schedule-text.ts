/**
 * 计价时段「生效范围」文案 —— 全站唯一来源。
 *
 * model-registry（服务端结算/展示）、公开定价页、管理后台各自曾复制一份同名逻辑，
 * 导致闲时/高峰/节假日描述口径不一致（例如闲时被兜底成「全时段」）。
 * 现统一收敛到本文件，任何页面渲染时段文案都应调用 formatPeriodSchedule，
 * 禁止在页面里再写一份。
 *
 * 约定（与 DeepSeek 等主流模型分时口径对齐）：
 *  - 闲时（IDLE，无约束）= 除高峰时段外的所有时间（含周末及法定节假日全天）
 *  - 高峰（PEAK，工作日窗口）= 周一至周五 HH:mm–HH:mm（不含法定节假日）
 *  - 节假日（HOLIDAY，自动）= 中国法定节假日全天（由 holiday-calendar 按官方日历命中）
 */
export interface PeriodScheduleInput {
  kind: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  weekdays?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

const WEEKDAY_LABEL = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatPeriodSchedule(p: PeriodScheduleInput): string {
  // 自动节假日时段：无日期/星期/时间约束，仅在法定节假日当天命中（由 holiday-calendar 驱动）
  if (p.kind === "HOLIDAY" && !p.startDate && !p.endDate && !p.weekdays && !p.startTime && !p.endTime) {
    return "中国法定节假日全天";
  }

  const parts: string[] = [];

  if (p.startDate || p.endDate) {
    const fmt = (d: Date | null) =>
      d ? `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}` : "";
    const sd = toDate(p.startDate);
    const ed = toDate(p.endDate);
    if (sd && ed) parts.push(`${fmt(sd)}–${fmt(ed)}`);
    else if (sd) parts.push(`${fmt(sd)} 起`);
    else if (ed) parts.push(`至 ${fmt(ed)}`);
  }

  let weekdayPrefix = "";
  if (p.weekdays) {
    const days = p.weekdays
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= 7);
    if (days.length === 7) weekdayPrefix = "每天";
    else if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) weekdayPrefix = "周一至周五";
    else if (days.length === 2 && days.includes(6) && days.includes(7)) weekdayPrefix = "周末";
    else if (days.length > 0) weekdayPrefix = days.map((d) => WEEKDAY_LABEL[d]).join("/");
    if (weekdayPrefix) parts.push(weekdayPrefix);
  }

  if (p.startTime && p.endTime) parts.push(`${p.startTime}–${p.endTime}`);

  // 兜底：无约束的闲时必须明确为「除高峰外的所有时间」，
  // 否则与高峰并存时显示「全时段」会自相矛盾
  if (parts.length === 0) {
    if (p.kind === "IDLE") return "除高峰时段外的所有时间（含周末及法定节假日全天）";
    return p.kind === "HOLIDAY" ? "法定节假日" : "全时段";
  }

  let text = parts.join(" ");
  // 高峰窗口本就不含法定节假日（节假日自动套用闲时价，见 periodMatchesNow / isHoliday），显式说明避免误读
  if (p.kind === "PEAK" && weekdayPrefix === "周一至周五") {
    text += "（不含法定节假日）";
  }
  return text;
}

/** 单个时段展示项（仅需 kind 与已生成的 scheduleText） */
export interface TierPeriodLike {
  kind: string;
  scheduleText?: string | null;
}

/**
 * 把同一类型（如高峰）下多条时段的 scheduleText 合并成一条：
 * 高峰常拆成 09:00–12:00 / 14:00–18:00 两条，合并后为「周一至周五 09:00–12:00、14:00–18:00（不含法定节假日）」，
 * 避免「周一至周五 09:00–12:00（不含法定节假日）、周一至周五 14:00–18:00（不含法定节假日）」式重复。
 * 解析失败时回退为逐条拼接。
 */
export function buildTierCaption(kind: string, group: TierPeriodLike[], fallback: string): string {
  const texts = group.map((p) => p.scheduleText).filter(Boolean) as string[];
  if (texts.length === 0) return fallback;
  if (kind !== "PEAK") return texts.join("、");

  const re = /^(.*?)(\d{1,2}:\d{2})–(\d{1,2}:\d{2})(.*)$/;
  const parsed = texts.map((t) => {
    const m = t.match(re);
    return m ? { prefix: m[1].trim(), window: `${m[2]}–${m[3]}`, suffix: m[4] } : null;
  });
  if (parsed.every((x) => x)) {
    const first = parsed[0] as NonNullable<typeof parsed[number]>;
    const windows = parsed.map((x) => (x as NonNullable<typeof x>).window).join("、");
    return `${first.prefix} ${windows}${first.suffix}`;
  }
  return texts.join("、");
}
