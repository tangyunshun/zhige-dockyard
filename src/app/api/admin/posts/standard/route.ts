import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PLATFORM_STANDARD_POSTS_KEY = "PLATFORM_STANDARD_POSTS_V1";

export interface StandardPostItem {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  status: "ACTIVE" | "DISABLED";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_STANDARD_POSTS: StandardPostItem[] = [
  {
    id: "std_post_arch",
    name: "系统架构师",
    code: "SYSTEM_ARCHITECT",
    description: "负责平台宏观高可用系统架构演进、技术栈选型与底层核心模型设计",
    color: "#805ad5",
    status: "ACTIVE",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_frontend",
    name: "前端开发工程师",
    code: "FRONTEND_DEV",
    description: "负责平台交互界面研发、高阶组件工程化构建与跨终端视觉体验还原",
    color: "#3182ce",
    status: "ACTIVE",
    sortOrder: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_backend",
    name: "后端开发工程师",
    code: "BACKEND_DEV",
    description: "负责分布式业务微服务逻辑开发、高并发调度治理与数据库持久层优化",
    color: "#2b6cb0",
    status: "ACTIVE",
    sortOrder: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_devops",
    name: "DevOps运维工程师",
    code: "DEVOPS_ENG",
    description: "负责全链路CI/CD自动化流水线编排、容器集群运行部署与7x24h高可用监控",
    color: "#00b4d8",
    status: "ACTIVE",
    sortOrder: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_qa",
    name: "测试开发工程师",
    code: "QA_ENGINEER",
    description: "负责全平台自动化测试套件构建、代码质量度量、性能压测与上线发布质量门禁",
    color: "#38a169",
    status: "ACTIVE",
    sortOrder: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_pm",
    name: "产品经理",
    code: "PRODUCT_MGR",
    description: "负责企业业务需求全景梳理、用户旅程PRD设计与产品生命周期敏捷闭环",
    color: "#dd6b20",
    status: "ACTIVE",
    sortOrder: 6,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_ui",
    name: "UI/UX交互设计师",
    code: "UI_DESIGNER",
    description: "负责知阁设计系统规范沉淀、高保真视觉走查与人机交互直觉调优",
    color: "#e53e3e",
    status: "ACTIVE",
    sortOrder: 7,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_security",
    name: "安全合规审计专家",
    code: "SECURITY_OFFICER",
    description: "负责全域数据安全隔离合规审查、权限攻防渗透测试与漏洞治理审计",
    color: "#d69e2e",
    status: "ACTIVE",
    sortOrder: 8,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_fullstack",
    name: "全栈开发工程师",
    code: "FULLSTACK_DEV",
    description: "负责端到端业务闭环开发，独立交付前后端功能模块与数据流打通",
    color: "#319795",
    status: "ACTIVE",
    sortOrder: 9,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_sre",
    name: "SRE稳定性保障工程师",
    code: "SRE_ENGINEER",
    description: "负责生产高可用架构防护、容量规划评估、混沌工程压测与应急演练",
    color: "#4c51bf",
    status: "ACTIVE",
    sortOrder: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_mobile",
    name: "移动端开发工程师",
    code: "MOBILE_DEV",
    description: "负责小程序、跨端移动 App 客户端研发与高性能响应式适配",
    color: "#2b6cb0",
    status: "ACTIVE",
    sortOrder: 11,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_auto_qa",
    name: "自动化测试工程师",
    code: "AUTOMATION_QA",
    description: "负责端到端 E2E 自动化回归脚本编写、接口契约测试与代码覆盖度度量",
    color: "#2f855a",
    status: "ACTIVE",
    sortOrder: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_data_analyst",
    name: "数据分析专家",
    code: "DATA_ANALYST",
    description: "负责全平台研发效能度量大盘构建、用户转化留存与投入产出比 ROI 归因分析",
    color: "#b7791f",
    status: "ACTIVE",
    sortOrder: 13,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_operation",
    name: "产品运营专家",
    code: "PRODUCT_OPS",
    description: "负责平台创作者生态建设、行业标杆方案推广与用户全生命周期增长运营",
    color: "#c05621",
    status: "ACTIVE",
    sortOrder: 14,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_support",
    name: "技术支持工程师",
    code: "TECH_SUPPORT",
    description: "负责关键企业客户对接、复杂部署环境排障与现场应急技术保障服务",
    color: "#4a5568",
    status: "ACTIVE",
    sortOrder: 15,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_scrum",
    name: "敏捷研发教练",
    code: "SCRUM_MASTER",
    description: "负责研发敏捷迭代协同推进、团队效能堵点疏通与跨跨部门协同落地",
    color: "#6b46c1",
    status: "ACTIVE",
    sortOrder: 16,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_sys_admin",
    name: "系统管理员",
    code: "SYSTEM_ADMIN",
    description: "负责企业空间全量资源协同配置、工作空间环境初始化与核心人员权限派发",
    color: "#3182ce",
    status: "ACTIVE",
    sortOrder: 17,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_tech_lead",
    name: "技术负责人",
    code: "TECH_LEAD",
    description: "负责企业研发技术决策、模块架构分解、代码审查与技术团队日常管理",
    color: "#805ad5",
    status: "ACTIVE",
    sortOrder: 18,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_sales",
    name: "销售专家",
    code: "SALES_EXPERT",
    description: "负责企业客户方案咨询、商务协同流程推进与商务资产授权协同",
    color: "#38a169",
    status: "ACTIVE",
    sortOrder: 19,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_pm_manager",
    name: "项目经理",
    code: "PROJECT_MANAGER",
    description: "负责工程项目全生命周期排期推进、跨部门团队资源调度、工期管控与交付目标质量把控",
    color: "#3182ce",
    status: "ACTIVE",
    sortOrder: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_workspace_admin",
    name: "空间管理员",
    code: "WORKSPACE_ADMIN",
    description: "负责企业空间资产配置、项目人员协调管理与日常权限协同调度",
    color: "#805ad5",
    status: "ACTIVE",
    sortOrder: 21,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "std_post_workspace_auditor",
    name: "空间审计员",
    code: "WORKSPACE_AUDITOR",
    description: "负责企业空间操作日志审计、数据合规审查与只读安全监管",
    color: "#718096",
    status: "ACTIVE",
    sortOrder: 22,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

// 标准岗位名称与企业空间现有岗位的智能同义词映射
const POST_ALIAS_MAP: Record<string, string[]> = {
  "项目经理": ["项目经理", "项目总监", "项目负责人", "PM", "交付经理", "工程经理"],
  "空间管理员": ["空间管理员", "企业管理员", "协管员", "管理员", "系统管理员"],
  "空间审计员": ["空间审计员", "审计员", "只读观察员", "合规员", "监督员", "观察员"],
  "系统架构师": ["系统架构师", "技术负责人", "架构师", "首席架构师", "技术总监"],
  "技术负责人": ["技术负责人", "系统架构师", "技术经理", "TL", "Tech Lead"],
  "前端开发工程师": ["前端开发工程师", "前端开发", "前端工程师", "Web前端", "前端"],
  "后端开发工程师": ["后端开发工程师", "后端开发", "后端工程师", "服务端开发", "Java开发", "Go开发"],
  "DevOps运维工程师": ["DevOps运维工程师", "运维工程师", "运维", "DevOps", "运维专家"],
  "测试开发工程师": ["测试开发工程师", "测试工程师", "质量管理员", "QA", "测试员", "质检员"],
  "产品经理": ["产品经理", "产品总监", "产品负责人"],
  "UI/UX交互设计师": ["UI/UX交互设计师", "UI设计师", "视觉设计师", "交互设计师", "UI/UX", "设计专家"],
  "安全合规审计专家": ["安全合规审计专家", "安全专家", "安全工程师", "合规安全官", "网络安全员"],
  "全栈开发工程师": ["全栈开发工程师", "全栈工程师", "FullStack"],
  "系统管理员": ["系统管理员", "企业管理员", "超管"],
  "产品运营专家": ["产品运营专家", "产品运营", "运营专家", "运营专员", "运营经理"],
  "销售专家": ["销售专家", "客户经理", "商务专员", "销售总监"],
  "技术支持工程师": ["技术支持工程师", "技术支持", "客户技术支持", "售后工程师"],
  "敏捷研发教练": ["敏捷研发教练", "Scrum Master", "敏捷教练", "敏捷管理"],
};

// 辅助：从数据库读取标准岗位列表
export async function getStandardPostsFromDB(): Promise<StandardPostItem[]> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: PLATFORM_STANDARD_POSTS_KEY },
    });

    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 增量合并默认官方标准岗位，确保新标准岗位可见
        const existingNames = new Set(parsed.map((p: any) => p.name));
        const missingDefaults = DEFAULT_STANDARD_POSTS.filter((p) => !existingNames.has(p.name));
        if (missingDefaults.length > 0) {
          const merged = [...parsed, ...missingDefaults];
          await saveStandardPostsToDB(merged);
          return merged;
        }
        return parsed;
      }
    }

    // 若无配置，进行初始化持久化
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_STANDARD_POSTS_KEY },
      create: {
        key: PLATFORM_STANDARD_POSTS_KEY,
        value: JSON.stringify(DEFAULT_STANDARD_POSTS),
      },
      update: {
        value: JSON.stringify(DEFAULT_STANDARD_POSTS),
      },
    });

    return DEFAULT_STANDARD_POSTS;
  } catch (err) {
    console.error("读取标准岗位配置失败，回退到默认列表:", err);
    return DEFAULT_STANDARD_POSTS;
  }
}

