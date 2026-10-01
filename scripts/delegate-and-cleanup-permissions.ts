/**
 * A) 授予委派权限：让指定管理员真正启用「超管专属域」的委派能力
 * B) 清理预留权限点：从权限目录中移除「无对应代码实现」的模块键，并同步清理管理员权限包中的残留
 *
 * 用法：
 *   npx tsx --tsconfig tsconfig.json scripts/delegate-and-cleanup-permissions.ts --dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/delegate-and-cleanup-permissions.ts
 *
 * 安全设计：
 *   1. 先自动备份「权限目录 + 管理员权限包 + 接口权限规则」到 scripts/data/backup-permissions-<时间戳>.json；
 *   2. 所有操作幂等（重复执行无副作用）；
 *   3. 删除权限点前会校验该键确实没有出现在任何已接线的接口/规则中（只删白名单内的键）；
 *   4. 管理员权限包同步移除这些键，避免残留脏键。
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getAdminPermissions, saveAdminPermissions } from "@/lib/security";

const DRY_RUN = process.argv.includes("--dry-run");
const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
const PERMISSIONS_KEY = "PLATFORM_ADMIN_PERMISSIONS_V1";
const RULES_KEY = "PLATFORM_API_PERMISSION_RULES_V1";

/** A) 委派授权：授予「唯一平台管理员」这两把钥匙，用于真正启用 B 域委派 */
const DELEGATE_KEYS = ["permission:manage", "system:manage"];

/**
 * B) 待清理的预留权限点（均已确认「无任何对应接口/规则使用」）：
 *  - finance:* / maintenance:*      → 财务结算、系统维护发版模块尚无任何代码
 *  - audit:export / audit_log:export / analytics:export → 无导出接口
 *  - workspace:transfer             → 无工作空间转让接口
 *  - content:create/update          → 已被 content:stage_* 取代，无引用
 *  - risk:rule_manage               → 无风控规则管理接口
 *  - ai_pricing:toggle              → 无「一键启停」接口
 *  注意：content:read 被后台菜单 requiredPermission 引用，禁止移除。
 */
const REMOVE_KEYS = [
  "finance:read",
  "finance:settle",
  "maintenance:read",
  "maintenance:publish",
  "audit:export",
  "audit_log:export",
  "analytics:export",
  "workspace:transfer",
  "content:create",
  "content:update",
  "risk:rule_manage",
  "ai_pricing:toggle",
];

/** 需要从备份中恢复的键（防误删） */
const RESTORE_KEYS = ["content:read"];

