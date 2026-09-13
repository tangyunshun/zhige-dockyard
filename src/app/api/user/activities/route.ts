import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 全系统最完整的操作类型映射（中文友好名称与语义徽章样式）
const ACTION_META: Record<string, { label: string; color: string; category: string }> = {
  // —— 用户与个人资料 ——
  "user:create": { label: "创建账号", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "profile" },
  "user:update": { label: "修改个人资料", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "profile" },
  "user:delete": { label: "注销用户账号", color: "bg-red-100 text-red-600 border-red-200", category: "profile" },
  "user:ban": { label: "账号状态受限", color: "bg-red-100 text-red-600 border-red-200", category: "security" },
  "user:unban": { label: "账号恢复正常", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "security" },
  "user:reset_session": { label: "重置会话凭据", color: "bg-amber-100 text-amber-700 border-amber-200", category: "security" },
  "ACCOUNT_DELETION_REQUESTED": { label: "申请注销账号", color: "bg-amber-100 text-amber-700 border-amber-200", category: "profile" },
  "ACCOUNT_DELETION_CANCELLED": { label: "撤销注销申请", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "profile" },
  "ACCOUNT_DELETED": { label: "账号完成销毁", color: "bg-red-100 text-red-600 border-red-200", category: "profile" },

  // —— 认证与安全 ——
  "auth:login": { label: "登录平台系统", color: "bg-purple-100 text-[#805ad5] border-purple-200", category: "security" },
  "auth:logout": { label: "安全退出登录", color: "bg-slate-100 text-slate-700 border-slate-200", category: "security" },
  "SESSION_TIMEOUT_LOGOUT": { label: "会话超时退出", color: "bg-amber-100 text-amber-700 border-amber-200", category: "security" },
  "Password:Change": { label: "修改登录密码", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "security" },
  "SecuritySetting:Update": { label: "更新安全设置", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "security" },
  "SESSION_CONFLICT_LOGOUT": { label: "多地登录挤线退出", color: "bg-amber-100 text-amber-700 border-amber-200", category: "security" },
  "DEVICE_KICKED_OFFLINE": { label: "设备超额自动下线", color: "bg-amber-100 text-amber-700 border-amber-200", category: "security" },
  "ADMIN_FORCE_LOGOUT": { label: "管理员下线通知", color: "bg-red-100 text-red-600 border-red-200", category: "security" },
  "cross_region_verify": { label: "异地登录安全验证", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "security" },
  "SECURITY_DIAGNOSIS": { label: "账号安全体检诊断", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "security" },
  "APIKey:Create": { label: "创建 API 访问密钥", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "security" },
  "APIKey:Delete": { label: "吊销 API 访问密钥", color: "bg-red-100 text-red-600 border-red-200", category: "security" },
  "sso:revoke": { label: "解除第三方账号绑定", color: "bg-amber-100 text-amber-700 border-amber-200", category: "security" },
  "stepup:issued": { label: "完成二次身份验证", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "security" },

  // —— 工作空间协同 ——
  "workspace:create": { label: "创建工作空间", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "workspace" },
  "workspace:update": { label: "更新空间配置", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "workspace" },
  "workspace:delete": { label: "解散工作空间", color: "bg-red-100 text-red-600 border-red-200", category: "workspace" },
  "CREATE_ENTERPRISE_WORKSPACE": { label: "开通企业空间", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "workspace" },
  "JOIN_WORKSPACE": { label: "加入协同空间", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "workspace" },
  "LEAVE_WORKSPACE": { label: "主动退出空间", color: "bg-amber-100 text-amber-700 border-amber-200", category: "workspace" },
  "UPDATE_MEMBER_ROLE": { label: "调整成员协作角色", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "workspace" },
  "WORKSPACE_KICK": { label: "移出空间成员", color: "bg-red-100 text-red-600 border-red-200", category: "workspace" },
  "UPGRADE_WORKSPACE": { label: "升级空间规格", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "workspace" },
  "UPGRADE_WORKSPACE_PLAN": { label: "变更空间方案套餐", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "workspace" },
  "CONFIGURE_SOLUTION": { label: "配置工程解决方案", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "workspace" },
  "SET_RESTRICTED_COMPONENTS": { label: "配置受限组件规则", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "workspace" },
  "SAVE_CUSTOM_POSITIONS": { label: "保存中枢自定义布局", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "workspace" },

  // —— 研发工程组件 ——
  "component:create": { label: "新建研发组件", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "component" },
  "component:update": { label: "更新组件版本", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "component" },
  "component:delete": { label: "删除研发组件", color: "bg-red-100 text-red-600 border-red-200", category: "component" },
  "component:publish": { label: "公开发布组件", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "component" },
  "component:request_publish": { label: "申请组件上架审核", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "component" },
  "component:approve": { label: "组件上架审核通过", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "component" },
  "component:reject": { label: "组件上架审核驳回", color: "bg-amber-100 text-amber-700 border-amber-200", category: "component" },
  "component:execute": { label: "调试运行组件", color: "bg-purple-100 text-[#805ad5] border-purple-200", category: "component" },
  "BIND_COMPONENT": { label: "工作空间绑定组件", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "component" },
  "UNBIND_COMPONENT": { label: "工作空间解绑组件", color: "bg-amber-100 text-amber-700 border-amber-200", category: "component" },

  // —— 知识库与文档 ——
  "KNOWLEDGE_PUBLISH": { label: "发布知识库文档", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "knowledge" },
  "KNOWLEDGE_SUBMIT": { label: "提交文档评审", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "knowledge" },
  "KNOWLEDGE_APPROVE": { label: "文档审核通过", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "knowledge" },
  "KNOWLEDGE_REJECT": { label: "文档审核驳回", color: "bg-amber-100 text-amber-700 border-amber-200", category: "knowledge" },

  // —— 协同任务 ——
  "task:create": { label: "新建协同任务", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "task" },
  "task:update": { label: "更新协同任务", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "task" },
  "ARCHIVE_TASK": { label: "归档协同任务", color: "bg-amber-100 text-amber-700 border-amber-200", category: "task" },
  "DELETE_TASK": { label: "删除协同任务", color: "bg-red-100 text-red-600 border-red-200", category: "task" },

  // —— 会员与充值订单 ——
  "MEMBERSHIP_UPGRADE": { label: "会员权益升级", color: "bg-purple-100 text-[#805ad5] border-purple-200", category: "membership" },
  "order:pay": { label: "订单完成支付", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "membership" },
  "order:cancel": { label: "订单取消", color: "bg-slate-100 text-slate-700 border-slate-200", category: "membership" },

  // —— 资料资产 ——
  "asset:upload": { label: "上传资料资产", color: "bg-cyan-100 text-cyan-700 border-cyan-200", category: "asset" },
  "asset:publish_direct": { label: "直接公开资料", color: "bg-emerald-100 text-emerald-700 border-emerald-200", category: "asset" },
  "asset:request_publish": { label: "申请公开资料", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "asset" },
  "asset:remove": { label: "下架公开资料", color: "bg-amber-100 text-amber-700 border-amber-200", category: "asset" },
  "asset:batch_delete": { label: "批量删除资料", color: "bg-red-100 text-red-600 border-red-200", category: "asset" },

  // —— 算力与配额 ——
  "quota:recycle": { label: "回收算力配额", color: "bg-amber-100 text-amber-700 border-amber-200", category: "quota" },
  "quota:threshold": { label: "调整算力报警阈值", color: "bg-blue-100 text-[#2b6cb0] border-blue-200", category: "quota" },

  // —— 系统设置 ——
  "system:settings": { label: "更新系统偏好配置", color: "bg-indigo-100 text-[#5a67d8] border-indigo-200", category: "system" },
  "PING_TEST": { label: "测试网关连通性", color: "bg-slate-100 text-slate-700 border-slate-200", category: "system" },
};