// 辅助：保存标准岗位列表到数据库
async function saveStandardPostsToDB(posts: StandardPostItem[]): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_STANDARD_POSTS_KEY },
      create: {
        key: PLATFORM_STANDARD_POSTS_KEY,
        value: JSON.stringify(posts),
      },
      update: {
        value: JSON.stringify(posts),
      },
    });
    return true;
  } catch (err) {
    console.error("保存标准岗位配置失败:", err);
    return false;
  }
}

// GET: 获取全平台官方标准岗位列表（附带企业空间装配引用详情：具体空间与在编人数）
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 标准岗位目录为全平台公共参考数据：超管后台与企业空间（OWNER/ADMIN）均需读取以完成一键装配引入，
    // 故 GET 仅需登录态即可访问；写操作（POST/PATCH/DELETE）仍严格限定平台管理员。
    // 1. 读取标准岗位
    const standardPosts = await getStandardPostsFromDB();

    // 2. 查询全平台工作空间基准信息（含西安云舜科技等企业协同空间）
    const allWorkspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
    });
    const workspaceMap = new Map(allWorkspaces.map((w) => [w.id, w]));

    // 3. 查询全平台空间成员岗位配置（workspacemember）
    const allWorkspaceMembers = await prisma.workspacemember.findMany({
      select: {
        workspaceId: true,
        userId: true,
        role: true,
      },
    });

    // 4. 查询数据库标准岗位代码映射
    const dbPositions = await prisma.position.findMany({
      select: { id: true, code: true, name: true },
    });
    const dbPositionMap = new Map(dbPositions.map((p) => [p.code.toUpperCase(), p.name]));

    // 5. 查询空间专属岗位配置（workspacepost，若空间进行了自定义装配）
    const allWorkspacePosts = await prisma.workspacepost.findMany({
      include: {
        workspace: {
          select: { id: true, name: true, type: true, description: true },
        },
        _count: {
          select: { postmember: true },
        },
      },
    });

    // 6. 统计全平台各企业空间对岗位的引用明细（联合 member 与 post 两大来源）
    const uniqueWorkspacesWithPosts = new Set<string>();
    const allUsageRows: Array<{
      id: string;
      postName: string;
      postCode: string;
      postColor: string;
      workspaceId: string;
      workspaceName: string;
      workspaceType: string;
      memberCount: number;
    }> = [];

    const postsWithStats = standardPosts.map((post) => {
      const aliasList = (POST_ALIAS_MAP[post.name] || [post.name]).map((a) => a.toLowerCase());
      const postCodeUpper = (post.code || "").toUpperCase();
      const matchedMap = new Map<
        string,
        { id: string; name: string; type: string; memberCount: number }
      >();

      // 6.1 从空间成员 role / position 归集引用（支持西安云舜科技等真实企业空间）
      allWorkspaceMembers.forEach((m) => {
        const ws = workspaceMap.get(m.workspaceId);
        if (!ws) return;

        const roleUpper = (m.role || "").toUpperCase();
        const roleName = (dbPositionMap.get(roleUpper) || "").toLowerCase();
        const postNameLower = post.name.toLowerCase();

        const isCodeMatch =
          roleUpper === postCodeUpper ||
          (postCodeUpper === "OWNER" && (roleUpper === "OWNER" || roleUpper === "CREATOR")) ||
          (postCodeUpper === "ADMIN" && roleUpper === "ADMIN") ||
          (postCodeUpper === "PROJECT_MANAGER" && (roleUpper === "PM" || roleUpper === "PROJECT_MANAGER")) ||
          (postCodeUpper === "DEVOPS_ENG" && (roleUpper === "DEVOPS_ENGINEER" || roleUpper === "DEVOPS"));

        const isNameMatch =
          roleName === postNameLower ||
          aliasList.includes(roleName) ||
          roleName.includes(postNameLower) ||
          postNameLower.includes(roleName);

        if (isCodeMatch || isNameMatch) {
          uniqueWorkspacesWithPosts.add(ws.id);
          const prev = matchedMap.get(ws.id);
          matchedMap.set(ws.id, {
            id: ws.id,
            name: ws.name || "未命名空间",
            type: ws.type || "ENTERPRISE",
            memberCount: (prev?.memberCount || 0) + 1,
          });
        }
      });

      // 6.2 从空间独立创建的 workspacepost 归集引用
      allWorkspacePosts.forEach((wp) => {
        if (!wp.workspace) return;
        const wpNameLower = wp.name.trim().toLowerCase();
        const postNameLower = post.name.trim().toLowerCase();

        const isMatched =
          wpNameLower === postNameLower ||
          aliasList.includes(wpNameLower) ||
          wpNameLower.includes(postNameLower) ||
          postNameLower.includes(wpNameLower);

        if (isMatched) {
          uniqueWorkspacesWithPosts.add(wp.workspace.id);
          const prev = matchedMap.get(wp.workspace.id);
          const count = wp._count?.postmember || 1;
          matchedMap.set(wp.workspace.id, {
            id: wp.workspace.id,
            name: wp.workspace.name || "未命名空间",
            type: wp.workspace.type || "ENTERPRISE",
            memberCount: (prev?.memberCount || 0) + count,
          });
        }
      });

      const usedWorkspaces = Array.from(matchedMap.values());
      const totalAssignedMembers = usedWorkspaces.reduce((acc, curr) => acc + curr.memberCount, 0);

      // 记录到全局透视列表（供 Tab 2 极简明细表秒速消费）
      usedWorkspaces.forEach((ws) => {
        allUsageRows.push({
          id: `${post.id}_${ws.id}`,
          postName: post.name,
          postCode: post.code,
          postColor: post.color,
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceType: ws.type,
          memberCount: ws.memberCount,
        });
      });

      return {
        ...post,
        usageCount: usedWorkspaces.length,
        totalAssignedMembers,
        usedWorkspaces,
      };
    });

    // 计算全平台在编成员总数
    const totalAssignedMembersAll = postsWithStats.reduce(
      (sum, p) => sum + (p.totalAssignedMembers || 0),
      0
    );

    // 7. 读取企业空间提报岗位记录
    const { getSubmittedPostsFromDB } = await import("@/lib/workspace-post-submissions");
    const submissions = await getSubmittedPostsFromDB();

    return NextResponse.json({
      success: true,
      posts: postsWithStats,
      usages: allUsageRows,
      submissions,
      pendingSubmissionsCount: submissions.filter((s) => s.status === "PENDING").length,
      stats: {
        totalPosts: standardPosts.length,
        activePosts: standardPosts.filter((p) => p.status === "ACTIVE").length,
        disabledPosts: standardPosts.filter((p) => p.status === "DISABLED").length,
        totalWorkspaces: allWorkspaces.length,
        workspacesWithPosts: uniqueWorkspacesWithPosts.size,
        totalWorkspacePosts: allUsageRows.length,
        totalAssignedMembers: totalAssignedMembersAll,
        pendingSubmissions: submissions.filter((s) => s.status === "PENDING").length,
      },
    });
  } catch (error) {
    console.error("获取标准岗位列表失败:", error);
    return NextResponse.json({ error: "获取标准岗位列表失败" }, { status: 500 });
  }
}

