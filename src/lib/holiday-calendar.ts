/**
 * 中国法定节假日日历（数据驱动，按年扩展）。
 *
 * 用途：模型分时计价中「法定节假日」自动套用闲时价 —— 无需为每个节假日各写一条时段，
 * 只要存在一条 kind=HOLIDAY 且未填日期/星期/时间的「自动节假日」时段，系统就会按本日历
 * 在当年及后续已配置年份的官方节假日当天自动命中该时段（优先级最高，覆盖高峰）。
 *
 * 扩展方式：国务院每年 11 月左右公布下一年安排后，在 HOLIDAY_CALENDAR 中追加对应年份即可，
 * 解析逻辑会自动对该年及以后的节假日生效。日期为「中国日历日」（含调休放假区间，不含补班日）。
 * 补班日（调休上班的周末）不在区间内，高峰窗口 weekdays=1-5 本就不命中，自动按闲时计费。
 *
 * 数据来源：国务院办公厅《关于 2026 年部分节假日安排的通知》（国办发明电〔2025〕7号，已核实）。
 */
export interface HolidayDef {
  /** 节假日名称 */
  name: string;
  /** 放假起始（含），YYYY-MM-DD，中国日历日 */
  start: string;
  /** 放假结束（含），YYYY-MM-DD，中国日历日 */
  end: string;
}

export const HOLIDAY_CALENDAR: Record<number, HolidayDef[]> = {
  2026: [
    { name: "元旦", start: "2026-01-01", end: "2026-01-03" },
    { name: "春节", start: "2026-02-15", end: "2026-02-23" },
    { name: "清明节", start: "2026-04-04", end: "2026-04-06" },
    { name: "劳动节", start: "2026-05-01", end: "2026-05-05" },
    { name: "端午节", start: "2026-06-19", end: "2026-06-21" },
    { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
    { name: "国庆节", start: "2026-10-01", end: "2026-10-07" },
  ],
};

/** 把 Date 转成中国日历日的 YYYYMMDD 整数（避免服务端时区干扰） */
function chinaDayNum(d: Date): number {
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  return cn.getUTCFullYear() * 10000 + (cn.getUTCMonth() + 1) * 100 + cn.getUTCDate();
}

/** 该时刻是否处于中国法定节假日（按本日历已配置的年份） */
export function isHoliday(now: Date): boolean {
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  const year = cn.getUTCFullYear();
  const defs = HOLIDAY_CALENDAR[year];
  if (!defs || defs.length === 0) return false;
  const cur = chinaDayNum(now);
  for (const h of defs) {
    const s = Number(h.start.replace(/-/g, ""));
    const e = Number(h.end.replace(/-/g, ""));
    if (cur >= s && cur <= e) return true;
  }
  return false;
}

/** 返回该时刻命中的节假日定义（无则 null） */
export function getHolidayForDate(now: Date): HolidayDef | null {
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  const year = cn.getUTCFullYear();
  const defs = HOLIDAY_CALENDAR[year];
  if (!defs || defs.length === 0) return null;
  const cur = chinaDayNum(now);
  for (const h of defs) {
    const s = Number(h.start.replace(/-/g, ""));
    const e = Number(h.end.replace(/-/g, ""));
    if (cur >= s && cur <= e) return h;
  }
  return null;
}

/** 列出当前年及后续已配置年份的全部节假日（供后台展示「自动覆盖哪些日期」） */
export function listConfiguredHolidays(fromYear = new Date().getFullYear()): { year: number; items: HolidayDef[] }[] {
  return Object.keys(HOLIDAY_CALENDAR)
    .map(Number)
    .filter((y) => y >= fromYear)
    .sort((a, b) => a - b)
    .map((year) => ({ year, items: HOLIDAY_CALENDAR[year] }));
}