/** 智能转译为亲切的中文名称与分类 */
function translateAction(action: string, resource: string | null) {
  if (ACTION_META[action]) {
    return ACTION_META[action];
  }

  // 词根智能解析
  const act = (action || "").toLowerCase();
  const res = (resource || "").toLowerCase();

  let category = "other";
  if (res.includes("workspace") || act.includes("workspace")) category = "workspace";
  else if (res.includes("component") || act.includes("component")) category = "component";
  else if (res.includes("auth") || act.includes("auth") || act.includes("login") || act.includes("logout") || act.includes("password") || act.includes("security")) category = "security";
  else if (res.includes("user") || act.includes("user") || act.includes("profile")) category = "profile";
  else if (res.includes("membership") || res.includes("order") || act.includes("membership")) category = "membership";
  else if (res.includes("knowledge") || act.includes("knowledge")) category = "knowledge";
  else if (res.includes("task") || act.includes("task")) category = "task";
  else if (res.includes("asset") || act.includes("asset")) category = "asset";
  else if (res.includes("quota") || act.includes("quota")) category = "quota";
  else if (res.includes("system") || act.includes("system")) category = "system";

  let label = "常规业务操作";
  if (act.includes("create")) label = "创建操作";
  else if (act.includes("update") || act.includes("edit")) label = "更新操作";
  else if (act.includes("delete") || act.includes("remove")) label = "删除操作";
  else if (act.includes("publish")) label = "发布操作";
  else if (act.includes("approve")) label = "审核通过";
  else if (act.includes("reject")) label = "审核驳回";
  else if (act.includes("query") || act.includes("get")) label = "查询操作";

  return {
    label,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    category,
  };
}

