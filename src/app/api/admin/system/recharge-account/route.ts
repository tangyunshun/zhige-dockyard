export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/role-utils";

/**
 * PUT /api/admin/system/recharge-account —— 管理员动态配置官方对公转账收款账户
 *
 * body: { companyName, bankName, bankAccount, remarkHint? }
 * 写入 systemconfig（key=officialRechargeAccount，JSON），前端「对公转账/企业充值」页实时读取。
 */
const KEY = "officialRechargeAccount";

export async function PUT(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "仅平台管理员可配置对公收款账户" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      companyName?: string;
      bankName?: string;
      bankAccount?: string;
      remarkHint?: string;
    };

    // 兼容历史命名：前端可能提交 bankAccount / remarkHint，统一输出为 accountNumber / remark
    const bankAccountRaw =
      typeof body.bankAccount === "string" && body.bankAccount.trim()
        ? body.bankAccount.trim()
        : typeof (body as any).accountNumber === "string" && (body as any).accountNumber.trim()
          ? (body as any).accountNumber.trim()
          : "";
    const remarkRaw =
      typeof body.remarkHint === "string" && body.remarkHint.trim()
        ? body.remarkHint.trim()
        : typeof (body as any).remark === "string" && (body as any).remark.trim()
          ? (body as any).remark.trim()
          : "转账汇款时务必在「转账附言/备注」中注明充值工单号";

    const account = {
      companyName: typeof body.companyName === "string" ? body.companyName.trim() : "",
      bankName: typeof body.bankName === "string" ? body.bankName.trim() : "",
      accountNumber: bankAccountRaw,
      remark: remarkRaw,
    };

    if (!account.companyName || !account.bankName || !account.accountNumber) {
      return NextResponse.json(
        { error: "户名、开户银行、银行账号均为必填项" },
        { status: 400 },
      );
    }

    const systemConfig = (prisma as any).systemconfig;
    if (!systemConfig) return NextResponse.json({ error: "配置表不可用" }, { status: 500 });

    await systemConfig.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(account) },
      update: { value: JSON.stringify(account) },
    });

    return NextResponse.json({ success: true, account, message: "对公收款账户已更新" });
  } catch (error) {
    console.error("[admin/recharge-account] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ error: (error as Error)?.message || "更新对公账户失败" }, { status: 500 });
  }
}
