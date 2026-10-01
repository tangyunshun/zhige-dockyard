import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { ALLOWED_MODEL_CAPABILITIES } from "@/lib/component-contract/capabilities";

/**
 * GET：下发「平台允许声明的模型能力」清单（含中文名与用途说明）。
 *
 * 设计目的：能力枚举的唯一真源在后端 ALLOWED_MODEL_CAPABILITIES，
 * 后台「编辑模型能力」界面不再自行维护任何固定能力表，避免前后端能力口径漂移。
 */
const CAPABILITY_META: Record<string, { label: string; description: string }> = {
  TEXT_GENERATION: {
    label: "文本生成",
    description: "模型能根据输入材料生成中文正文（需求分析、报告、摘要类组件的基础能力）",
  },
  STRUCTURED_OUTPUT: {
    label: "结构化输出",
    description: "模型能稳定输出 JSON / 表格结构数据（评分卡、对照表、指标表类组件必需）",
  },
  VISION: {
    label: "图片理解（OCR）",
    description: "模型能识别图片中的文字与版面（上传 PNG / JPEG 截图表单类材料时必需）",
  },
  LONG_CONTEXT: {
    label: "长上下文",
    description: "模型可一次性处理超长材料（标书、合同全文等大篇幅文档）",
  },
  FILE_ANALYSIS: {
    label: "文件解析",
    description: "平台可先把 PDF / Word / Excel 等附件解析成文本再交给模型处理",
  },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const data = Array.from(ALLOWED_MODEL_CAPABILITIES).map((value) => ({
      value,
      label: CAPABILITY_META[value]?.label ?? value,
      description: CAPABILITY_META[value]?.description ?? "",
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[model-capabilities] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型能力清单失败" }, { status: 500 });
  }
}
