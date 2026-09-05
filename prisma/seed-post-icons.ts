/**
 * 岗位商务图标库 seed + 存量岗位图标迁移
 *
 * 职责一：初始化 posticonlibrary（lucide 商务图标，前端图标选择器的唯一数据源）
 * 职责二：将 platformstandardpost / workspacepost 中「emoji 表情 / 空值」图标
 *         幂等迁移为规范的 lucide 图标名（Crown/UserCog/Briefcase…），
 *         确保不同岗位使用不同图标、杜绝 emoji 与 AI 风格表情残留。
 *
 * 说明：仅当图标为空或以 emoji 字符开头时才迁移；已是合法 lucide 图标名的记录
 *       一律跳过，绝不覆盖管理员/用户手工设置的自定义图标。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IconItem {
  key: string;
  name: string;
  category: string;
}

// 岗位商务图标库（lucide 图标组件名必须真实存在于 lucide-react）
const ICONS: IconItem[] = [
  // 治理权限
  { key: "Crown", name: "最高管控权限", category: "governance" },
  { key: "UserCog", name: "空间管理角色", category: "governance" },
  { key: "ShieldCheck", name: "安全权限角色", category: "governance" },
  { key: "KeyRound", name: "密钥访问角色", category: "governance" },
  { key: "BadgeCheck", name: "认证授权角色", category: "governance" },
  // 团队协作
  { key: "Users", name: "团队协作角色", category: "team" },
  { key: "UserPlus", name: "外联招募角色", category: "team" },
  { key: "UserRound", name: "通用岗位成员", category: "team" },
  { key: "MessagesSquare", name: "沟通协作角色", category: "team" },
  // 商务经营
  { key: "Briefcase", name: "商务统筹岗位", category: "business" },
  { key: "BriefcaseBusiness", name: "商务专员岗位", category: "business" },
  { key: "Building2", name: "组织与公司管理", category: "business" },
  { key: "Landmark", name: "机构与金融服务", category: "business" },
  { key: "Target", name: "商务销售目标岗位", category: "business" },
  { key: "Award", name: "荣誉资质与评审", category: "business" },
  // 财务法务
  { key: "DollarSign", name: "财务资金岗位", category: "finance" },
  { key: "Wallet", name: "账务出纳岗位", category: "finance" },
  { key: "Banknote", name: "结算与资金岗位", category: "finance" },
  { key: "Receipt", name: "报销与账单岗位", category: "finance" },
  // 项目交付
  { key: "CalendarDays", name: "计划与排期岗位", category: "delivery" },
  { key: "ClipboardList", name: "项目计划与任务岗位", category: "delivery" },
  { key: "ClipboardCheck", name: "质量检验与验收岗位", category: "delivery" },
  { key: "Package", name: "成果交付与发布岗位", category: "delivery" },
  { key: "Truck", name: "物流与供应链岗位", category: "delivery" },
  { key: "PenTool", name: "方案设计与原型岗位", category: "delivery" },
  { key: "FolderKanban", name: "项目统筹与看板岗位", category: "delivery" },
  { key: "HardHat", name: "现场实施与工程岗位", category: "delivery" },
  { key: "Factory", name: "生产与运营岗位", category: "delivery" },
  // 研发运维
  { key: "Database", name: "数据架构与数据库岗位", category: "dev" },
  { key: "GitBranch", name: "研发协作岗位", category: "dev" },
  { key: "Braces", name: "工程开发岗位", category: "dev" },
  { key: "Bug", name: "质量测试岗位", category: "dev" },
  { key: "Settings2", name: "系统配置与运维岗位", category: "dev" },
  { key: "Wrench", name: "运维工具岗位", category: "dev" },
  // 审计监管
  { key: "Eye", name: "审计观察与合规岗位", category: "audit" },
  { key: "FileSearch", name: "文档核查岗位", category: "audit" },
  { key: "Gavel", name: "法务合规岗位", category: "audit" },
  { key: "Lock", name: "数据保密与安全岗位", category: "audit" },
  { key: "BookOpenCheck", name: "培训与知识管理岗位", category: "audit" },
  { key: "ChartColumn", name: "经营分析与洞察岗位", category: "audit" },
  { key: "Boxes", name: "资产与物料管理岗位", category: "audit" },
];

// 存量 emoji 图标 -> lucide 图标名（用于历史数据迁移，运行时岗位数据一律来自数据库）
const EMOJI_TO_KEY: Record<string, string> = {
  "👑": "Crown",
  "🛡️": "ShieldCheck",
  "💼": "Briefcase",
  "📄": "FileText",
  "🧩": "Braces",
  "📐": "PenTool",
  "💻": "Braces",
  "🏗️": "HardHat",
  "✅": "ClipboardCheck",
  "🐳": "GitBranch",
  "👁️": "Eye",
  "🚚": "Truck",
  "📝": "PenTool",
  "📊": "ChartColumn",
  "🔧": "Wrench",
  "📦": "Package",
  "🗄️": "Database",
  "🔍": "FileSearch",
  "🧪": "FlaskConical",
  "🚀": "Target",
};

/** 是否为合法的 lucide 图标名（纯英文/数字，首字符大写字母） */
function isLucideKey(value?: string | null): boolean {
  return !!value && /^[A-Z][A-Za-z0-9]*$/.test(value.trim());
}

