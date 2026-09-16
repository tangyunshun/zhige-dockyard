import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface SiteRouteItem {
  label: string;
  url: string;
  description: string;
  category: string;
  badge?: string;
  icon?: string;
  isDynamic?: boolean;
}

export interface SiteRouteGroup {
  category: string;
  icon: string;
  routes: SiteRouteItem[];
}

// 预置的标准系统业务域与路由基础字典
const KNOWN_ROUTE_METAS: Record<string, { label: string; description: string; category: string; icon: string; badge?: string }> = {
  "/capabilities": {
    label: "核心能力与模块",
    description: "全生命周期工程组件能力体系",
    category: "核心业务与工作台",
    icon: "Boxes",
  },
  "/market": {
    label: "组件市场广场",
    description: "企业级组件发现、筛选与接入",
    category: "核心业务与工作台",
    icon: "Store",
  },
  "/studio": {
    label: "工程工作台",
    description: "在线组件可视化设计与开发",
    category: "核心业务与工作台",
    icon: "LayoutDashboard",
  },
  "/workspace-hub": {
    label: "工作空间中枢",
    description: "个人与团队项目统一控制台",
    category: "核心业务与工作台",
    icon: "FolderKanban",
  },
  "/tasks": {
    label: "效能任务看板",
    description: "跨空间任务协作与进度看板",
    category: "核心业务与工作台",
    icon: "CheckSquare",
  },
  "/solutions": {
    label: "行业解决方案总览",
    description: "四大核心行业信创解决方案",
    category: "行业场景解决方案",
    icon: "Briefcase",
  },
  "/solutions?type=gov": {
    label: "政务云信创方案",
    description: "安全可控的政务软件架构",
    category: "行业场景解决方案",
    icon: "Shield",
  },
  "/solutions?type=military": {
    label: "军工科研解决方案",
    description: "高等级内网隔离与研发规范",
    category: "行业场景解决方案",
    icon: "Lock",
  },
  "/solutions?type=fintech": {
    label: "金融安全解决方案",
    description: "分布式交易与合规风控",
    category: "行业场景解决方案",
    icon: "DollarSign",
  },
  "/solutions?type=city": {
    label: "智慧城市物联网",
    description: "数字化建模与物联网中台集成",
    category: "行业场景解决方案",
    icon: "Building2",
  },
  "/docs": {
    label: "开发者文档中心",
    description: "系统集成、API 文档与快速上手",
    category: "开发者生态与技术文档",
    icon: "FileText",
  },
  "/developers": {
    label: "开发者开放社区",
    description: "极客社区、开源规范与生态伙伴",
    category: "开发者生态与技术文档",
    icon: "Code2",
  },
  "/knowledge": {
    label: "最佳实践知识库",
    description: "组件复用规范与架构白皮书",
    category: "开发者生态与技术文档",
    icon: "BookOpen",
  },
  "/releases": {
    label: "平台版本发布日志",
    description: "历史版本迭代与更新记录",
    category: "开发者生态与技术文档",
    icon: "GitBranch",
  },
  "/help": {
    label: "帮助与服务支持",
    description: "常见故障排查与工单服务",
    category: "开发者生态与技术文档",
    icon: "HelpCircle",
  },
  "/security": {
    label: "全生命周期安全",
    description: "信创等保三级与静态代码安全",
    category: "安全风控与服务合规",
    icon: "ShieldCheck",
  },
  "/pricing": {
    label: "会员权益与算力定价",
    description: "个人版/专业版/企业版算力价格",
    category: "安全风控与服务合规",
    icon: "Tag",
  },
  "/privacy-policy": {
    label: "用户隐私保护指引",
    description: "合规隐私政策与数据使用声明",
    category: "安全风控与服务合规",
    icon: "FileCheck",
  },
  "/terms-of-service": {
    label: "平台服务许可协议",
    description: "终端用户协议与法律条款",
    category: "安全风控与服务合规",
    icon: "Scroll",
  },
  "/account-appeal": {
    label: "账号封禁申诉通道",
    description: "安全限制申诉与人工复审",
    category: "安全风控与服务合规",
    icon: "AlertCircle",
  },
  "/user/settings": {
    label: "个人偏好设置",
    description: "界面外观、语言、时区与操作偏好",
    category: "用户中心与个人偏好",
    icon: "Settings",
  },
  "/user/activities": {
    label: "个人活动轨迹",
    description: "多设备登录、操作审计与安全日志",
    category: "用户中心与个人偏好",
    icon: "Activity",
  },
  "/user/billing-center": {
    label: "个人财务账单",
    description: "算力积分充值、流水明细与发票",
    category: "用户中心与个人偏好",
    icon: "CreditCard",
  },
  "/user/security": {
    label: "账号安全中心",
    description: "密码修改、多重认证与安全绑定",
    category: "用户中心与个人偏好",
    icon: "KeyRound",
  },
  "/user/developer": {
    label: "开放平台令牌",
    description: "个人 API 密钥与开放平台调用凭证",
    category: "用户中心与个人偏好",
    icon: "Terminal",
  },
  "/user/team": {
    label: "团队协作协同",
    description: "团队成员排布、角色流转与授权",
    category: "用户中心与个人偏好",
    icon: "Users",
  },
  "/user/sub-accounts": {
    label: "子账号权限体系",
    description: "多席位账号派发与操作权限管控",
    category: "用户中心与个人偏好",
    icon: "UserPlus",
  },
  "/maintenance": {
    label: "系统维护告示",
    description: "停机维护与系统升级倒计时指示",
    category: "安全风控与服务合规",
    icon: "Wrench",
  },
};

