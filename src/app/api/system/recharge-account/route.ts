export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/system/recharge-account —— 读取平台官方对公转账收款账户
 *
 * 账户信息统一存于 systemconfig（key=officialRechargeAccount，JSON），
 * 不再写死在前端代码中，管理员可经 /api/admin/system/recharge-account 动态修改。
 * 未配置时返回空 account，前端展示「尚未配置」提示，绝不写死兜底文案。
 */
const KEY = "officialRechargeAccount";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const systemConfig = (prisma as any).systemconfig;
    if (!systemConfig) return NextResponse.json({ success: true, account: null });

    const row = await systemConfig.findUnique({ where: { key: KEY } }).catch(() => null);
    let account: any = null;
    if (row?.value) {
      try {
        account = JSON.parse(row.value);
      } catch {
        account = null;
      }
    }

    // 字段名归一化：兼容历史 bankAccount / remarkHint 命名，统一对外暴露 accountNumber / remark
    if (account && typeof account === "object") {
      if (!account.accountNumber && account.bankAccount) account.accountNumber = account.bankAccount;
      if (!account.remark && account.remarkHint) account.remark = account.remarkHint;
    }

    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error("[recharge-account] 读取失败:", (error as Error)?.message);
    return NextResponse.json({ success: true, account: null });
  }
}
