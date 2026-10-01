/**
 * 为「仅管理员级保护、缺少细粒度权限点」的后台接口下发权限规则 + 授权迁移。
 * 用法：
 *   npx tsx --tsconfig tsconfig.json scripts/wire-admin-permission-rules.ts --dry-run   # 预演
 *   npx tsx --tsconfig tsconfig.json scripts/wire-admin-permission-rules.ts             # 执行
 *
 * 安全设计（务必按此顺序，避免把管理员锁在门外）：
 *   1. 先校验所有权限键都存在于权限目录（不存在则跳过并报告，绝不写脏键）；
 *   2. **先授权**：把这些键补授给现有平台管理员（只增不减，保持其现有访问能力）；
 *   3. **再启用规则**：合并写入 PLATFORM_API_PERMISSION_RULES_V1（已存在的手工规则保留）；
 *   4. 幂等：重复执行不会重复授予、不会覆盖已启用规则。
 */
import { PrismaClient } from "@prisma/client";
import { getAdminPermissions, saveAdminPermissions } from "@/lib/security";
import { API_PERMISSION_RULES_KEY, type ApiPermissionRule } from "@/lib/api-permission-rules";

const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
const DRY_RUN = process.argv.includes("--dry-run");

interface DesiredRule {
  pathPrefix: string;
  methods: string[];
  permission: string;
  note: string;
}

/** 目标规则：所有前缀都精确到「不与已有代码守卫的路径重叠」的层级 */
const DESIRED: DesiredRule[] = [
  // 会员套餐管理
  { pathPrefix: "/api/admin/membership", methods: ["GET"], permission: "membership:read", note: "会员套餐：查看" },
  { pathPrefix: "/api/admin/membership", methods: ["POST"], permission: "membership:create", note: "会员套餐：新增" },
  { pathPrefix: "/api/admin/membership", methods: ["PUT", "PATCH", "DELETE"], permission: "membership:update", note: "会员套餐：修改/删除" },

  // 算力加油包
  { pathPrefix: "/api/admin/token-packs", methods: ["GET"], permission: "token_pack:read", note: "算力包：查看" },
  { pathPrefix: "/api/admin/token-packs", methods: ["POST", "PUT", "PATCH", "DELETE"], permission: "token_pack:manage", note: "算力包：维护" },

  // API 密钥
  { pathPrefix: "/api/admin/api-keys", methods: ["GET"], permission: "apikey:read", note: "API 密钥：查看" },
  { pathPrefix: "/api/admin/api-keys", methods: ["POST", "PUT", "PATCH", "DELETE"], permission: "apikey:manage", note: "API 密钥：维护" },

  // 多租户机构
  { pathPrefix: "/api/admin/tenants", methods: ["GET"], permission: "tenant:read", note: "机构：查看" },
  { pathPrefix: "/api/admin/tenants", methods: ["POST", "PUT", "PATCH", "DELETE"], permission: "tenant:manage", note: "机构：维护" },

  // 升级申请审核
  { pathPrefix: "/api/admin/upgrade-applications", methods: ["GET"], permission: "upgrade:read", note: "升级申请：查看" },
  { pathPrefix: "/api/admin/upgrade-applications", methods: ["POST", "PUT", "PATCH"], permission: "upgrade:audit", note: "升级申请：审核" },

  // 充值订单
  { pathPrefix: "/api/admin/recharge-orders", methods: ["GET"], permission: "order:detail", note: "充值订单：查看" },
  { pathPrefix: "/api/admin/recharge-orders", methods: ["POST", "PUT", "PATCH"], permission: "order:manage", note: "充值订单：处理" },

  // 文档管理
  { pathPrefix: "/api/admin/documents", methods: ["GET"], permission: "document:read", note: "文档：查看" },
  { pathPrefix: "/api/admin/documents", methods: ["POST"], permission: "document:create", note: "文档：新增" },
  { pathPrefix: "/api/admin/documents", methods: ["PUT", "PATCH"], permission: "document:update", note: "文档：修改" },
  { pathPrefix: "/api/admin/documents", methods: ["DELETE"], permission: "document:delete", note: "文档：删除" },

  // 组件阶段大纲
  { pathPrefix: "/api/admin/stages", methods: ["GET"], permission: "content:stage_read", note: "组件阶段：查看" },
  { pathPrefix: "/api/admin/stages", methods: ["POST", "PUT", "PATCH", "DELETE"], permission: "content:stage_manage", note: "组件阶段：维护" },

  // 系统状态 / 大盘
  { pathPrefix: "/api/admin/system-status", methods: ["GET"], permission: "system:metrics", note: "系统状态：指标查看" },
  { pathPrefix: "/api/admin/dashboard", methods: ["GET"], permission: "analytics:read", note: "运营大盘：查看" },
  { pathPrefix: "/api/admin/analytics", methods: ["GET"], permission: "analytics:read", note: "运营分析：查看" },

  // 登录历史
  { pathPrefix: "/api/admin/login-histories", methods: ["GET"], permission: "audit:login_read", note: "登录历史：查看" },

  // 用户偏好 / 导航模块
  { pathPrefix: "/api/admin/preferences", methods: ["GET", "PUT", "PATCH"], permission: "system:config_read", note: "偏好配置：读写" },
  { pathPrefix: "/api/admin/nav-modules", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], permission: "system:config_read", note: "导航模块：读写" },

  // 用户批量与调试类
  { pathPrefix: "/api/admin/users/batch", methods: ["POST"], permission: "user:update", note: "用户批量操作" },
  { pathPrefix: "/api/admin/users/batch-logout", methods: ["POST"], permission: "user:reset_session", note: "批量强制下线" },
  { pathPrefix: "/api/admin/users/zombie-scan", methods: ["GET", "POST"], permission: "user:read", note: "僵尸账号扫描" },
  { pathPrefix: "/api/admin/users/search-ids", methods: ["GET"], permission: "user:read", note: "检索用户 ID" },
  { pathPrefix: "/api/admin/users/import-identifiers", methods: ["POST"], permission: "user:update", note: "导入标识" },
  { pathPrefix: "/api/admin/users/debug", methods: ["GET"], permission: "user:read", note: "用户调试信息" },
  { pathPrefix: "/api/admin/user/clear-session", methods: ["POST"], permission: "user:reset_session", note: "清理会话" },
  { pathPrefix: "/api/admin/user/logout", methods: ["POST"], permission: "user:reset_session", note: "后台登出" },

  // 工作空间运维类
  { pathPrefix: "/api/admin/workspaces/archive-inactive", methods: ["POST"], permission: "workspace:manage", note: "归档不活跃空间" },
  { pathPrefix: "/api/admin/workspaces/disable-check", methods: ["GET", "POST"], permission: "workspace:status_update", note: "停用校验" },
  { pathPrefix: "/api/admin/workspaces/pool-threshold", methods: ["GET", "POST", "PUT", "PATCH"], permission: "workspace:quota_manage", note: "共享池阈值" },
  { pathPrefix: "/api/admin/workspaces/recycle", methods: ["POST"], permission: "workspace:manage", note: "空间回收" },

  // 算力点管理（目录中未单独设 points:* 权限点，复用 user:read / user:update）
  { pathPrefix: "/api/admin/points/summary", methods: ["GET"], permission: "user:read", note: "算力总账：查看" },
  { pathPrefix: "/api/admin/points/ledger", methods: ["GET"], permission: "user:read", note: "算力流水：查看" },
  { pathPrefix: "/api/admin/points/expire", methods: ["POST"], permission: "user:update", note: "算力清算：触发" },
];

