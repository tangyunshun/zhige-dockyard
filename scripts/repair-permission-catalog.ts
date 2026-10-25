/**
 * 权限目录一次性修复脚本：
 *
 * 背景：历史「系统接口自动登记」机制曾把两类东西错误登记进权限目录
 *  1) 审计日志 action 名（如 testimonial:delete / user:batch_kick / token_settlement:delete），
 *     它们只出现在 writeAuditLog(...) 的动作参数里，从未被任何 requirePlatformPermission 门禁使用；
 *  2) 无任何代码引用的孤儿键（modelpo_licy:*，src 全库 0 引用）。
 * 这些"幽灵权限点"会误导管理员授予权（授了也门禁不到任何接口）。
 *
 * 同时，部分真实键（finance/maintenance/risk）被登记成了模板描述的自动分组，
 * 而官方种子目录（/api/admin/permissions 的 INITIAL_PERMISSIONS_CATALOG）里已有正式元数据。
 *
 * 本脚本做四件事（幂等，可重复执行）：
 *  A. 把 finance/maintenance/risk 键迁入官方分组并套用正式中文元数据；
 *  B. 新增「演示申请管理模块 (Demo Requests)」并正式登记 demo:read / demo:manage；
 *  C. 从目录中剔除全部误登记键，并删除因此清空的分组；
 *  D. 同步清理所有管理员授权清单中引用的误登记键（这些键从未参与任何门禁，剔除无副作用）。
 *
 * 运行：npx tsx scripts/repair-permission-catalog.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";

const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
const ADMIN_PERMS_KEY = "platform_admin_permissions";
const DRY_RUN = process.argv.includes("--dry-run");

interface CatalogKey {
  key: string;
  label: string;
  desc: string;
  moduleName: string;
  level: string;
}
interface CatalogGroup {
  group: string;
  moduleRoute: string | null;
  description: string;
  keys: CatalogKey[];
}

/** A+B：迁入官方分组 / 正式登记（元数据与 /api/admin/permissions 官方种子保持一致） */
const OFFICIAL_TARGETS: {
  group: string;
  moduleRoute: string;
  groupDescription: string;
  entries: CatalogKey[];
}[] = [
  {
    group: "财务结算管理模块 (Finance)",
    moduleRoute: "/admin/finance",
    groupDescription: "平台资金流入流出对账、开发者收益提现清算与对公发票管理",
    entries: [
      { key: "finance:read", label: "查看财务对账看板", desc: "查看支付通道日结账单、创作者收益池与待结算提现申请", moduleName: "财务结算", level: "read" },
      { key: "finance:settle", label: "执行收益提现打款复核", desc: "复核创作者提现账号与金额，标记打款完成或原路驳回", moduleName: "财务结算", level: "high" },
    ],
  },
  {
    group: "系统维护与发版模块 (Maintenance)",
    moduleRoute: "/admin/maintenance",
    groupDescription: "系统版本发布记录管理、平滑升级公告下发与停机倒计时维护",
    entries: [
      { key: "maintenance:read", label: "查看发版与维护记录", desc: "查阅平台历次版本发布变更说明与历史维护记录日志", moduleName: "系统维护", level: "read" },
      { key: "maintenance:publish", label: "发布系统更新与维护预警", desc: "发布最新产品变更日志，或预先配置全站停机维护倒计时与告警", moduleName: "系统维护", level: "high" },
    ],
  },
  {
    group: "风控与审核模块 (Appeals / Risk)",
    moduleRoute: "/admin/account-appeals",
    groupDescription: "账号解封申诉工单审核、违规处理仲裁与平台安全防刷设置",
    entries: [
      { key: "risk:rule_manage", label: "调整接口防刷规则", desc: "配置登录防爆破、验证码频率与接口防刷安全策略", moduleName: "风控与审核", level: "high" },
    ],
  },
  {
    group: "演示申请管理模块 (Demo Requests)",
    moduleRoute: "/admin/demo-requests",
    groupDescription: "官网访客产品演示预约申请的查阅、检索与跟进状态流转管理",
    entries: [
      { key: "demo:read", label: "查看演示申请列表", desc: "查阅访客提交的产品演示预约申请（姓名、联系方式、公司与需求说明）", moduleName: "演示申请管理", level: "read" },
      { key: "demo:manage", label: "处理演示申请跟进", desc: "更新演示申请的处理状态流转（待处理 / 已联系 / 已关闭）", moduleName: "演示申请管理", level: "normal" },
    ],
  },
];