/**
 * 递归扫描 Next.js src/app 物理文件目录，自动提取所有已构建的合法 page 路由
 */
function scanAppRouterPages(appDir: string, baseRelative = ""): string[] {
  const detectedRoutes: string[] = [];
  try {
    if (!fs.existsSync(appDir)) return detectedRoutes;
    const entries = fs.readdirSync(appDir, { withFileTypes: true });

    for (const entry of entries) {
      // 忽略 api 路由、内部下划线私有目录、测试目录与 node_modules
      if (entry.name.startsWith("_") || entry.name.startsWith(".") || entry.name === "api" || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(appDir, entry.name);
      if (entry.isDirectory()) {
        // 忽略动态参数目录 [id], [key] 等不适合作为固定导航的路径
        if (entry.name.startsWith("[") && entry.name.endsWith("]")) {
          continue;
        }
        // 忽略后台管理路径（导航栏为前台/工作台服务）
        if (entry.name === "admin" || entry.name === "auth") {
          continue;
        }

        const childRelative = baseRelative ? `${baseRelative}/${entry.name}` : entry.name;
        detectedRoutes.push(...scanAppRouterPages(fullPath, childRelative));
      } else if (entry.isFile()) {
        if (/^page\.(tsx|jsx|js|ts)$/.test(entry.name)) {
          const route = baseRelative ? `/${baseRelative}` : "/";
          detectedRoutes.push(route);
        }
      }
    }
  } catch (err) {
    console.error("[SiteRoutes] 扫描 app 路由目录出错:", err);
  }
  return detectedRoutes;
}

export async function GET() {
  try {
    // 1. 扫描文件系统，获取真实存在的物理路由
    const appDirPath = path.join(process.cwd(), "src", "app");
    const scannedRoutes = scanAppRouterPages(appDirPath);

    // 2. 汇聚路由项
    const allRoutesMap = new Map<string, SiteRouteItem>();

    // 2.1 先载入标准预置路由
    for (const [url, meta] of Object.entries(KNOWN_ROUTE_METAS)) {
      allRoutesMap.set(url, {
        label: meta.label,
        url,
        description: meta.description,
        category: meta.category,
        icon: meta.icon,
        badge: meta.badge || "内置标准",
        isDynamic: false,
      });
    }

    // 2.2 自动感知文件系统中新加入的页面路由（若未在字典中，自动分析并录入）
    for (const route of scannedRoutes) {
      if (route === "/") continue; // 根目录单独处理或通过 Logo 跳转

      if (!allRoutesMap.has(route)) {
        // 从物理页面推导友好的标题
        const cleanName = route.replace(/^\//, "").replace(/\//g, " · ");
        const formattedLabel = cleanName
          .split("-")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" ");

        allRoutesMap.set(route, {
          label: `${formattedLabel} 模块`,
          url: route,
          description: `系统物理新增功能页面 (${route})`,
          category: "自动感知的新增功能与页面",
          icon: "Radar",
          badge: "自动感知新功能",
          isDynamic: true,
        });
      }
    }

    // 2.3 从数据库读取最新已发布的组件模块（实现数据库级业务扩展无需改代码）
    try {
      const components = await prisma.component.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, name: true, description: true, type: true },
        take: 12,
        orderBy: { updatedAt: "desc" },
      });

      for (const comp of components) {
        const compUrl = `/studio?componentId=${encodeURIComponent(comp.id)}`;
        allRoutesMap.set(compUrl, {
          label: `${comp.name}`,
          url: compUrl,
          description: comp.description || `已发布的 ${comp.type || "组件"} 模块`,
          category: "动态已发布工程组件",
          icon: "Component",
          badge: "数据库组件",
          isDynamic: true,
        });
      }
    } catch (dbErr) {
      console.warn("[SiteRoutes] 查询已发布组件降级处理:", dbErr);
    }

    // 3. 按分类分组归拢
    const categoryOrder = [
      "核心业务与工作台",
      "行业场景解决方案",
      "开发者生态与技术文档",
      "安全风控与服务合规",
      "用户中心与个人偏好",
      "自动感知的新增功能与页面",
      "动态已发布工程组件",
    ];

    const groupMap = new Map<string, SiteRouteItem[]>();
    for (const item of allRoutesMap.values()) {
      const cat = item.category || "其它功能";
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(item);
    }

    const groups: SiteRouteGroup[] = [];
    for (const cat of categoryOrder) {
      if (groupMap.has(cat) && groupMap.get(cat)!.length > 0) {
        let icon = "Folder";
        if (cat.includes("核心")) icon = "Boxes";
        else if (cat.includes("行业")) icon = "Briefcase";
        else if (cat.includes("开发")) icon = "FileText";
        else if (cat.includes("安全")) icon = "ShieldCheck";
        else if (cat.includes("用户")) icon = "User";
        else if (cat.includes("自动感知")) icon = "Radar";
        else if (cat.includes("组件")) icon = "Component";

        groups.push({
          category: cat,
          icon,
          routes: groupMap.get(cat)!,
        });
        groupMap.delete(cat);
      }
    }

    // 追加其他未知分类
    for (const [cat, routes] of groupMap.entries()) {
      if (routes.length > 0) {
        groups.push({
          category: cat,
          icon: "Layers",
          routes,
        });
      }
    }

    const totalRoutesCount = allRoutesMap.size;

    return NextResponse.json({
      success: true,
      total: totalRoutesCount,
      groups,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[SiteRoutes] 获取站内路由失败:", e);
    return NextResponse.json(
      {
        success: false,
        error: e.message || "获取系统路由失败",
        groups: [],
      },
      { status: 500 }
    );
  }
}
