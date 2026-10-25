/**
 * 【PRICING/模型批次权限补录 + 可扩展性机制】
 *
 * 1. 补录 4 个缺失权限点（billing:manage/read、model:manage/read）为两个新组；
 * 2. 建立「权限点自动发现同步」：扫描代码中 requirePlatformPermission 的键，
 *    与目录对比，自动补录缺失键到对应模块组（按前缀映射 / 已知键登记）；
 * 3. 写 npm script（permissions:sync）。
 *
 * 只读扫描 + 目录补录（只增不删，避免误回收存量授权）。
 *
 * 本文件同时被两处消费：
 *  - CLI：`npm run permissions:sync`（require.main === module 时执行 main）；
 *  - 后台接口：`POST /api/admin/permissions/sync` 通过导入 runPermissionKeySync
 *    复用同一套扫描 + 补录逻辑（不在模块加载时自动执行，避免误触发）。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";

const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";

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

/** 同步结果（供接口返回与 CLI 复用） */
export interface PermissionKeySyncResult {
  added: number;
  keys: string[];
}

/** 已知键的业务语义（本批 4 个新键的正式登记信息） */
const KNOWN_KEYS: Record<string, Omit<CatalogKey, "key">> = {
  "billing:manage": {
    label: "账务管理操作",
    desc: "押金结算、退款审批、账务对账等资金类管理操作",
    moduleName: "账务管理",
    level: "high",
  },
  "billing:read": {
    label: "查看账务数据",
    desc: "查看押金结算、退款记录与账务对账报表",
    moduleName: "账务管理",
    level: "read",
  },
  "model:manage": {
    label: "模型部署管理操作",
    desc: "新增/修改/启停模型部署与供应商配置、设置平台默认模型",
    moduleName: "模型管理",
    level: "high",
  },
  "model:read": {
    label: "查看模型注册表",
    desc: "查看模型供应商、部署、能力与价格配置",
    moduleName: "模型管理",
    level: "read",
  },
  "demo:read": {
    label: "查看演示申请列表",
    desc: "查阅访客提交的产品演示预约申请（姓名、联系方式、公司与需求说明）",
    moduleName: "演示申请管理",
    level: "read",
  },
  "demo:manage": {
    label: "处理演示申请跟进",
    desc: "更新演示申请的处理状态流转（待处理 / 已联系 / 已关闭）",
    moduleName: "演示申请管理",
    level: "normal",
  },
  "user:export": {
    label: "导出用户清单",
    desc: "将当前筛选的全量用户数据（含手机号邮箱等联系方式）导出为 Excel",
    moduleName: "用户管理模块 (User)",
    level: "high",
  },
  "billing:export": {
    label: "导出账务数据",
    desc: "导出算力点流水 / 充值订单 / 退款工单 / 结算记录四类资金数据",
    moduleName: "账务管理模块 (Billing)",
    level: "high",
  },
};

/** 已知键归属模块的路由（用于新建模块组时填充 moduleRoute） */
const KNOWN_MODULE_ROUTES: Record<string, string> = {
  账务管理: "/admin/finance",
  模型管理: "/admin/models",
  演示申请管理: "/admin/demo-requests",
};

/** 1. 扫描代码中的权限点（requirePlatformPermission 调用），跨平台纯 Node 实现 */
function scanCodeKeys(): string[] {
  const found = new Set<string>();
  // 扫描根：API 路由 + 核心库。覆盖 src/app/api 与 src/lib 中所有 requirePlatformPermission 调用点
  // （security.ts 等核心库内也存在字面量权限键，此前仅扫 src/app/api 会漏掉）。
  const ROOTS = [
    path.join(process.cwd(), "src", "app", "api"),
    path.join(process.cwd(), "src", "lib"),
  ];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith(".ts")) {
        const content = fs.readFileSync(p, "utf8");
        // 先捞出每个 requirePlatformPermission(...) 调用的完整参数串（参数均为字符串字面量，不含嵌套括号），
        // 再从参数串中提取全部 "x:y" 权限键——避免只捕获第一个参数而漏掉第二/三个键
        // （如 requirePlatformPermission(req, "system:manage", "model:read", "model:manage") 中的后两个）。
        const callRe = /requirePlatformPermission\(([^)]*)\)/g;
        let call: RegExpExecArray | null;
        while ((call = callRe.exec(content))) {
          const keyRe = /["']([a-z_]+:[a-z_]+)["']/g;
          let k: RegExpExecArray | null;
          while ((k = keyRe.exec(call[1]))) found.add(k[1]);
        }
      }
    }
  };
  for (const root of ROOTS) walk(root);
  return [...found].sort();
}