/** C：确认误登记的键（仅出现在 writeAuditLog 动作参数或全库 0 引用，从未用于 requirePlatformPermission 门禁） */
const BOGUS_KEYS = new Set<string>([
  // 审计动作（用户管理）：真实门禁分别为 user:update / user:reset_session / user:delete / user:security_reset
  "user:adjust_points",
  "user:batch_kick",
  "user:delete_blocked",
  "user:reset_password",
  // 审计动作（风控申诉）：真实门禁为 appeal:approve / appeal:reject / appeal:manage / user:update
  "appeal:account_unban_approved",
  "appeal:account_unban_rejected",
  "appeal:workspace_unban_approved",
  "appeal:workspace_unban_rejected",
  "appeal:deleted",
  // 审计动作（用户评价）：真实门禁为 user_reviews:*（TESTIMONIAL_PERMISSIONS）
  "testimonial:approve",
  "testimonial:config",
  "testimonial:create_rejected",
  "testimonial:delete",
  "testimonial:reject",
  "testimonial:update",
  // 审计动作（押金结算）：真实门禁为 system:manage / billing:manage
  "token_settlement:delete",
  // 全库 0 引用的孤儿键（历史模块残留）
  "modelpo_licy:read",
  "modelpo_licy:create",
  "modelpo_licy:update",
  "modelpo_licy:delete",
  "modelpo_licy:status_update",
  // 审计动作（充值订单确认入账）：真实门禁为 order:manage / order:audit 等
  "billing:recharge_order_confirm",
  // ---- 第二轮全量审计补充（2026-10-23）----
  // 工作空间管理：真实门禁为中间件规则层的 workspace:read / workspace:detail /
  // workspace:status_update / workspace:manage，以下均为 writeAuditLog 动作名
  "workspace:batch_toggle",
  "workspace:disable_check",
  "workspace:list",
  "workspace:view_detail",
  "workspace:toggle_status",
  "workspace:delete",
  "workspace:transfer",
  // 组件管理 / 管理员管理：审计动作（真实门禁为 component:publish、workspace:manage）
  "component:ban",
  "admin:workspace_pool_recycle",
  "admin:workspace_pool_threshold_update",
  // 系统设置：settings 接口真实门禁为 system:manage / system:settings，以下为路由动作派生键
  "system:create_db_backup",
  "system:test_email",
  "system:test_sms",
  "system:update_oauth_channels",
  "system:update_settings",
  "system:maintenance_toggle",
]);

/**
 * 真实键的正式业务描述修正（这些键被门禁/中间件规则/模块注册表实际使用，但此前
 * 被模板化登记为「在 X 中执行 Y 相关操作」或规则引擎派生文案，管理员无法看懂功能）。
 */
