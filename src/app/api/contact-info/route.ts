import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CONTACT_MANAGERS, normalizeContactManagers } from "@/constants/contact-info";

export const dynamic = "force-dynamic";

/**
 * GET /api/contact-info —— 公开读取客户经理联系方式（1~2 位）
 *
 * 联系方式由后台「系统设置」维护（systemconfig: contact.managers，JSON 数组，最少 1 位、最多 2 位），
 * 此处读取后台配置；若后台尚未配置则回退到前端兜底默认值，绝不返回空列表。
 * 无需鉴权：联系方式本就是对外公开信息。
 *
 * 返回：
 * - managers: ContactManager[]（1~2 位，前端优先消费）
 * - hotline/email/serviceHours: 第 1 位客户的扁平字段（兼容旧调用方）
 */
export async function GET() {
  try {
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: ["contact.managers", "contact.hotline", "contact.email", "contact.serviceHours"] } },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.value !== null && r.value !== undefined) map[r.key] = r.value;
    });

    // 优先读新配置（contact.managers 数组）；为空时兼容旧三键配置，再兜底默认值
    let managers = normalizeContactManagers(safeParse(map["contact.managers"]));
    const usedLegacy =
      !map["contact.managers"] && (map["contact.hotline"] || map["contact.email"]);
    if (usedLegacy) {
      managers = [
        {
          name: "客户经理",
          hotline: map["contact.hotline"] || DEFAULT_CONTACT_MANAGERS[0].hotline,
          email: map["contact.email"] || DEFAULT_CONTACT_MANAGERS[0].email,
          serviceHours: map["contact.serviceHours"] || DEFAULT_CONTACT_MANAGERS[0].serviceHours,
          qq: "",
          wechat: "",
          qqQr: "",
          wechatQr: "",
        },
      ];
    }

    return NextResponse.json({
      success: true,
      managers,
      // 兼容旧调用方：返回第 1 位客户的扁平字段
      hotline: managers[0].hotline,
      email: managers[0].email,
      serviceHours: managers[0].serviceHours,
    });
  } catch (error) {
    console.error("[contact-info] 读取失败，使用兜底默认值:", error);
    return NextResponse.json({
      success: true,
      managers: DEFAULT_CONTACT_MANAGERS,
      hotline: DEFAULT_CONTACT_MANAGERS[0].hotline,
      email: DEFAULT_CONTACT_MANAGERS[0].email,
      serviceHours: DEFAULT_CONTACT_MANAGERS[0].serviceHours,
    });
  }
}

/** 安全解析 JSON 字符串，失败返回 undefined（交由 normalize 兜底） */
function safeParse(raw?: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
