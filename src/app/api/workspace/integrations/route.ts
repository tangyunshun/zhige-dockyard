import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * 工作空间集成 / 模型凭证接口
 *
 * 阶段一安全整改：
 *  - GET：工作空间 owner（即使没有 workspacemember 记录）必须可读取自己空间的集成；
 *        其他成员按现有权限读取脱敏信息；非成员返回 403；
 *  - POST：仅 OWNER / ADMIN 可写入；同一 workspaceId + provider 使用 upsert，
 *          重新配置不返回唯一约束 500；
 *  - 凭证使用服务端可解密加密（AES-256-GCM）存储，绝不返回明文；
 *  - 前端可提交 credentials 或 tokenValue（后端统一读取并处理）；
 *  - 本阶段集成凭证不接入真实模型执行（真实模型由服务端环境变量统一配置）。
 */

const ALGO = "aes-256-gcm";

function getCryptKey(): Buffer {
  const secret = process.env.INTEGRATION_CRYPT_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("缺少加密密钥（INTEGRATION_CRYPT_KEY / JWT_SECRET）");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredentials(plain: string): string {
  const key = getCryptKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function maskCredentials(plain: string): string {
  if (!plain) return "";
  const head = plain.slice(0, 4);
  return head ? `${head}••••••（共 ${plain.length} 字符）` : `len:${plain.length}`;
}

// GET：owner（即使无 member 记录）或成员可读取本空间集成列表（脱敏，绝不返回明文凭证）
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const userId = token.id as string;

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!ws) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });

    const isOwner = ws.ownerId === userId;
    if (!isOwner) {
      const member = await prisma.workspacemember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { role: true },
      });
      if (!member) {
        return NextResponse.json({ error: "您不属于该工作空间，无权读取集成配置" }, { status: 403 });
      }
    }

    const integrations = await prisma.integration.findMany({
      where: { workspaceId },
      select: {
        id: true,
        provider: true,
        name: true,
        configured: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ integrations });
  } catch (error) {
    console.error("获取集成列表失败:", error);
    return NextResponse.json({ error: "获取集成列表失败" }, { status: 500 });
  }
}

// POST：仅空间 OWNER / ADMIN 可写入；同 workspaceId+provider 使用 upsert，不返回唯一约束 500
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const userId = token.id as string;

    const body = (await req.json()) as {
      provider?: string;
      name?: string;
      workspaceId?: string;
      credentials?: unknown;
      tokenValue?: unknown;
    };
    const { provider, name, workspaceId, credentials, tokenValue } = body;
    if (!provider || !name || !workspaceId) {
      return NextResponse.json({ error: "缺少必填字段（provider / name / workspaceId）" }, { status: 400 });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!ws) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });

    const member = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    });
    const isOwner = ws.ownerId === userId;
    const isAdmin = member?.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "仅空间所有者或管理员可配置集成凭证" }, { status: 403 });
    }

    const rawCreds = credentials ?? tokenValue ?? null;
    let encrypted = "";
    let configured = false;
    let mask: string | null = null;
    if (rawCreds != null) {
      const plain = typeof rawCreds === "string" ? rawCreds : JSON.stringify(rawCreds);
      try {
        encrypted = encryptCredentials(plain);
        configured = true;
        mask = maskCredentials(plain);
      } catch {
        return NextResponse.json({ error: "凭证加密失败，无法保存" }, { status: 500 });
      }
    }

    // 同一 workspaceId + provider 使用 upsert：重新配置不会因唯一约束返回 500
    const integration = await prisma.integration.upsert({
      where: { workspaceId_provider: { workspaceId, provider } },
      create: {
        id: crypto.randomUUID(),
        workspaceId,
        provider,
        name,
        tokenHash: encrypted,
        configured,
        updatedAt: new Date(),
      },
      update: {
        name,
        tokenHash: encrypted,
        configured,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      integration: {
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        configured: integration.configured,
        // 脱敏摘要，绝不返回明文凭证
        credentialMask: mask,
      },
    });
  } catch (error: any) {
    // 兜底：唯一约束等已知冲突不应暴露为 500
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "该工作空间下已存在相同 provider 的集成配置" }, { status: 409 });
    }
    console.error("添加集成失败:", error);
    return NextResponse.json({ error: "添加集成失败" }, { status: 500 });
  }
}