/** 分类中文名称 */
const CATEGORY_LABELS: Record<string, string> = {
  workspace: "工作空间协同",
  component: "工程研发组件",
  security: "安全与身份认证",
  profile: "用户与个人资料",
  membership: "会员与充值订单",
  knowledge: "资料与知识库",
  task: "研发协同任务",
  asset: "资料与制品资产",
  quota: "算力配额治理",
  system: "系统设置偏好",
  other: "系统常规操作",
};

// GET - 获取当前用户操作审计流水与统计看板
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
    }
    const userId = auth.user.id;
    const { searchParams } = new URL(request.url);

    // 默认每页 10 条
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const keyword = (searchParams.get("keyword") || "").trim();
    const category = searchParams.get("category") || "ALL";
    const timeRange = searchParams.get("timeRange") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 规定生命周期：最长保留 1 年（365天），超期流水自动出清
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // 异步清理超期历史数据
    prisma.operationlog.deleteMany({
      where: { createdAt: { lt: oneYearAgo } },
    }).catch((err) => {
      console.warn("[日志生命周期] 自动清理1年前超期操作流水提示:", err);
    });

    // 基础查询条件：仅限当前登录用户，且保留在 1 年以内
    const where: any = {
      userId,
      createdAt: { gte: oneYearAgo },
    };

    // 模块分类过滤（精准覆盖全部 10+ 业务模块）
    if (category !== "ALL") {
      switch (category) {
        case "workspace":
          where.OR = [
            { resource: { contains: "workspace" } },
            { action: { contains: "workspace" } },
            { action: { contains: "WORKSPACE" } },
          ];
          break;
        case "component":
          where.OR = [
            { resource: { contains: "component" } },
            { action: { contains: "component" } },
            { action: { contains: "COMPONENT" } },
          ];
          break;
        case "security":
          where.OR = [
            { resource: { contains: "security" } },
            { resource: { contains: "auth" } },
            { action: { contains: "auth" } },
            { action: { contains: "login" } },
            { action: { contains: "logout" } },
            { action: { contains: "Password" } },
            { action: { contains: "Security" } },
            { action: { contains: "SESSION" } },
            { action: { contains: "DEVICE" } },
            { action: { contains: "APIKey" } },
          ];
          break;
        case "profile":
          where.OR = [
            { resource: { contains: "user" } },
            { action: { contains: "user" } },
            { action: { contains: "profile" } },
            { action: { contains: "ACCOUNT" } },
          ];
          break;
        case "membership":
          where.OR = [
            { resource: { contains: "membership" } },
            { resource: { contains: "billing" } },
            { resource: { contains: "order" } },
            { action: { contains: "membership" } },
            { action: { contains: "upgrade" } },
            { action: { contains: "order" } },
          ];
          break;
        case "knowledge":
          where.OR = [
            { resource: { contains: "knowledge" } },
            { action: { contains: "KNOWLEDGE" } },
            { action: { contains: "knowledge" } },
          ];
          break;
        case "task":
          where.OR = [
            { resource: { contains: "task" } },
            { action: { contains: "TASK" } },
            { action: { contains: "task" } },
          ];
          break;
        case "asset":
          where.OR = [
            { resource: { contains: "asset" } },
            { action: { contains: "asset" } },
          ];
          break;
        case "quota":
          where.OR = [
            { resource: { contains: "quota" } },
            { action: { contains: "quota" } },
          ];
          break;
        case "system":
          where.OR = [
            { resource: { contains: "system" } },
            { action: { contains: "system" } },
            { action: { contains: "PING" } },
          ];
          break;
      }
    }

    // 时间范围筛选（支持自定义日期范围 + 快捷胶囊）
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        const effectiveStart = start < oneYearAgo ? oneYearAgo : start;
        where.createdAt = { ...(where.createdAt || {}), gte: effectiveStart };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt = { ...(where.createdAt || {}), lte: end };
      }
    } else if (timeRange !== "all") {
      const now = new Date();
      let startTime: Date | null = null;
      if (timeRange === "today") {
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      } else if (timeRange === "7days") {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeRange === "30days") {
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      if (startTime) {
        const effectiveStart = startTime < oneYearAgo ? oneYearAgo : startTime;
        where.createdAt = { ...(where.createdAt || {}), gte: effectiveStart };
      }
    }

    // 关键词搜索（支持匹配 action / resource / ipAddress / details）
    if (keyword) {
      const keywordFilter = [
        { action: { contains: keyword } },
        { resource: { contains: keyword } },
        { ipAddress: { contains: keyword } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: keywordFilter }];
        delete where.OR;
      } else {
        where.OR = keywordFilter;
      }
    }

    // 真实聚合各维度统计指标（基于 1 年生命周期）
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const [
      totalCount,
      workspaceCount,
      componentCount,
      securityCount,
      membershipCount,
      todayCount,
      filteredTotal,
      logs,
    ] = await Promise.all([
      prisma.operationlog.count({ where: { userId, createdAt: { gte: oneYearAgo } } }),
      prisma.operationlog.count({
        where: {
          userId,
          createdAt: { gte: oneYearAgo },
          OR: [
            { resource: { contains: "workspace" } },
            { action: { contains: "workspace" } },
            { action: { contains: "WORKSPACE" } },
          ],
        },
      }),
      prisma.operationlog.count({
        where: {
          userId,
          createdAt: { gte: oneYearAgo },
          OR: [
            { resource: { contains: "component" } },
            { action: { contains: "component" } },
            { action: { contains: "COMPONENT" } },
          ],
        },
      }),
      prisma.operationlog.count({
        where: {
          userId,
          createdAt: { gte: oneYearAgo },
          OR: [
            { resource: { contains: "security" } },
            { resource: { contains: "auth" } },
            { action: { contains: "auth" } },
            { action: { contains: "login" } },
            { action: { contains: "logout" } },
            { action: { contains: "Password" } },
            { action: { contains: "Security" } },
            { action: { contains: "SESSION" } },
            { action: { contains: "DEVICE" } },
          ],
        },
      }),
      prisma.operationlog.count({
        where: {
          userId,
          createdAt: { gte: oneYearAgo },
          OR: [
            { resource: { contains: "membership" } },
            { resource: { contains: "billing" } },
            { resource: { contains: "order" } },
            { action: { contains: "membership" } },
            { action: { contains: "upgrade" } },
          ],
        },
      }),
      prisma.operationlog.count({
        where: {
          userId,
          createdAt: { gte: todayStart },
        },
      }),
      prisma.operationlog.count({ where }),
      prisma.operationlog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // 格式化输出数据：消除英文代码，全面转换为中文
    const activities = logs.map((log) => {
      let parsedDetails: any = null;
      try {
        parsedDetails = typeof log.details === "string" ? JSON.parse(log.details) : log.details;
      } catch {
        parsedDetails = log.details;
      }

      // IP 清洗友善化
      let cleanIp = log.ipAddress || "";
      if (!cleanIp || cleanIp === "::1" || cleanIp === "127.0.0.1" || cleanIp.includes("127.0.0.1")) {
        cleanIp = "127.0.0.1 (本地局域网)";
      } else if (cleanIp.startsWith("::ffff:")) {
        const v4 = cleanIp.replace("::ffff:", "");
        cleanIp = v4 === "127.0.0.1" ? "127.0.0.1 (本地局域网)" : v4;
      }

      const meta = translateAction(log.action, log.resource);
      const actionLabel = meta.label;
      const actionBadgeColor = meta.color;
      const resourceType = meta.category;
      const resourceCategoryLabel = CATEGORY_LABELS[resourceType] || "常规模块";

      // 友好中文描述
      let description = parsedDetails?.message || parsedDetails?.description;
      if (!description) {
        description = `用户执行了「${actionLabel}」操作`;
        if (log.resource) {
          description += `，目标标识: ${log.resource}`;
        }
      }

      return {
        id: log.id,
        action: log.action,
        actionLabel,
        actionBadgeColor,
        description,
        resourceType,
        resourceCategoryLabel,
        resourceId: log.resource,
        workspaceId: log.workspaceId,
        ipAddress: cleanIp,
        createdAt: log.createdAt.toISOString(),
        metadata: parsedDetails,
      };
    });

    return NextResponse.json({
      success: true,
      data: activities,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit) || 1,
      },
      statistics: {
        total: totalCount,
        workspace: workspaceCount,
        component: componentCount,
        security: securityCount,
        membership: membershipCount,
        today: todayCount,
      },
      retentionPolicy: {
        days: 365,
        description: "平台操作记录最长保留 1 年 (365天)，超期记录由系统自动安全清理。",
      },
    });
  } catch (error) {
    console.error("Get user activities error:", error);
    return NextResponse.json({ error: "获取操作日志数据失败" }, { status: 500 });
  }
}

