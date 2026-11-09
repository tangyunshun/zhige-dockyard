﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";
import { verifyInstallGrant } from "@/lib/install-auth";

/**
 * 初始化首个超级管理员（安装向导第二步）。
 *
 * 安全约束（U05-4）：
 * - 必须携带由「verify-setup-token」基于已批准 SETUP_TOKEN 签发的短期一次性安装授权，
 *   缺失/伪造/过期/用途不符一律拒绝（fail-closed，不开放匿名建管理员）。
 * - 不新增第二份静态安装秘密：授权校验与创建动作共用同一套 SETUP_TOKEN 派生体系。
 * - 仅能初始化一次：事务内「空库检查 + 唯一认领 + 用户创建」一起提交；并发/重放第二笔
 *   因非空库或唯一键冲突整笔回滚，杜绝双建。
 * - 使用 Prisma create（按当前 User Entity 字段名写入），不再混用原始 SQL 的 created_at/createdAt。
 * - 测试使用空隔离模型，不得读取真实 setup key、不得创建真实管理员。
 */
export async function POST(request: NextRequest) {
  try {
    const { name, email, phone, password, initToken } = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      initToken?: string;
    };

    // 1) 已批准的安装授权：签名/用途/有效期校验（fail-closed）。
    // 一次性由第 3 步事务内的持久认领保证：创建成功后重放同一授权必被空库/唯一键拒绝。
    const grant = verifyInstallGrant(initToken);
    if (!grant.ok) {
      return NextResponse.json(
        { message: grant.error || "缺少或无效的安装授权，禁止创建管理员" },
        { status: 403 },
      );
    }

    // 2) 基础字段校验
    if (!name || !password) {
      return NextResponse.json({ message: "缺少用户名或密码" }, { status: 400 });
    }
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { message: "密码强度不足", error: passwordValidation.error },
        { status: 400 },
      );
    }

    const hashedPassword = await hashPassword(password);

    // 3) 原子初始化：事务内认领唯一键 + 创建用户，并发第二笔整笔回滚
    const user = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.user.count();
      if (existing > 0) throw new Error("ALREADY_INITIALIZED");
      // 唯一键认领：已存在则唯一冲突 -> 整笔回滚，确保只能初始化一次
      try {
        await tx.systemconfig.create({
          data: { key: "system.init.completed", value: new Date().toISOString() },
        });
      } catch {
        throw new Error("ALREADY_INITIALIZED");
      }
      return await tx.user.create({
        data: {
          name,
          email: email || null,
          phone: phone || null,
          password: hashedPassword,
          role: "SUPER_ADMIN",
        },
        select: { id: true, name: true, email: true, role: true },
      });
    });

    return NextResponse.json({
      success: true,
      message: "初始管理员创建成功",
      user,
    });
  } catch (error: any) {
    if (error?.message === "ALREADY_INITIALIZED") {
      return NextResponse.json(
        { message: "系统已初始化，无法重复创建初始管理员" },
        { status: 400 },
      );
    }
    console.error("Init admin error:", error);
    return NextResponse.json({ message: "初始化管理员失败" }, { status: 500 });
  }
}