const METADATA_FIX: Record<string, { label: string; desc: string; level?: string }> = {
  "user:delete": { label: "删除用户账号", desc: "将用户账号从系统中删除（含删除预检与关联数据清理，高危不可逆）", level: "high" },
  "user:status_update": { label: "变更用户启用/封禁状态", desc: "切换用户账号的启用与封禁状态并同步在线会话处理", level: "sensitive" },
  "workspace:quota_manage": { label: "管理空间资源池阈值", desc: "配置工作空间资源池的回收阈值与自动回收策略（接口规则层引用）", level: "sensitive" },
  "workspace:manage": { label: "空间归档与资源回收", desc: "归档不活跃空间、执行资源池回收等空间高级管控操作（接口规则层引用）", level: "high" },
  "workspace_plan:status_update": { label: "变更空间套餐上下架状态", desc: "上架或停售空间套餐并同步前台可见性", level: "sensitive" },
  "post:status_update": { label: "变更官方岗位启用状态", desc: "启用或停用官方标准岗位的全网分发", level: "sensitive" },
  "component:status_update": { label: "变更组件启停状态", desc: "切换功能组件的启用/停用状态或推进组件生命周期流转", level: "sensitive" },
  "token_pack:status_update": { label: "变更算力包上下架状态", desc: "上架或停售算力加油包并同步前台可见性", level: "sensitive" },
  "order:manage": { label: "处理充值订单与退款执行", desc: "处理充值订单入账、发起并执行退款资金操作", level: "high" },
  "appeal:manage": { label: "申诉工单删除与风控管控", desc: "删除已归档申诉工单并执行风控高级管控操作", level: "high" },
  "announcement:delete": { label: "删除通知公告记录", desc: "删除历史公告、广播与站内通知记录", level: "sensitive" },
  "audit_log:read": { label: "查阅操作审计日志", desc: "查阅管理员操作审计与接口行为日志（接口规则层引用）", level: "read" },
  "system:read": { label: "读取系统设置数据", desc: "读取系统设置页所需的全局配置数据（接口规则层引用）", level: "read" },
  "system:update": { label: "更新系统设置基础字段", desc: "更新系统设置的基础字段与轻量配置", level: "sensitive" },
  "admin:delete": { label: "删除管理员账号", desc: "移除管理员的后台管理身份与账号数据（高危操作）", level: "high" },
  "permission:read": { label: "查看权限配置矩阵", desc: "查看权限目录、模块分组与管理员授权矩阵（只读访问）", level: "read" },
  "permission:manage": { label: "维护权限目录与授权", desc: "维护权限目录结构、权限项与管理员授权分配", level: "high" },
  "user_reviews:delete": { label: "删除用户提交的评价", desc: "从评价墙移除违规或无效的用户评价记录", level: "high" },
  "user_reviews:status_update": { label: "上架或下架用户评价", desc: "切换用户评价在评价墙的展示状态", level: "sensitive" },
  "user_reviews:audit": { label: "审核用户提交的评价", desc: "审核用户自助提交的评价并执行通过上架或驳回", level: "sensitive" },
  "user_reviews:manage": { label: "配置评价轮换展示", desc: "配置评价墙轮换分组与展示策略", level: "high" },
  "content:read": { label: "查阅内容管理数据", desc: "查阅内容管理模块数据并控制后台菜单可见性", level: "read" },
  "content:create": { label: "新增内容管理条目", desc: "在内容管理模块新建条目与资源", level: "normal" },
  "content:update": { label: "编辑内容管理配置", desc: "调整内容管理模块的数据与配置", level: "sensitive" },
  "ai_pricing:toggle": { label: "启停模型定价服务通道", desc: "启用或停用模型算力定价服务通道", level: "high" },
};

/**
 * 接口权限规则层错配修正：/api/admin/permissions* 的规则此前被错配为
 * user:read / workspace_plan:create / post:delete / admin:create，与端点业务完全无关；
 * 按委派设计文档统一为 permission:read / permission:manage（键已在目录中正式登记）。
 */
const RULES_KEY = "PLATFORM_API_PERMISSION_RULES_V1";
const RULES_FIX: { pathPrefix: string; methods: string[]; permission: string; note: string }[] = [
  { pathPrefix: "/api/admin/permissions", methods: ["GET"], permission: "permission:read", note: "修正历史错配（原 user:read）：权限配置矩阵只读访问" },
  { pathPrefix: "/api/admin/permissions", methods: ["POST"], permission: "permission:manage", note: "修正历史错配（原 workspace_plan:create）：权限目录与授权维护" },
  { pathPrefix: "/api/admin/permissions", methods: ["DELETE"], permission: "permission:manage", note: "修正历史错配（原 post:delete）：权限项删除" },
  { pathPrefix: "/api/admin/permissions/sync", methods: ["POST"], permission: "permission:manage", note: "修正历史错配（原 admin:create）：同步代码权限点" },
];

/**
 * 需停用的错配规则：只读端点被自动登记为写权限要求，导致合法读者被 403。
 * 停用（而非改权限点）的原因：这些接口的处理器按设计仅需登录态，
 * 不存在一个"普通读者也持有"的细粒度权限点，规则层不应再设闸。
 */
const DISABLE_RULES: { pathPrefix: string; methods: string[]; note: string }[] = [
  {
    pathPrefix: "/api/admin/posts/standard",
    methods: ["GET"],
    note: "停用原因：该接口按设计仅需登录态（标准岗位目录为全平台公共参考数据，企业空间 OWNER/ADMIN 需读取以「添加岗位(系统库)」引入岗位）；原规则要求 post:create（平台管理写权限）导致普通空间所有者打开添加岗位弹窗即 403 FORBIDDEN、列表为空。写操作（POST/PATCH/DELETE）规则保持不变，由处理器内的平台管理员校验把关。",
  },
];

/** 历史脏数据归一：非法风险等级与缺失的官方描述（合法 level 仅 read/normal/sensitive/high） */
const LEVEL_FIX: Record<string, string> = {
  "billing:manage": "high",
  "billing:read": "read",
  "model:manage": "high",
  "model:read": "read",
};
const GROUP_DESC_FIX: Record<string, string> = {
  "账务管理模块 (Billing)": "账务管理相关权限（押金结算、退款审批、账务对账）",
  "模型管理模块 (Models)": "模型注册/部署/能力/价格管理相关权限",
};

