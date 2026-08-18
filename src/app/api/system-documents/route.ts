import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    if (!category) {
      return NextResponse.json(
        { error: "缺少分类参数" },
        { status: 400 }
      );
    }

    let document = await prisma.systemdocument.findFirst({
      where: {
        category,
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 功能自愈：若数据库中无相应条款或政策文档，则自动注入默认的精美文案
    if (!document) {
      console.log(`[System Document] Category "${category}" not found, initializing default document...`);
      let title = "";
      let content = "";

      if (category === "terms-of-service") {
        title = "“知阁·舟坊”平台服务条款";
        content = `# 服务条款

欢迎使用知阁·舟坊效能操作系统。您在注册时即代表您同意本服务条款：
1. 账号安全：请妥善保管您的账号与密码，并对账号下的所有空间协作活动负责。
2. 规范使用：不得利用本平台制作或传播非法内容，严禁滥用系统配额及攻击接口。
3. 知识产权：平台所有预置组件及 UI 所有权归知阁所有。`;
      } else if (category === "privacy-policy") {
        title = "“知阁·舟坊”平台隐私政策";
        content = `# 隐私政策

知阁·舟坊深知隐私对您的重要性，特此承诺：
1. 信息收集：我们仅收集账号名、邮箱/手机号等基本身份信息及协作空间必要元数据。
2. 信息存储：您的信息经现代加密架构保护，除非法律需要，绝不共享或披露。
3. 您的权利：您有权随时管理您的个人信息，或选择退出已受邀的企业协作空间。`;
      }

      if (title && content) {
        const randomId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        document = await prisma.systemdocument.create({
          data: {
            id: randomId,
            title,
            content,
            category,
            isPublished: true,
            sortOrder: 0,
            viewCount: 0,
            updatedAt: new Date(),
          },
        });
      }
    }

    if (!document) {
      return NextResponse.json(
        { error: "未找到文档" },
        { status: 404 }
      );
    }

    // 增加浏览量
    await prisma.systemdocument.update({
      where: { id: document.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true, data: document });
  } catch (error: any) {
    console.error("Get system document error:", error);
    return NextResponse.json(
      { 
        error: "获取文档失败", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
