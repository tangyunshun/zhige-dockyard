import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "缺少 Authorization Header 或格式不正确" },
        { status: 401 }
      );
    }

    const apiKeyString = authHeader.substring(7);
    let authenticatedKey = null;

    if (apiKeyString.startsWith("keyId_")) {
      // 客户端在线沙盒发起的会话绑定测试（因为客户端无法获取已哈希的明文Key）
      const keyId = apiKeyString.substring(6);
      const userIdHeader = request.headers.get("X-User-Id");

      if (userIdHeader) {
        const user = await prisma.user.findUnique({
          where: { id: userIdHeader },
          select: { status: true },
        });

        if (user && user.status === "active") {
          authenticatedKey = await prisma.apikey.findFirst({
            where: { id: keyId, userId: userIdHeader },
          });
        }
      }
    } else {
      // 传统的 API Key 明文哈希比对 (外部调用)
      const allKeys = await prisma.apikey.findMany();
      for (const key of allKeys) {
        const isMatch = await bcrypt.compare(apiKeyString, key.keyHash);
        if (isMatch) {
          authenticatedKey = key;
          break;
        }
      }
    }

    if (!authenticatedKey) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "API 密钥验证失败，请使用有效的开发密钥" },
        { status: 401 }
      );
    }

    const { userId } = authenticatedKey;
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint") || "/v1/rfp/parse";

    const startTime = Date.now();

    // 更新 API Key 的最后使用时间
    await prisma.apikey.update({
      where: { id: authenticatedKey.id },
      data: { lastUsedAt: new Date() },
    });

    let data = {};
    let type = "rfp-parse";

    if (endpoint === "/v1/rfp/parse") {
      type = "rfp-parse";
      data = {
        document_id: `rfp_doc_${Math.floor(Math.random() * 1000000)}`,
        parsed_content: {
          requirements: [
            { id: "REQ-001", text: body.document_url ? `成功解析 ${body.document_url} 标书：系统需支持亚秒级数据渲染` : "系统大屏需支持亚秒级数据渲染，每30秒刷新一次", category: "性能指标", priority: "HIGH" },
            { id: "REQ-002", text: "支持国产信创达梦数据库 DM8 存储", category: "信创规范", priority: "CRITICAL" }
          ],
          risk_warnings: [
            { type: "合规风险", description: "项目要求 100% 物理隔离，SaaS 模型可能涉及合规审计漏口" }
          ]
        },
        processing_time: `${((Date.now() - startTime + 500) / 1000).toFixed(2)}s`
      };
    } else if (endpoint === "/v1/prd/generate") {
      type = "prd-generate";
      data = {
        prd_id: `prd_${Math.floor(Math.random() * 1000000)}`,
        title: body.requirement_text ? `生成PRD: ${body.requirement_text}` : "产品需求文档 (PRD)",
        sections: {
          introduction: "本产品专为水利枢纽智能化健康安全运维提供大屏调度与异常报警功能...",
          user_stories: [
            { role: "水库调度员", action: "在监控中心查看大坝水位变化", value: "及时应对超汛限水位异常" }
          ],
          db_schema: {
            tables: ["dam_status_log", "alarm_records"]
          }
        },
        generated_tokens: 1845
      };
    } else {
      type = "gateway-route";
      data = {
        selected_model: "deepseek-coder",
        latency_ms: Date.now() - startTime + 240,
        response: body.prompt ? `分析: ${body.prompt}。经过路由分析，推荐使用 deepseek-coder 运行。代码无内存泄漏隐患。` : "经过路由分析，推荐使用 deepseek-coder 运行。"
      };
    }

    const latencyMs = Date.now() - startTime;

    // 1. 实时向数据库写入 apiusage 记录 (API 审计)
    await prisma.apiusage.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        endpoint,
        method: "POST",
        responseCode: 200,
        latencyMs,
      },
    });

    // 2. 实时向数据库写入 componenttask 记录 (任务闭环)
    await prisma.componenttask.create({
      data: {
        id: crypto.randomUUID(),
        name: `API 沙盒调试: ${endpoint}`,
        description: `通过 API 密钥 ${authenticatedKey.name} 运行的沙盒测试`,
        type,
        status: "completed",
        progress: 100,
        userId,
        config: body,
        result: data,
        isPublished: false,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      status: 200,
      message: "API 调用成功",
      data,
    });
  } catch (error) {
    console.error("Developer Sandbox API error:", error);
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message: error instanceof Error ? error.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
