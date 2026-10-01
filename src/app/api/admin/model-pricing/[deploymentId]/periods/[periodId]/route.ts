import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { PRICE_SOURCES, resolvePriceStatus, yuanPerMillionToMicros } from "@/lib/model-pricing";

const PERIOD_KINDS = ["IDLE", "PEAK", "HOLIDAY", "CUSTOM"] as const;
const PRICE_FIELDS = [
  "costInput",
  "costOutput",
  "costCacheRead",
  "costCacheWrite",
  "priceInput",
  "priceOutput",
  "priceCacheRead",
  "priceCacheWrite",
] as const;
const TIME_RE = /^([0-1]?\d|2[0-3]):[0-5]\d$/;

/** 把单条时段行转成微元价格字段映射 */
function rowMicros(row: {
  costInputMicrosPerMillion: number | null;
  costOutputMicrosPerMillion: number | null;
  costCacheReadMicrosPerMillion: number | null;
  costCacheWriteMicrosPerMillion: number | null;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceCacheReadMicrosPerMillion: number | null;
  priceCacheWriteMicrosPerMillion: number | null;
}): Record<string, number | null> {
  return {
    costInput: row.costInputMicrosPerMillion,
    costOutput: row.costOutputMicrosPerMillion,
    costCacheRead: row.costCacheReadMicrosPerMillion,
    costCacheWrite: row.costCacheWriteMicrosPerMillion,
    priceInput: row.priceInputMicrosPerMillion,
    priceOutput: row.priceOutputMicrosPerMillion,
    priceCacheRead: row.priceCacheReadMicrosPerMillion,
    priceCacheWrite: row.priceCacheWriteMicrosPerMillion,
  };
}

/** PATCH：编辑/启用禁用。仅校验提交的字段；价格相关字段变更时价格版本+1 并重算状态 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; periodId: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    const { deploymentId, periodId } = await params;

    const current = await prisma.modelpricingperiod.findUnique({ where: { id: periodId } });
    if (!current || current.deploymentId !== deploymentId) {
      return NextResponse.json({ success: false, error: "时段价格不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const errors: string[] = [];
    const set: Record<string, unknown> = {};
    const micros = rowMicros(current);
    let priceTouched = false;

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) errors.push("时段名称不能为空");
      else if (body.name.trim().length > 50) errors.push("时段名称不超过 50 字");
      else set.name = body.name.trim();
    }
    if (body.kind !== undefined) {
      const k = String(body.kind).trim().toUpperCase();
      if (!(PERIOD_KINDS as readonly string[]).includes(k)) errors.push("时段类型非法");
      else set.kind = k;
    }
    if (body.enabled !== undefined) set.enabled = body.enabled === true || body.enabled === "true";
    if (body.priority !== undefined) {
      if (!Number.isInteger(Number(body.priority))) errors.push("优先级须为整数");
      else set.priority = Number(body.priority);
    }
    if (body.weekdays !== undefined) {
      if (body.weekdays === null || body.weekdays === "" || body.weekdays === undefined) set.weekdays = null;
      else {
        const list = String(body.weekdays).split(",").map((s) => s.trim()).filter(Boolean);
        if (list.some((d) => !Number.isInteger(Number(d)) || Number(d) < 1 || Number(d) > 7))
          errors.push("星期几须为 1-7 的逗号分隔数字");
        else set.weekdays = list.join(",");
      }
    }
    for (const f of ["startTime", "endTime"] as const) {
      if (body[f] === undefined) continue;
      if (body[f] === null || body[f] === "") set[f] = null;
      else if (typeof body[f] !== "string" || !TIME_RE.test(String(body[f]))) errors.push(`${f} 须为 HH:mm 格式`);
      else set[f] = body[f];
    }
    const startV = (set.startTime as string | undefined) ?? current.startTime;
    const endV = (set.endTime as string | undefined) ?? current.endTime;
    if ((startV && !endV) || (!startV && endV)) errors.push("开始/结束时间须同时设置");
    for (const f of ["startDate", "endDate"] as const) {
      if (body[f] === undefined) continue;
      if (body[f] === null || body[f] === "") set[f] = null;
      else {
        const dt = new Date(String(body[f]));
        if (isNaN(dt.getTime())) errors.push(`${f} 日期格式非法`);
        else set[f] = dt;
      }
    }
    if (body.priceSource !== undefined) {
      if (typeof body.priceSource !== "string" || !(PRICE_SOURCES as readonly string[]).includes(body.priceSource))
        errors.push("价格来源非法");
      else set.priceSource = body.priceSource;
    }
    if (body.markupRateBps !== undefined) {
      if (body.markupRateBps === null || body.markupRateBps === "") set.markupRateBps = null;
      else if (!Number.isInteger(Number(body.markupRateBps)) || Number(body.markupRateBps) < 0) errors.push("加价率须为非负整数基点");
      else set.markupRateBps = Number(body.markupRateBps);
    }
    for (const f of PRICE_FIELDS) {
      if (body[f] === undefined) continue;
      if (body[f] === null || body[f] === "") {
        micros[f] = null;
        priceTouched = true;
      } else {
        const n = Number(body[f]);
        if (isNaN(n) || n < 0) errors.push(`${f} 须为非负数字`);
        else {
          micros[f] = yuanPerMillionToMicros(n);
          priceTouched = true;
        }
      }
    }

    if (errors.length > 0) return NextResponse.json({ success: false, error: errors.join("；") }, { status: 400 });

    if (priceTouched) {
      set.priceStatus = resolvePriceStatus({
        priceSource: ((set.priceSource as string) ?? current.priceSource) as never,
        costValues: [micros.costInput, micros.costOutput, micros.costCacheRead, micros.costCacheWrite],
        priceValues: [micros.priceInput, micros.priceOutput, micros.priceCacheRead, micros.priceCacheWrite],
      });
      set.priceVersion = current.priceVersion + 1;
    }
    // 把微元价格字段写回
    set.costInputMicrosPerMillion = micros.costInput;
    set.costOutputMicrosPerMillion = micros.costOutput;
    set.costCacheReadMicrosPerMillion = micros.costCacheRead;
    set.costCacheWriteMicrosPerMillion = micros.costCacheWrite;
    set.priceInputMicrosPerMillion = micros.priceInput;
    set.priceOutputMicrosPerMillion = micros.priceOutput;
    set.priceCacheReadMicrosPerMillion = micros.priceCacheRead;
    set.priceCacheWriteMicrosPerMillion = micros.priceCacheWrite;

    const row = await prisma.modelpricingperiod.update({ where: { id: periodId }, data: set });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[model-pricing-period] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "更新时段价格失败" }, { status: 500 });
  }
}

/** DELETE：删除一条时段价格 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; periodId: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    const { deploymentId, periodId } = await params;
    const current = await prisma.modelpricingperiod.findUnique({ where: { id: periodId } });
    if (!current || current.deploymentId !== deploymentId) {
      return NextResponse.json({ success: false, error: "时段价格不存在" }, { status: 404 });
    }
    await prisma.modelpricingperiod.delete({ where: { id: periodId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[model-pricing-period] 删除失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "删除时段价格失败" }, { status: 500 });
  }
}
