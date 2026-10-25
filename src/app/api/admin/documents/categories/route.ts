import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

const SYSTEM_CONFIG_KEY = "document_custom_categories";

// 系统默认内置标准分类（作为基础池）
export const DEFAULT_STANDARD_CATEGORIES = [
  { key: "user-guide", label: "用户指南·快速入门", description: "系统基础使用入门与新手导航" },
  { key: "api-doc", label: "接口开发与接入文档", description: "REST API 与 SDK 开发接入说明" },
  { key: "workspace", label: "工作空间治理与权限说明", description: "团队协作、权限矩阵与租户治理" },
  { key: "system-doc", label: "企业部署与系统运行手册", description: "私有化部署、环境依赖与运行维护" },
  { key: "knowledge", label: "知识库与组件规范指南", description: "知识沉淀规约与效能组件标准" },
  { key: "faq", label: "常见问题与故障排查", description: "高频问题解答与故障排查流程" },
  { key: "announcement", label: "平台官方更新公告", description: "平台重大版本迭代与功能发版" },
  { key: "privacy-policy", label: "平台用户隐私保护协议", description: "个人信息保护与数据安全合规" },
  { key: "terms-of-service", label: "平台用户服务条款协议", description: "平台各项服务规范与法律责任" },
];

export interface CustomCategoryItem {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  isCustom?: boolean;
  createdAt?: string;
  createdBy?: string;
}