/**
 * 仅授权、不生成规则：这些权限点由「代码级守卫」直接使用
 * （posts 系列接口因存在 `[postId]` 动态段与 `posts/standard` 仅需登录态的特殊设计，
 *   无法用路径前缀规则安全表达，故改在代码里逐个校验）。
 * 必须同步补授给现有平台管理员，否则会立刻 403 失权。
 */
const GRANT_ONLY_KEYS = [
  // posts 系列（代码级守卫）
  "post:read",
  "post:update",
  "post:delete",
  // 按动作细分的代码级守卫端子（保持存量管理员访问能力不变）
  "announcement:update",
  "component:status_update",
  "token_pack:publish",
  "token_pack:status_update",
  "order:audit",
  "order:refund_apply",
  "order:refund_approve",
  "content:stage_read",
  "content:stage_publish",
  // AI 计价配置（settings/pricing 路由的细粒度键）
  "ai_pricing:read",
  "ai_pricing:update",
];

async function main() {
  const prisma = new PrismaClient();
  try {
    // ---------- 0. 读取权限目录，校验键合法性 ----------
    const catalogRow = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
    const catalogKeys = new Set<string>();
    if (catalogRow?.value) {
      try {
        const groups = JSON.parse(catalogRow.value);
        if (Array.isArray(groups)) {
          groups.forEach((g: any) => (g?.keys ?? []).forEach((k: any) => k?.key && catalogKeys.add(String(k.key))));
        }
      } catch {
        /* ignore */
      }
    }
    console.log(`权限目录：${catalogKeys.size} 个权限点`);

    const valid: DesiredRule[] = [];
    const skipped: DesiredRule[] = [];
    for (const rule of DESIRED) {
      (catalogKeys.has(rule.permission) ? valid : skipped).push(rule);
    }
    if (skipped.length) {
      console.log(`\n⚠️ 以下 ${skipped.length} 条规则因权限点不在目录中而跳过（请先在权限配置页注册该模块）：`);
      skipped.forEach((r) => console.log(`   - ${r.permission}  (${r.pathPrefix})`));
    }

    const grantOnly = GRANT_ONLY_KEYS.filter((k) => catalogKeys.has(k));
    const skippedGrantOnly = GRANT_ONLY_KEYS.filter((k) => !catalogKeys.has(k));
    if (skippedGrantOnly.length) {
      console.log(`⚠️ 以下待授权权限点不在目录中，已跳过：${skippedGrantOnly.join(", ")}`);
    }

    const keysToGrant = Array.from(
      new Set([...valid.map((r) => r.permission), ...grantOnly])
    ).sort();
    console.log(`\n待下发规则：${valid.length} 条，涉及权限点 ${keysToGrant.length} 个`);
    console.log(`其中仅授权（代码级守卫使用）的权限点：${grantOnly.join(", ") || "无"}`);

    // ---------- 1. 先授权：把新键补授给现有平台管理员（只增不减） ----------
    const admins = await prisma.user.findMany({
      where: { role: { contains: "ADMIN" } },
      select: { id: true, name: true, email: true, role: true },
    });
    const targetAdmins = admins.filter(
      (a) => !["SUPER_ADMIN", "SUPERADMIN", "SUPER"].includes(String(a.role).toUpperCase().trim())
    );
    console.log(`\n平台管理员：${targetAdmins.length} 位（已排除超管，超管本身无条件放行）`);

    let grantedCount = 0;
    for (const admin of targetAdmins) {
      const current = await getAdminPermissions(admin.id);
      const missing = keysToGrant.filter((k) => !current.includes(k));
      if (missing.length === 0) {
        console.log(`   - ${admin.name || admin.email}：已具备全部权限，跳过`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`   - ${admin.name || admin.email}：将新增 ${missing.length} 个权限（预演）`);
        grantedCount += missing.length;
        continue;
      }
      const merged = Array.from(new Set([...current, ...keysToGrant]));
      const ok = await saveAdminPermissions(admin.id, merged);
      console.log(
        `   - ${admin.name || admin.email}：新增 ${missing.length} 个权限 ${ok ? "✅" : "❌ 写入失败"}`
      );
      if (ok) grantedCount += missing.length;
    }
    console.log(`授权迁移完成：共新增 ${grantedCount} 条权限项`);

    // ---------- 2. 再启用规则：合并写入（保留已有手工规则） ----------
    const existingRow = await prisma.systemconfig.findUnique({ where: { key: API_PERMISSION_RULES_KEY } });
    let existing: ApiPermissionRule[] = [];
    if (existingRow?.value) {
      try {
        const parsed = JSON.parse(existingRow.value);
        if (Array.isArray(parsed)) existing = parsed as ApiPermissionRule[];
      } catch {
        /* ignore */
      }
    }

    const now = new Date().toISOString();
    const merged = [...existing];
    let added = 0;
    let updated = 0;
    for (const rule of valid) {
      const id = `wired:${rule.permission}:${rule.pathPrefix}:${rule.methods.join(",")}`;
      const next: ApiPermissionRule = {
        id,
        pathPrefix: rule.pathPrefix,
        methods: rule.methods,
        permission: rule.permission,
        enabled: true,
        note: rule.note,
        source: "manual",
        updatedAt: now,
      };
      const idx = merged.findIndex((r) => r.id === id);
      if (idx === -1) {
        merged.push(next);
        added += 1;
      } else if (
        !merged[idx].enabled ||
        merged[idx].permission !== next.permission ||
        merged[idx].pathPrefix !== next.pathPrefix
      ) {
        merged[idx] = next;
        updated += 1;
      }
    }

    if (!DRY_RUN) {
      await prisma.systemconfig.upsert({
        where: { key: API_PERMISSION_RULES_KEY },
        create: { key: API_PERMISSION_RULES_KEY, value: JSON.stringify(merged) },
        update: { value: JSON.stringify(merged) },
      });
    }
    console.log(
      `\n规则下发完成：新增 ${added} 条，更新 ${updated} 条，规则总数 ${merged.length} 条${DRY_RUN ? "（预演，未写入）" : ""}`
    );
    console.log("提示：拦截层有 60s 缓存，改动最多 60 秒后生效；建议重启 dev 服务以便立即验证。");
  } catch (error) {
    console.error("下发失败：", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