/** 2. 从代码键推断归属组（按前缀映射；未知前缀 → 未归类组） */
const PREFIX_GROUP: Record<string, { group: string; route: string; desc: string }> = {
  user: { group: "用户管理模块 (User)", route: "/admin/users", desc: "用户管理相关权限" },
  workspace: { group: "工作空间管理模块 (Workspace)", route: "/admin/workspaces", desc: "工作空间管理相关权限" },
  workspace_plan: { group: "空间套餐管理模块 (Workspace Plans)", route: "/admin/workspace/plans", desc: "空间套餐管理相关权限" },
  post: { group: "岗位管理模块 (Posts)", route: "/admin/posts", desc: "岗位管理相关权限" },
  component: { group: "组件管理模块 (Components)", route: "/admin/components", desc: "组件管理相关权限" },
  membership: { group: "会员套餐管理模块 (Membership)", route: "/admin/membership", desc: "会员套餐管理相关权限" },
  token_pack: { group: "算力加油包管理模块 (Token Packs)", route: "/admin/membership/token-packs", desc: "加油包管理相关权限" },
  order: { group: "订单管理模块 (Orders)", route: "/admin/orders", desc: "订单管理相关权限" },
  content: { group: "内容管理模块 (Content)", route: "/admin/content", desc: "内容管理相关权限" },
  document: { group: "文档管理模块 (Documents)", route: "/admin/documents", desc: "文档管理相关权限" },
  announcement: { group: "通知公告模块 (Notifications)", route: "/admin/notifications", desc: "通知公告管理相关权限" },
  audit: { group: "审计日志模块 (Audit Logs)", route: "/admin/operation-logs", desc: "审计日志相关权限" },
  audit_log: { group: "审计日志模块 (Audit Logs)", route: "/admin/operation-logs", desc: "审计日志相关权限" },
  system: { group: "系统设置模块 (Settings)", route: "/admin/settings", desc: "系统设置相关权限" },
  admin: { group: "管理员管理模块 (Administrators)", route: "/admin/administrators", desc: "管理员管理相关权限" },
  permission: { group: "权限配置模块 (Permissions)", route: "/admin/permissions", desc: "权限配置相关权限" },
  ai_pricing: { group: "AI 算力与模型定价模块 (AI Pricing)", route: "/admin/ai-pricing", desc: "AI 定价相关权限" },
  analytics: { group: "运营数据分析大盘 (Analytics)", route: "/admin/analytics", desc: "运营分析相关权限" },
  apikey: { group: "API 密钥管理模块 (API Keys)", route: "/admin/api-keys", desc: "API 密钥管理相关权限" },
  tenant: { group: "多租户机构管理模块 (Tenants)", route: "/admin/tenants", desc: "多租户管理相关权限" },
  upgrade: { group: "升级申请审核模块 (Upgrade Applications)", route: "/admin/upgrade-applications", desc: "升级审核相关权限" },
  user_reviews: { group: "用户评价模块 (USER_REVIEWS)", route: "/admin/testimonials", desc: "用户评价相关权限" },
  billing: { group: "账务管理模块 (Billing)", route: "/admin/finance", desc: "账务管理相关权限（押金结算/退款/对账）" },
  model: { group: "模型管理", route: "/admin/models", desc: "模型注册/部署/能力/价格管理相关权限" },
  demo: { group: "演示申请管理模块 (Demo Requests)", route: "/admin/demo-requests", desc: "演示申请管理相关权限" },
};

function inferGroup(key: string): { group: string; route: string } {
  const prefix = key.split(":")[0];
  return PREFIX_GROUP[prefix] ?? { group: "未归类权限 (Uncategorized)", route: "", desc: "自动发现的新权限点，待管理员归类" };
}

/**
 * 核心同步逻辑（可导入复用）：扫描代码权限点 → 与目录对比 → 仅补录缺失项。
 * 约定：只增不删，绝不回收代码中已不再使用的存量授权键。
 */
export async function runPermissionKeySync(): Promise<PermissionKeySyncResult> {
  const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
  const catalog: CatalogGroup[] = row?.value ? JSON.parse(row.value) : [];
  const catalogKeys = new Set<string>();
  for (const g of catalog) for (const k of g.keys ?? []) catalogKeys.add(k.key);

  const codeKeys = scanCodeKeys();
  const missing = codeKeys.filter((k) => !catalogKeys.has(k));
  console.log(`代码权限点 ${codeKeys.length} | 目录已登记 ${catalogKeys.size} | 缺失 ${missing.length}`);

  let added = 0;
  const addedKeys: string[] = [];
  for (const key of missing) {
    const meta = KNOWN_KEYS[key];
    let group: string;
    let route: string;
    let entry: CatalogKey;
    if (meta) {
      // 已知键：按其正式登记的模块名归组（如「账务管理」「模型管理」）
      group = meta.moduleName;
      route = KNOWN_MODULE_ROUTES[meta.moduleName] || "";
      entry = { key, ...meta };
    } else {
      // 自动发现键：按前缀映射归组，业务说明留空待管理员补充
      const g = inferGroup(key);
      group = g.group;
      route = g.route;
      entry = {
        key,
        label: key,
        desc: "自动发现的权限点（未登记业务说明，待管理员补充）",
        moduleName: group,
        level: "read",
      };
    }
    let g = catalog.find((x) => x.group === group);
    if (!g) {
      g = {
        group,
        moduleRoute: route || null,
        description: route ? `${group}（自动发现创建）` : "自动发现的权限点集合",
        keys: [],
      };
      catalog.push(g);
      console.log(`新建组: ${group}`);
    }
    g.keys.push(entry);
    added++;
    addedKeys.push(key);
    console.log(`补录: ${key} → ${group}`);
  }

  if (added > 0) {
    await prisma.systemconfig.upsert({
      where: { key: CATALOG_KEY },
      create: { key: CATALOG_KEY, value: JSON.stringify(catalog) },
      update: { value: JSON.stringify(catalog) },
    });
    console.log(`目录已更新（新增 ${added} 个权限点）`);
  } else {
    console.log("目录已齐全，无需补录");
  }

  return { added, keys: addedKeys };
}

/** CLI 入口：执行同步并打印结果、写审计（仅 CLI 运行，被导入时不触发） */
async function main() {
  const result = await runPermissionKeySync();
  if (result.added > 0) {
    await prisma.operationlog
      .create({
        data: {
          id: "op_" + Date.now() + "_permsync",
          userId: "cmugq95w200018v57lop5qtm9",
          action: "PERMISSION_CATALOG_SYNC",
          resource: "PLATFORM_PERMISSION_CATALOG",
          details: {
            added: result.added,
            keys: result.keys,
            message: "权限点自动发现同步（代码扫描 → 目录补录）",
          },
        } as any,
      })
      .catch(() => {});
  }
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { CATALOG_KEY };