/**
 * 获取全部文档分类（从数据库中动态查询自定义分类，并合并系统标准分类与真实文档数量）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const permCheck = await requirePlatformPermission(request, "document:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限查看文档分类" }, { status: 403 });
    }

    // 1. 从数据库 systemconfig 表中查询自定义文档分类
    const configRow = await prisma.systemconfig.findUnique({
      where: { key: SYSTEM_CONFIG_KEY },
    });

    let customCategories: CustomCategoryItem[] = [];
    if (configRow?.value) {
      try {
        const parsed = JSON.parse(configRow.value);
        if (Array.isArray(parsed)) {
          customCategories = parsed;
        }
      } catch (e) {
        console.error("解析数据库 document_custom_categories 失败:", e);
      }
    }

    // 2. 从数据库中聚合统计各分类下真实存在的文档数
    const docCounts = await prisma.systemdocument.groupBy({
      by: ["category"],
      _count: { id: true },
    });

    const countMap: Record<string, number> = {};
    for (const item of docCounts) {
      if (item.category) {
        countMap[item.category] = item._count.id;
      }
    }

    // 3. 构建去重的完整分类映射（标准分类 + 数据库自定义分类 + 存量文档分类）
    const categoryMap = new Map<string, any>();

    // 注入标准分类
    DEFAULT_STANDARD_CATEGORIES.forEach((cat) => {
      categoryMap.set(cat.key, {
        ...cat,
        isCustom: false,
        count: countMap[cat.key] || 0,
      });
    });

    // 注入数据库自定义分类（覆盖或新增）
    customCategories.forEach((cat) => {
      categoryMap.set(cat.key, {
        ...cat,
        isCustom: true,
        count: countMap[cat.key] || 0,
      });
    });

    // 兼容可能遗留的其他历史分类
    Object.keys(countMap).forEach((catKey) => {
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, {
          key: catKey,
          label: catKey,
          description: "历史分类",
          isCustom: true,
          count: countMap[catKey] || 0,
        });
      }
    });

    const allCategories = Array.from(categoryMap.values());

    return NextResponse.json({
      success: true,
      data: {
        categories: allCategories,
        customCategories,
        totalCategories: allCategories.length,
      },
    });
  } catch (error: any) {
    console.error("Get document categories error:", error);
    return NextResponse.json(
      { error: "获取文档分类列表失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * 新增自定义文档分类（直接存入数据库 systemconfig 表，并记录审计日志）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 细粒度权限校验
    const permCheck = await requirePlatformPermission(request, "document:create");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限创建文档分类" }, { status: 403 });
    }

    const body = await request.json();
    const { label, key, description, icon } = body;

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "分类中文名称不能为空" }, { status: 400 });
    }

    const trimmedLabel = label.trim();
    if (trimmedLabel.length < 2 || trimmedLabel.length > 30) {
      return NextResponse.json({ error: "分类中文名称长度须在 2 到 30 个字之间" }, { status: 400 });
    }

    // 生成或校验 key
    let finalKey = (key && typeof key === "string" ? key.trim().toLowerCase() : "");
    if (!finalKey) {
      // 若用户未手动输入英文代码，根据时间戳与拼音规范自动生成合规短代码
      const pinyinSeed = trimmedLabel.replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase();
      finalKey = pinyinSeed ? `${pinyinSeed}-${Date.now().toString(36).slice(-4)}` : `cat-${Date.now().toString(36)}`;
    }

    // 规范化 Key 格式校验：仅允许小写英文字母、数字和连字符，长度 2~36
    if (!/^[a-z0-9][a-z0-9-_]{1,35}$/.test(finalKey)) {
      return NextResponse.json(
        { error: "分类代码格式不规范，仅支持以英文字母或数字开头，可包含连字符（如 security-audit）" },
        { status: 400 }
      );
    }

    // 从数据库查询现有自定义分类
    const configRow = await prisma.systemconfig.findUnique({
      where: { key: SYSTEM_CONFIG_KEY },
    });

    let currentCustoms: CustomCategoryItem[] = [];
    if (configRow?.value) {
      try {
        const parsed = JSON.parse(configRow.value);
        if (Array.isArray(parsed)) {
          currentCustoms = parsed;
        }
      } catch (e) {
        console.warn("解析已有分类失败，将初始化:", e);
      }
    }

    // 校验重名与重代码
    const isStandardDuplicate = DEFAULT_STANDARD_CATEGORIES.some(
      (c) => c.key === finalKey || c.label === trimmedLabel
    );
    const isCustomDuplicate = currentCustoms.some(
      (c) => c.key === finalKey || c.label === trimmedLabel
    );

    if (isStandardDuplicate || isCustomDuplicate) {
      return NextResponse.json(
        { error: `分类名称【${trimmedLabel}】或代码【${finalKey}】已存在，请直接选用或更换新名称` },
        { status: 409 }
      );
    }

    const newCategory: CustomCategoryItem = {
      key: finalKey,
      label: trimmedLabel,
      description: description ? String(description).trim() : `自定义业务分类：${trimmedLabel}`,
      icon: icon || "FileText",
      isCustom: true,
      sortOrder: currentCustoms.length + DEFAULT_STANDARD_CATEGORIES.length + 1,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    };

    const updatedCustoms = [...currentCustoms, newCategory];

    // 幂等持久化写入数据库 systemconfig 表
    await prisma.systemconfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY },
      create: {
        key: SYSTEM_CONFIG_KEY,
        value: JSON.stringify(updatedCustoms),
      },
      update: {
        value: JSON.stringify(updatedCustoms),
      },
    });

    // 写入安全操作审计日志
    await prisma.operationlog.create({
      data: {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId,
        action: "document:create_category",
        resource: "SystemDocumentCategory",
        details: {
          categoryKey: finalKey,
          categoryLabel: trimmedLabel,
          description: newCategory.description,
          message: `创建文档新业务分类【${trimmedLabel}】（代码：${finalKey}）`,
        },
      },
    }).catch((err) => {
      console.warn("[操作日志] 记录新建分类非阻断提示:", err);
    });

    return NextResponse.json({
      success: true,
      data: newCategory,
      message: `分类【${trimmedLabel}】已成功存入数据库`,
    });
  } catch (error: any) {
    console.error("Create document category error:", error);
    return NextResponse.json(
      { error: "新建文档分类失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * 删除自定义文档分类（前置业务校验：该分类下必须无任何文档，否则阻断并提示用户先移除文档）
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const permCheck = await requirePlatformPermission(request, "document:delete");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限删除文档分类" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let categoryKey = searchParams.get("key");

    if (!categoryKey) {
      const body = await request.json().catch(() => ({}));
      categoryKey = body.key;
    }

    if (!categoryKey || typeof categoryKey !== "string" || !categoryKey.trim()) {
      return NextResponse.json({ error: "请指定要删除的分类标识代码 (key)" }, { status: 400 });
    }

    const targetKey = categoryKey.trim();
    const normalizedKey = targetKey.toLowerCase();

    // 1. 系统内置标准分类绝对保护
    const isStandard = DEFAULT_STANDARD_CATEGORIES.some(
      (c) => c.key.toLowerCase() === normalizedKey
    );
    if (isStandard) {
      return NextResponse.json(
        { error: "系统内置标准业务分类属于平台核心基础设施，受保护不可删除" },
        { status: 403 }
      );
    }

    // 2. 核心前置业务校验：检查全库该分类下是否仍有关联的知识文档
    const associatedDocCount = await prisma.systemdocument.count({
      where: {
        OR: [
          { category: targetKey },
          { category: normalizedKey },
          { category: targetKey.replace(/-/g, "_") },
        ],
      },
    });

    if (associatedDocCount > 0) {
      return NextResponse.json(
        {
          error: `该分类下仍关联 ${associatedDocCount} 篇知识文档，无法直接删除！请先将该分类下的文档迁移至其他分类或移除后再行删除。`,
          associatedDocCount,
        },
        { status: 400 }
      );
    }

    // 3. 从数据库读取并过滤自定义分类
    const configRow = await prisma.systemconfig.findUnique({
      where: { key: SYSTEM_CONFIG_KEY },
    });

    let currentCustoms: CustomCategoryItem[] = [];
    if (configRow?.value) {
      try {
        const parsed = JSON.parse(configRow.value);
        if (Array.isArray(parsed)) {
          currentCustoms = parsed;
        }
      } catch (e) {
        console.warn("解析已有分类失败:", e);
      }
    }

    const targetCat = currentCustoms.find(
      (c) => c.key === targetKey || c.key.toLowerCase() === normalizedKey
    );

    const updatedCustoms = currentCustoms.filter(
      (c) => c.key !== targetKey && c.key.toLowerCase() !== normalizedKey
    );

    // 4. 持久化写回数据库 systemconfig 表
    await prisma.systemconfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY },
      create: {
        key: SYSTEM_CONFIG_KEY,
        value: JSON.stringify(updatedCustoms),
      },
      update: {
        value: JSON.stringify(updatedCustoms),
      },
    });

    // 5. 写入安全操作审计日志
    await prisma.operationlog.create({
      data: {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId,
        action: "document:delete_category",
        resource: "SystemDocumentCategory",
        details: {
          categoryKey: targetKey,
          categoryLabel: targetCat?.label || targetKey,
          message: `成功删除文档自定义分类【${targetCat?.label || targetKey}】（代码：${targetKey}）`,
        },
      },
    }).catch((err) => {
      console.warn("[操作日志] 记录删除分类非阻断提示:", err);
    });

    return NextResponse.json({
      success: true,
      message: `分类【${targetCat?.label || targetKey}】已成功从数据库中删除`,
      deletedKey: targetKey,
    });
  } catch (error: any) {
    console.error("Delete document category error:", error);
    return NextResponse.json(
      { error: "删除文档分类失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * 修改自定义文档分类名称与说明（仅支持自定义分类，系统内置标准分类受绝对保护禁止修改）
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const permCheck = await requirePlatformPermission(request, "document:update");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限修改文档分类" }, { status: 403 });
    }

    const body = await request.json();
    const { key, label, description } = body;

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "请提供待修改的分类标识代码 (key)" }, { status: 400 });
    }

    const targetKey = key.trim();
    const normalizedKey = targetKey.toLowerCase();

    // 1. 系统内置标准业务分类绝对保护，禁止修改
    const isStandard = DEFAULT_STANDARD_CATEGORIES.some(
      (c) => c.key.toLowerCase() === normalizedKey
    );
    if (isStandard) {
      return NextResponse.json(
        { error: "系统内置标准分类属于平台核心基础设施，受保护不可修改名称" },
        { status: 403 }
      );
    }

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "分类中文名称不能为空" }, { status: 400 });
    }

    const trimmedLabel = label.trim();
    if (trimmedLabel.length < 2 || trimmedLabel.length > 30) {
      return NextResponse.json({ error: "分类中文名称长度须在 2 到 30 个字之间" }, { status: 400 });
    }

    // 2. 从数据库读取现有自定义分类
    const configRow = await prisma.systemconfig.findUnique({
      where: { key: SYSTEM_CONFIG_KEY },
    });

    let currentCustoms: CustomCategoryItem[] = [];
    if (configRow?.value) {
      try {
        const parsed = JSON.parse(configRow.value);
        if (Array.isArray(parsed)) currentCustoms = parsed;
      } catch (e) {
        console.warn("解析已有分类失败:", e);
      }
    }

    const targetIndex = currentCustoms.findIndex(
      (c) => c.key === targetKey || c.key.toLowerCase() === normalizedKey
    );

    if (targetIndex === -1) {
      return NextResponse.json({ error: `未找到代码为【${targetKey}】的自定义分类` }, { status: 404 });
    }

    // 3. 防重名检测（排除自身）
    const isStandardDuplicate = DEFAULT_STANDARD_CATEGORIES.some((c) => c.label === trimmedLabel);
    const isCustomDuplicate = currentCustoms.some(
      (c, idx) => idx !== targetIndex && c.label === trimmedLabel
    );

    if (isStandardDuplicate || isCustomDuplicate) {
      return NextResponse.json({ error: `分类名称【${trimmedLabel}】已存在，请更换其他名称` }, { status: 409 });
    }

    const oldLabel = currentCustoms[targetIndex].label;
    currentCustoms[targetIndex] = {
      ...currentCustoms[targetIndex],
      label: trimmedLabel,
      description: description !== undefined ? String(description).trim() : currentCustoms[targetIndex].description,
    };

    // 4. 持久化写回数据库 systemconfig 表
    await prisma.systemconfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY },
      create: { key: SYSTEM_CONFIG_KEY, value: JSON.stringify(currentCustoms) },
      update: { value: JSON.stringify(currentCustoms) },
    });

    // 5. 写入审计日志
    await prisma.operationlog.create({
      data: {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId,
        action: "document:update_category",
        resource: "SystemDocumentCategory",
        details: {
          categoryKey: targetKey,
          oldLabel,
          newLabel: trimmedLabel,
          message: `将自定义分类【${oldLabel}】（代码：${targetKey}）更名为【${trimmedLabel}】`,
        },
      },
    }).catch((err) => console.warn("[操作日志] 记录修改分类非阻断提示:", err));

    return NextResponse.json({
      success: true,
      data: currentCustoms[targetIndex],
      message: `分类已成功更名为【${trimmedLabel}】`,
    });
  } catch (error: any) {
    console.error("Update document category error:", error);
    return NextResponse.json(
      { error: "修改文档分类失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}