/** 名称关键词 -> 图标 key 定向匹配（基石岗位与常见官方岗位保持图标稳定且互不相同） */
function matchNameToKey(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (/(所有者|owner)/.test(n)) return "Crown";
  if (/(管理员|admin)/.test(n)) return "UserCog";
  if (/(审计|audit|监事)/.test(n)) return "Eye";
  if (/(财务|出纳|会计|资金)/.test(n)) return "DollarSign";
  if (/(法务|合规|风控)/.test(n)) return "Gavel";
  if (/(项目经理|pm)/.test(n)) return "ClipboardList";
  if (/(产品|prd)/.test(n)) return "PenTool";
  if (/(投标|标书|招标)/.test(n)) return "FileText";
  if (/(商务|销售|市场|营销|打单)/.test(n)) return "Briefcase";
  if (/(后端|开发|研发|工程师)/.test(n)) return "Braces";
  if (/(前端|ui|ux|视觉|设计)/.test(n)) return "PenTool";
  if (/(数据|数据库|dba|架构)/.test(n)) return "Database";
  if (/(测试|qa|质量)/.test(n)) return "ClipboardCheck";
  if (/(运维|devops|部署|实施)/.test(n)) return "Wrench";
  if (/(需求|分析)/.test(n)) return "FileSearch";
  if (/(交付|客服|对接|统筹)/.test(n)) return "Package";
  if (/(培训|知识|文档)/.test(n)) return "BookOpenCheck";
  if (/(物流|供应链|仓储|运输)/.test(n)) return "Truck";
  if (/(保密|安全|风控|监管)/.test(n)) return "Lock";
  return null;
}

/** 根据匹配结果 + 占用集合解析最终图标 key（避免同表岗位图标重复） */
function resolveIcon(
  postName: string,
  postIcon: string | null,
  isSystem: boolean,
  keys: string[],
  used: Set<string>,
  fallbackIndex: number,
): string {
  if (isSystem) return "Crown";
  const candidate = matchNameToKey(postName) || EMOJI_TO_KEY[postIcon || ""] || "";
  if (candidate && !used.has(candidate)) return candidate;
  const fallback = keys[fallbackIndex % keys.length] || "UserRound";
  return keys.filter((k) => !used.has(k))[0] || fallback;
}

async function main() {
  // ========== 1. 初始化图标库 ==========
  const catalogKeys = new Map<string, number>();
  for (let i = 0; i < ICONS.length; i++) {
    const item = ICONS[i];
    await prisma.posticonlibrary.upsert({
      where: { iconKey: item.key },
      update: { name: item.name, category: item.category, isActive: true, sortOrder: i + 1 },
      create: {
        id: `icon_${item.key.toLowerCase()}`,
        iconKey: item.key,
        name: item.name,
        category: item.category,
        isActive: true,
        sortOrder: i + 1,
      },
    });
    catalogKeys.set(item.key, i);
  }
  const libKeys = ICONS.map((i) => i.key);
  console.log(`[post-icons] 岗位商务图标库就绪，共 ${ICONS.length} 个图标`);

  // ========== 2. 迁移 platformstandardpost（官方标准岗位） ==========
  const stdUsed = new Set<string>();
  const stdPosts = await prisma.platformstandardpost.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  for (let idx = 0; idx < stdPosts.length; idx++) {
    const post = stdPosts[idx];
    if (isLucideKey(post.icon)) {
      stdUsed.add(post.icon!.trim());
      continue; // 已是合法 lucide 图标名，跳过
    }
    const next = resolveIcon(post.name, post.icon, post.isSystemReserved, libKeys, stdUsed, idx);
    await prisma.platformstandardpost.update({
      where: { id: post.id },
      data: { icon: next },
    });
    stdUsed.add(next);
    console.log(`[post-icons] 标准岗位「${post.name}」图标: ${post.icon || "(空)"} -> ${next}`);
  }

  // ========== 3. 迁移 workspacepost（各空间装配岗位） ==========
  const libUsed = new Set<string>();
  const wsPosts = await prisma.workspacepost.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
  for (let idx = 0; idx < wsPosts.length; idx++) {
    const post = wsPosts[idx];
    if (isLucideKey(post.icon)) {
      libUsed.add(post.icon!.trim());
      continue;
    }
    const next = resolveIcon(post.name, post.icon, post.isSystem, libKeys, libUsed, idx);
    await prisma.workspacepost.update({
      where: { id: post.id },
      data: { icon: next },
    });
    libUsed.add(next);
    console.log(`[post-icons] 空间岗位「${post.name}」图标: ${post.icon || "(空)"} -> ${next}`);
  }

  console.log("[post-icons] 岗位图标迁移完成（emoji -> lucide 商务图标）");
}

main()
  .catch((e) => {
    console.error("[post-icons] 执行失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