(async () => {
  const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
  const catalog: CatalogGroup[] = row?.value ? JSON.parse(row.value) : [];
  if (catalog.length === 0) {
    console.log("权限目录为空，无事可做");
    await prisma.$disconnect();
    process.exit(0);
  }

  // ---- C. 剔除误登记键 ----
  const removed: string[] = [];
  for (const g of catalog) {
    const before = g.keys.length;
    g.keys = g.keys.filter((k) => {
      if (BOGUS_KEYS.has(k.key)) {
        removed.push(`${k.key}（原属组：${g.group}）`);
        return false;
      }
      return true;
    });
    if (g.keys.length !== before) {
      console.log(`组「${g.group}」剔除 ${before - g.keys.length} 项`);
    }
  }
  // 删除被清空的非官方目标组（幽灵分组）
  const officialGroupNames = new Set(OFFICIAL_TARGETS.map((t) => t.group));
  const droppedGroups = catalog.filter((g) => g.keys.length === 0 && !officialGroupNames.has(g.group));
  for (const g of droppedGroups) console.log(`删除空组：${g.group}`);
  for (const g of droppedGroups) {
    const i = catalog.indexOf(g);
    if (i >= 0) catalog.splice(i, 1);
  }

  // ---- A+B. 迁入官方分组 / 正式登记 ----
  // 注意：只按官方组名精确匹配目标组，绝不按 moduleRoute 匹配——
  // 「账务管理模块 (Billing)」与「财务结算管理模块 (Finance)」同路由 /admin/finance，
  // 按路由匹配会把押金结算（billing:*）与财务结算（finance:*）两个模块错误合并。
  for (const t of OFFICIAL_TARGETS) {
    let target = catalog.find((g) => g.group === t.group);
    if (!target) {
      target = { group: t.group, moduleRoute: t.moduleRoute, description: t.groupDescription, keys: [] };
      catalog.push(target);
      console.log(`新建组：${t.group} (${t.moduleRoute})`);
    }
    if (target.group !== t.group) {
      console.log(`组名归一：${target.group} -> ${t.group}`);
      target.group = t.group;
    }
    target.description = t.groupDescription;
    if (!target.moduleRoute) target.moduleRoute = t.moduleRoute;
    for (const entry of t.entries) {
      // 从其它组移除同名键（一个键只允许归属唯一分组）
      for (const g of catalog) {
        if (g === target) continue;
        const idx = g.keys.findIndex((k) => k.key === entry.key);
        if (idx >= 0) {
          g.keys.splice(idx, 1);
          console.log(`从组「${g.group}」移出 ${entry.key}`);
        }
      }
      const existIdx = target.keys.findIndex((k) => k.key === entry.key);
      if (existIdx >= 0) target.keys[existIdx] = entry;
      else target.keys.push(entry);
      console.log(`正式登记：${entry.key} → ${t.group}（${entry.label} / ${entry.level}）`);
    }
  }

  // 组内去重（防历史脏数据重复项）
  for (const g of catalog) {
    const seen = new Set<string>();
    g.keys = g.keys.filter((k) => (seen.has(k.key) ? false : (seen.add(k.key), true)));
  }

  // 迁移后再补一轮空组清理（如「finance 模块 (FINANCE)」「未归类权限 (Uncategorized)」迁空后删除）
  const droppedAfterMove = catalog.filter((g) => g.keys.length === 0 && !officialGroupNames.has(g.group));
  for (const g of droppedAfterMove) console.log(`删除迁空组：${g.group}`);
  for (const g of droppedAfterMove) {
    const i = catalog.indexOf(g);
    if (i >= 0) catalog.splice(i, 1);
  }

  // 历史脏数据归一：非法 level 修正 + 自动创建组的描述补全
  for (const g of catalog) {
    if (GROUP_DESC_FIX[g.group] && g.description.includes("自动发现创建")) {
      g.description = GROUP_DESC_FIX[g.group];
      console.log(`组描述归一：${g.group}`);
    }
    for (const k of g.keys) {
      const fixed = LEVEL_FIX[k.key];
      if (fixed && k.level !== fixed) {
        console.log(`level 归一：${k.key} ${k.level} -> ${fixed}`);
        k.level = fixed;
      }
      // 真实键的正式业务描述修正
      const meta = METADATA_FIX[k.key];
      if (meta) {
        const before = `${k.label}/${k.desc}/${k.level}`;
        k.label = meta.label;
        k.desc = meta.desc;
        if (meta.level) k.level = meta.level;
        console.log(`描述修正：${k.key}  ${before} -> ${k.label}/${k.level}`);
      }
    }
  }

  // ---- E. 接口权限规则层错配修正 ----
  const rulesRow = await prisma.systemconfig.findUnique({ where: { key: RULES_KEY } });
  const rules: { id: string; pathPrefix: string; methods: string[]; permission: string; enabled: boolean; note?: string; updatedAt?: string }[] =
    rulesRow?.value ? JSON.parse(rulesRow.value) : [];
  const normMethods = (arr: string[]) => [...(arr || [])].map((x) => String(x).toUpperCase()).sort().join(",");
  let rulesFixed = 0;
  for (const fix of RULES_FIX) {
    const target = rules.find(
      (r) => r.pathPrefix === fix.pathPrefix && normMethods(r.methods) === normMethods(fix.methods)
    );
    if (target && target.permission !== fix.permission) {
      console.log(`规则修正：${fix.pathPrefix} [${fix.methods.join("/")}] ${target.permission} -> ${fix.permission}`);
      target.permission = fix.permission;
      target.note = `${target.note ? `${target.note}；` : ""}${fix.note}`;
      target.updatedAt = new Date().toISOString();
      rulesFixed++;
    }
  }
  // 停用错配的只读端点规则（合法读者被写权限 403）
  let rulesDisabled = 0;
  for (const dis of DISABLE_RULES) {
    const target = rules.find(
      (r) => r.pathPrefix === dis.pathPrefix && normMethods(r.methods) === normMethods(dis.methods)
    );
    if (target && target.enabled) {
      console.log(`规则停用：${dis.pathPrefix} [${dis.methods.join("/")}]（原要求 ${target.permission}）`);
      target.enabled = false;
      target.note = `${target.note ? `${target.note}；` : ""}${dis.note}`;
      target.updatedAt = new Date().toISOString();
      rulesDisabled++;
    }
  }

  // ---- D. 清理管理员授权清单中的误登记键 ----
  const permsRow = await prisma.systemconfig.findUnique({ where: { key: ADMIN_PERMS_KEY } });
  const grantsCleaned: string[] = [];
  let mapping: Record<string, string[]> = {};
  if (permsRow?.value) {
    try {
      mapping = JSON.parse(permsRow.value);
    } catch {
      mapping = {};
    }
  }
  for (const [userId, keys] of Object.entries(mapping)) {
    if (!Array.isArray(keys)) continue;
    const filtered = keys.filter((k) => !BOGUS_KEYS.has(k));
    if (filtered.length !== keys.length) {
      grantsCleaned.push(`${userId}（剔除 ${keys.length - filtered.length} 项）`);
      mapping[userId] = filtered;
    }
  }

  console.log("\n========== 修复摘要 ==========");
  console.log(`剔除误登记键 ${removed.length} 个：`);
  removed.forEach((r) => console.log(`  - ${r}`));
  console.log(`删除空组 ${droppedGroups.length} 个`);
  console.log(`清理管理员授权 ${grantsCleaned.length} 人`);
  grantsCleaned.forEach((r) => console.log(`  - ${r}`));
  console.log(`修正接口规则错配 ${rulesFixed} 条`);
  console.log(`停用错配规则 ${rulesDisabled} 条`);

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] 未写入任何变更。去掉 --dry-run 执行真实修复。");
  } else {
    await prisma.systemconfig.upsert({
      where: { key: CATALOG_KEY },
      create: { key: CATALOG_KEY, value: JSON.stringify(catalog) },
      update: { value: JSON.stringify(catalog) },
    });
    await prisma.systemconfig.upsert({
      where: { key: ADMIN_PERMS_KEY },
      create: { key: ADMIN_PERMS_KEY, value: JSON.stringify(mapping) },
      update: { value: JSON.stringify(mapping) },
    });
    if ((rulesFixed > 0 || rulesDisabled > 0) && rulesRow) {
      await prisma.systemconfig.upsert({
        where: { key: RULES_KEY },
        create: { key: RULES_KEY, value: JSON.stringify(rules) },
        update: { value: JSON.stringify(rules) },
      });
    }
    console.log("\n[OK] 权限目录、管理员授权清单与接口规则已写入。运行中的服务约 5 分钟内（权限缓存 TTL）自动生效，重启立即生效。");
  }

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
