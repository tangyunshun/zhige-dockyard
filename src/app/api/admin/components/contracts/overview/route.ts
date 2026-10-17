import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { prisma } from "@/lib/prisma";

/**
 * 组件合同健康度总览（只读聚合）
 *
 * 一次查询聚合全部组件的合同状态，供管理员后台「组件合同」页顶部的
 * 全局健康度总览使用，避免逐组件轮询 60+ 次接口。
 *
 * 状态派生原则（与 component-readiness-view 一致）：
 *  - PUBLISHED    : 存在已发布 (PUBLISHED) 合同版本；
 *  - DRAFT_ONLY   : 仅存在草稿 (DRAFT)，无任何已发布版本 → 不可执行；
 *  - ARCHIVED_ONLY: 仅存在归档 (ARCHIVED)，无任何已发布版本 → 失效；
 *  - NONE         : 完全没有任何合同版本 → 高危，组件无法执行；
 *  - isActivePublished: 组件的激活合同 (activeContractId) 确实指向某个已发布版本，
 *                      才代表「真正可跑」。
 */
export type ContractOverviewCategory =
  | "PUBLISHED"
  | "DRAFT_ONLY"
  | "ARCHIVED_ONLY"
  | "NONE";

interface OverviewItem {
  componentId: string;
  componentName: string;
  category: ContractOverviewCategory;
  hasPublished: boolean;
  hasDraft: boolean;
  hasArchived: boolean;
  isActivePublished: boolean;
  publishedVersion: string | null;
  activeContractId: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(
      request,
      "component:read",
      "system:manage"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    // 1. 拉取全部组件目录（轻投影：id / name / 激活合同外键）
    const components = await prisma.componentcatalog.findMany({
      select: { id: true, name: true, activeContractId: true },
      orderBy: { sortOrder: "asc" },
    });

    // 2. 一次性聚合每个组件各生命周期的合同计数
    const groups = await prisma.componentcontract.groupBy({
      by: ["componentId", "lifecycle"],
      _count: { _all: true },
    });

    // 3. 拉取全部已发布合同（取 componentId / 版本号 / 主键，用于判定激活与展示版本）
    const published = await prisma.componentcontract.findMany({
      where: { lifecycle: "PUBLISHED" },
      select: { id: true, componentId: true, contractVersion: true },
    });
    const publishedIdSet = new Set(published.map((p) => p.id));

    // 4. 构建 per-component 状态映射
    const statusMap = new Map<
      string,
      {
        hasPublished: boolean;
        hasDraft: boolean;
        hasArchived: boolean;
        publishedVersion: string | null;
      }
    >();
    for (const c of components) {
      statusMap.set(c.id, {
        hasPublished: false,
        hasDraft: false,
        hasArchived: false,
        publishedVersion: null,
      });
    }
    for (const g of groups) {
      const s = statusMap.get(g.componentId);
      if (!s) continue;
      if (g.lifecycle === "DRAFT") s.hasDraft = true;
      else if (g.lifecycle === "ARCHIVED") s.hasArchived = true;
    }
    for (const p of published) {
      const s = statusMap.get(p.componentId);
      if (!s) continue;
      s.hasPublished = true;
      s.publishedVersion = p.contractVersion;
    }

    // 5. 派生每个组件的分类与可执行性
    const items: OverviewItem[] = components.map((c) => {
      const s = statusMap.get(c.id)!;
      let category: ContractOverviewCategory;
      if (s.hasPublished) category = "PUBLISHED";
      else if (s.hasDraft) category = "DRAFT_ONLY";
      else if (s.hasArchived) category = "ARCHIVED_ONLY";
      else category = "NONE";

      return {
        componentId: c.id,
        componentName: c.name,
        category,
        hasPublished: s.hasPublished,
        hasDraft: s.hasDraft,
        hasArchived: s.hasArchived,
        isActivePublished:
          !!c.activeContractId && publishedIdSet.has(c.activeContractId),
        publishedVersion: s.publishedVersion,
        activeContractId: c.activeContractId,
      };
    });

    const summary = {
      total: components.length,
      published: items.filter((i) => i.category === "PUBLISHED").length,
      executable: items.filter((i) => i.isActivePublished).length,
      draftOnly: items.filter((i) => i.category === "DRAFT_ONLY").length,
      archivedOnly: items.filter((i) => i.category === "ARCHIVED_ONLY").length,
      none: items.filter((i) => i.category === "NONE").length,
    };

    return NextResponse.json({
      success: true,
      data: { summary, items },
    });
  } catch (error) {
    console.error("Get contracts overview error:", error);
    return NextResponse.json(
      { success: false, error: "获取组件合同总览失败" },
      { status: 500 }
    );
  }
}
