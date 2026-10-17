import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 发票申请（用户侧）
 * 复用 billingrecord 表，以 type="INVOICE_APPLY" 区分，避免新增表与 Prisma 客户端重新生成。
 *
 * POST /api/user/invoice/apply  提交开票申请
 * GET  /api/user/invoice/apply  查询当前用户提交的发票申请
 */
const INVOICE_TYPE = "INVOICE_APPLY";

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { orderNo, title, taxNo, amountCents, email, type, remark } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "请填写发票抬头" }, { status: 400 });
    }

    const record = await prisma.billingrecord.create({
      data: {
        id: crypto.randomUUID(),
        userId: auth.user.id,
        type: INVOICE_TYPE,
        title: title.trim(),
        amount: Number(amountCents) > 0 ? Math.floor(Number(amountCents)) : 0,
        currency: "CNY",
        status: "PENDING",
        invoiceUrl: null,
        metadata: {
          taxNo: typeof taxNo === "string" && taxNo ? taxNo.trim() : null,
          email: typeof email === "string" && email ? email.trim() : null,
          invoiceType: type === "PLAIN" ? "PLAIN" : "VAT",
          orderNo: typeof orderNo === "string" && orderNo ? orderNo : null,
          remark: typeof remark === "string" && remark ? remark.trim() : null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "开票申请已提交，财务核对后将开具电子发票",
      apply: {
        id: record.id,
        title: record.title,
        amountCents: record.amount,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("提交发票申请失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const records = await prisma.billingrecord.findMany({
      where: { userId: auth.user.id, type: INVOICE_TYPE },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const list = records.map((r) => {
      const md = (r.metadata as any) || {};
      return {
        id: r.id,
        title: r.title,
        taxNo: md.taxNo || null,
        email: md.email || null,
        invoiceType: md.invoiceType || "VAT",
        orderNo: md.orderNo || null,
        remark: md.remark || null,
        amountCents: r.amount,
        status: r.status,
        invoiceUrl: r.invoiceUrl,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, applies: list });
  } catch (error) {
    console.error("查询发票申请失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
