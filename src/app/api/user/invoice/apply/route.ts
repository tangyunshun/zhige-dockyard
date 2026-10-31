import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 发票申请与开票记录查询（用户侧）
 * 复用 billingrecord 表，以 type="INVOICE_APPLY" 区分。
 *
 * 核心合规业务规则：同一笔数据（交易订单）至多支持开具 2 次发票（含首次开具与修改换开），超出后系统强制拦截。
 *
 * POST /api/user/invoice/apply  提交个人/企业发票开具申请
 * GET  /api/user/invoice/apply  查询当前用户提交的发票申请（支持时间范围、类型、状态筛选与分页）
 */
const INVOICE_TYPE = "INVOICE_APPLY";
const MAX_INVOICE_PER_ORDER = 2;

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      orderNo,
      buyerType = "ENTERPRISE", // "PERSONAL" | "ENTERPRISE"
      title,
      taxNo,
      amountCents,
      email,
      phone,
      idCard,
      bankName,
      bankAccount,
      address,
      tel,
      type = "PLAIN", // "PLAIN" | "VAT"
      goodsName = "*信息技术服务*软件服务费",
      remark,
    } = body;

    // 1. 基础校验
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "请填写发票抬头" }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "请填写格式正确的接收电子发票邮箱" }, { status: 400 });
    }

    // 2. 企业抬头必填税号
    if (buyerType === "ENTERPRISE") {
      if (!taxNo || typeof taxNo !== "string" || taxNo.trim().length < 15) {
        return NextResponse.json({ error: "企业抬头必须提供 15-20 位纳税人识别号/统一社会信用代码" }, { status: 400 });
      }
      if (type === "VAT") {
        if (!bankName || !bankAccount || !address || !tel) {
          return NextResponse.json({ error: "申请增值税专用发票必须完整提供企业基本开户行、银行账号、注册地址和企业电话" }, { status: 400 });
        }
      }
    }

    // 3. 核心限制：同一个数据只支持开票两次
    let invoicedCountForOrder = 0;
    if (orderNo && typeof orderNo === "string" && orderNo.trim()) {
      const trimmedOrder = orderNo.trim();
      const existingApplies = await prisma.billingrecord.findMany({
        where: {
          userId: auth.user.id,
          type: INVOICE_TYPE,
        },
        select: { id: true, metadata: true },
      });

      const matchedCount = existingApplies.filter((item) => {
        const md = (item.metadata as any) || {};
        return md.orderNo === trimmedOrder;
      }).length;

      if (matchedCount >= MAX_INVOICE_PER_ORDER) {
        return NextResponse.json(
          {
            error: `该笔交易已达到 ${MAX_INVOICE_PER_ORDER} 次开票上限（含首次开票与换开），根据财务与税务规范不可再次开票`,
          },
          { status: 400 }
        );
      }
      invoicedCountForOrder = matchedCount + 1;
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
          buyerType: buyerType === "PERSONAL" ? "PERSONAL" : "ENTERPRISE",
          taxNo: typeof taxNo === "string" && taxNo ? taxNo.trim() : null,
          email: email.trim(),
          phone: typeof phone === "string" && phone ? phone.trim() : null,
          idCard: typeof idCard === "string" && idCard ? idCard.trim() : null,
          bankName: typeof bankName === "string" && bankName ? bankName.trim() : null,
          bankAccount: typeof bankAccount === "string" && bankAccount ? bankAccount.trim() : null,
          address: typeof address === "string" && address ? address.trim() : null,
          tel: typeof tel === "string" && tel ? tel.trim() : null,
          invoiceType: type === "VAT" ? "VAT" : "PLAIN",
          goodsName: typeof goodsName === "string" && goodsName ? goodsName.trim() : "*信息技术服务*软件服务费",
          orderNo: typeof orderNo === "string" && orderNo ? orderNo.trim() : null,
          invoiceSequence: invoicedCountForOrder || 1,
          remark: typeof remark === "string" && remark ? remark.trim() : null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `开票申请已提交（第 ${invoicedCountForOrder || 1}/${MAX_INVOICE_PER_ORDER} 次），财务核对后将开具电子发票`,
      apply: {
        id: record.id,
        title: record.title,
        amountCents: record.amount,
        status: record.status,
        invoiceSequence: invoicedCountForOrder || 1,
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

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "10", 10)), 100);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status"); // PENDING | COMPLETED | REJECTED
    const invoiceType = searchParams.get("invoiceType"); // PLAIN | VAT

    const where: any = {
      userId: auth.user.id,
      type: INVOICE_TYPE,
    };

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [total, records] = await Promise.all([
      prisma.billingrecord.count({ where }),
      prisma.billingrecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const list = records
      .map((r) => {
        const md = (r.metadata as any) || {};
        return {
          id: r.id,
          title: r.title,
          buyerType: md.buyerType || "ENTERPRISE",
          taxNo: md.taxNo || null,
          email: md.email || null,
          phone: md.phone || null,
          idCard: md.idCard || null,
          bankName: md.bankName || null,
          bankAccount: md.bankAccount || null,
          address: md.address || null,
          tel: md.tel || null,
          invoiceType: md.invoiceType || "PLAIN",
          goodsName: md.goodsName || "*信息技术服务*软件服务费",
          orderNo: md.orderNo || null,
          invoiceSequence: md.invoiceSequence || 1,
          remark: md.remark || null,
          amountCents: r.amount,
          status: r.status,
          invoiceUrl: r.invoiceUrl,
          createdAt: r.createdAt.toISOString(),
        };
      })
      .filter((item) => {
        if (invoiceType && invoiceType !== "ALL") {
          return item.invoiceType === invoiceType;
        }
        return true;
      });

    return NextResponse.json({
      success: true,
      applies: list,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("查询发票申请失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