// DELETE - 删除用户个人操作日志（支持单条删除与批量删除，严格限制 userId 隔离）
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    const { id, ids, cleanExpired } = body;

    // 模式 1：清理超期或一年前日志
    if (cleanExpired) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const result = await prisma.operationlog.deleteMany({
        where: { userId, createdAt: { lt: oneYearAgo } },
      });
      return NextResponse.json({
        success: true,
        message: `成功清理已超期（大于1年）的操作日志共 ${result.count} 条`,
        count: result.count,
      });
    }

    // 模式 2：批量删除（严格限定 userId 属于当前用户）
    if (Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.operationlog.deleteMany({
        where: {
          id: { in: ids },
          userId, // 强制隔离，防止越权
        },
      });

      return NextResponse.json({
        success: true,
        message: `成功删除选中的 ${result.count} 条操作审计日志`,
        count: result.count,
      });
    }

    // 模式 3：单条删除（严格限定 userId 属于当前用户）
    const targetId = id || new URL(request.url).searchParams.get("id");
    if (!targetId) {
      return NextResponse.json({ error: "缺少待删除日志记录的 ID" }, { status: 400 });
    }

    const result = await prisma.operationlog.deleteMany({
      where: {
        id: targetId,
        userId, // 强制隔离，防止越权
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "未找到待删除的日志记录，或您无权操作该记录" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "操作审计日志已成功删除",
    });
  } catch (error) {
    console.error("Delete user activities error:", error);
    return NextResponse.json(
      { error: "删除操作日志失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