// POST: 管理员新增标准岗位
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, description, color, status, sortOrder } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "岗位名称不能为空" }, { status: 400 });
    }

    const standardPosts = await getStandardPostsFromDB();

    // 查重：岗位名称不能重复
    if (standardPosts.some((p) => p.name.trim() === name.trim())) {
      return NextResponse.json({ error: "已存在同名的标准岗位" }, { status: 400 });
    }

    const newPost: StandardPostItem = {
      id: `std_post_${Date.now()}`,
      name: name.trim(),
      code: (code && code.trim().toUpperCase()) || `POST_${Date.now()}`,
      description: description ? description.trim() : "",
      color: color || "#3182ce",
      status: status === "DISABLED" ? "DISABLED" : "ACTIVE",
      sortOrder: typeof sortOrder === "number" ? sortOrder : standardPosts.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = [...standardPosts, newPost];
    const saved = await saveStandardPostsToDB(updatedList);

    if (!saved) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      post: newPost,
      message: "标准岗位添加成功",
    });
  } catch (error) {
    console.error("新增标准岗位失败:", error);
    return NextResponse.json({ error: "新增标准岗位失败" }, { status: 500 });
  }
}

// PATCH: 管理员编辑标准岗位 / 切换状态
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, description, color, status, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少岗位ID" }, { status: 400 });
    }

    const standardPosts = await getStandardPostsFromDB();
    const targetIndex = standardPosts.findIndex((p) => p.id === id);

    if (targetIndex === -1) {
      return NextResponse.json({ error: "未找到该标准岗位" }, { status: 404 });
    }

    // 若修改了名称，检查是否与其他岗位重名
    if (name && name.trim() !== standardPosts[targetIndex].name) {
      if (standardPosts.some((p) => p.id !== id && p.name.trim() === name.trim())) {
        return NextResponse.json({ error: "已存在同名岗位" }, { status: 400 });
      }
    }

    const existing = standardPosts[targetIndex];
    const updatedPost: StandardPostItem = {
      ...existing,
      name: name !== undefined ? name.trim() : existing.name,
      code: code !== undefined ? code.trim().toUpperCase() : existing.code,
      description: description !== undefined ? description.trim() : existing.description,
      color: color !== undefined ? color : existing.color,
      status: status !== undefined ? status : existing.status,
      sortOrder: typeof sortOrder === "number" ? sortOrder : existing.sortOrder,
      updatedAt: new Date().toISOString(),
    };

    standardPosts[targetIndex] = updatedPost;
    const saved = await saveStandardPostsToDB(standardPosts);

    if (!saved) {
      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      post: updatedPost,
      message: "标准岗位更新成功",
    });
  } catch (error) {
    console.error("更新标准岗位失败:", error);
    return NextResponse.json({ error: "更新标准岗位失败" }, { status: 500 });
  }
}

// DELETE: 删除标准岗位
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少岗位ID" }, { status: 400 });
    }

    const standardPosts = await getStandardPostsFromDB();
    const targetPost = standardPosts.find((p) => p.id === id);

    if (!targetPost) {
      return NextResponse.json({ error: "未找到该标准岗位" }, { status: 404 });
    }

    const updatedList = standardPosts.filter((p) => p.id !== id);
    const saved = await saveStandardPostsToDB(updatedList);

    if (!saved) {
      return NextResponse.json({ error: "删除失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "标准岗位已删除",
    });
  } catch (error) {
    console.error("删除标准岗位失败:", error);
    return NextResponse.json({ error: "删除标准岗位失败" }, { status: 500 });
  }
}