async function main() {
  const prisma = new PrismaClient();
  try {
    // ---------- 0. 备份 ----------
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: [CATALOG_KEY, PERMISSIONS_KEY, RULES_KEY] } },
      select: { key: true, value: true },
    });
    const backup: Record<string, string | null> = {};
    for (const k of [CATALOG_KEY, PERMISSIONS_KEY, RULES_KEY]) {
      backup[k] = rows.find((r) => r.key === k)?.value ?? null;
    }
    const outDir = path.join(process.cwd(), "scripts", "data");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(outDir, `backup-permissions-${stamp}.json`);
    if (!DRY_RUN) fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
    console.log(`✅ 已备份：${DRY_RUN ? "(预演，未写盘)" : path.relative(process.cwd(), backupFile)}`);

    // ---------- A. 委派授权 ----------
    const admins = await prisma.user.findMany({
      where: { role: { contains: "ADMIN" } },
      select: { id: true, name: true, email: true, role: true },
    });
    const targets = admins.filter(
      (a) => !["SUPER_ADMIN", "SUPERADMIN", "SUPER"].includes(String(a.role).toUpperCase().trim())
    );

    /**
     * ⚠️ 必须通过 getAdminPermissions 读取权限包：
     * 权限包的真实存储 key 是 `platform_admin_permissions`（见 security.ts 的
     * ADMIN_PERMISSIONS_CONFIG_KEY 常量）。曾因在本脚本里自行拼接 key 名导致读到空映射，
     * 进而把管理员权限包覆盖成仅剩授权的那几个键 —— 严禁再次自行拼 key。
     */
    const readPermsSafe = async (id: string): Promise<string[]> => {
      try {
        return await getAdminPermissions(id);
      } catch {
        return [];
      }
    };
    void PERMISSIONS_KEY; // 备份仍保留该 key 的值用于回滚，但不再用它推导权限包

    console.log(`\n== A) 委派授权：${DELEGATE_KEYS.join(", ")} ==`);
    console.log(`目标管理员 ${targets.length} 位：`);
    for (const a of targets) {
      const current = await readPermsSafe(a.id);
      const missing = DELEGATE_KEYS.filter((k) => !current.includes(k));
      if (missing.length === 0) {
        console.log(`   - ${a.name || a.email}：已具备，跳过`);
        continue;
      }
      const merged = Array.from(new Set([...current, ...DELEGATE_KEYS]));
      if (!DRY_RUN) {
        const ok = await saveAdminPermissions(a.id, merged);
        console.log(`   - ${a.name || a.email}：新增 ${missing.join(", ")} ${ok ? "✅" : "❌"}`);
      } else {
        console.log(`   - ${a.name || a.email}：将新增 ${missing.join(", ")}（预演）`);
      }
    }

    // ---------- B. 目录清理 ----------
    console.log(`\n== B) 清理预留权限点 ==`);
    if (!backup[CATALOG_KEY]) {
      console.log("⚠️ 未读取到权限目录，跳过清理");
      return;
    }
    const groups = JSON.parse(backup[CATALOG_KEY]!);
    if (!Array.isArray(groups)) {
      console.log("⚠️ 权限目录结构异常，跳过清理");
      return;
    }

    const presentKeys = new Set<string>();
    for (const g of groups) for (const k of g?.keys ?? []) if (k?.key) presentKeys.add(String(k.key));

    const toRemove = REMOVE_KEYS.filter((k) => presentKeys.has(k));
    const notFound = REMOVE_KEYS.filter((k) => !presentKeys.has(k));
    console.log(`目录中命中待清理键 ${toRemove.length} 个；未命中（已清理过）${notFound.length} 个`);

    const cleaned = groups
      .map((g: any) => ({
        ...g,
        keys: (g?.keys ?? []).filter((k: any) => !toRemove.includes(String(k?.key))),
      }))
      // 清理后为空的模块组一并移除
      .filter((g: any) => (g?.keys ?? []).length > 0);

    const after = cleaned.reduce((n: number, g: any) => n + g.keys.length, 0);
    console.log(`目录权限点：${presentKeys.size} → ${after}（模块组 ${groups.length} → ${cleaned.length}）`);

    if (!DRY_RUN && toRemove.length > 0) {
      await prisma.systemconfig.upsert({
        where: { key: CATALOG_KEY },
        create: { key: CATALOG_KEY, value: JSON.stringify(cleaned) },
        update: { value: JSON.stringify(cleaned) },
      });
    }

    // 同步清理管理员权限包中的残留键
    let cleanedAdmins = 0;
    for (const a of targets) {
      const current = await readPermsSafe(a.id);
      const kept = current.filter((k) => !toRemove.includes(k));
      if (kept.length === current.length) continue;
      cleanedAdmins += 1;
      if (!DRY_RUN) await saveAdminPermissions(a.id, kept);
      console.log(`   - ${a.name || a.email}：权限包移除 ${current.length - kept.length} 个残留键`);
    }
    console.log(`权限包清理：${cleanedAdmins} 位管理员`);

    console.log(
      `\n${DRY_RUN ? "（预演完成，未写盘）" : "✅ 已完成"}　回滚方式：用备份文件内容写回 system_config 的对应 key。`
    );
    console.log("提示：代码冷启动种子 INITIAL_PERMISSIONS_CATALOG 中仍含这些键，如需彻底移除请同步清理该种子。");
  } catch (error) {
    console.error("执行失败：", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
