/**
 * D2 精确归档：C07 遗留 0.1.0-sample DRAFT（含非法 FILE_ANALYSIS 能力）
 *
 * 安全约束（对应批次 CORE-3 阶段 B / R2）：
 *  - 默认 dry-run（只读预演）：仅输出目标 id / 版本 / 生命周期 / activeContractId / 操作人，绝不打印合同全文；
 *  - 目标必须同时满足：componentId=C07、contractVersion=0.1.0-sample、lifecycle=DRAFT、id 唯一、且不等于 activeContractId；
 *  - 匹配数量必须恰好为 1，否则拒绝执行；
 *  - 操作人必须来自真实 SUPER_ADMIN（user.role 属于超级管理员集合，库内存小写 superadmin）；
 *  - 数据库查询异常必须原样抛出，绝不被 catch 后伪装成“没有 SUPER_ADMIN”；
 *  - --apply 仅调用 repository.archiveContract（CAS + 审计事务），绝不 delete、绝不直接 SQL UPDATE；
 *  - --apply 后必须核对 lifecycle=ARCHIVED、activeContractId 未变、对应 operationlog 存在、重复执行幂等；
 *  - 无真实 SUPER_ADMIN 时：不自动建号、不伪造 operatorId、只保留 dry-run 证据、报告 D2_WAITING_FOR_SUPER_ADMIN。
 *
 * 用法：
 *   npx tsx scripts/archive-c07-sample-draft.ts            # 只读预演
 *   npx tsx scripts/archive-c07-sample-draft.ts --apply    # 显式归档（经 repository）
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { archiveContract } from "../src/lib/component-contract/repository";

const COMPONENT_ID = "C07";
const TARGET_VERSION = "0.1.0-sample";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/**
 * 仅“没有操作人记录”时返回 null；数据库查询异常直接抛出，绝不伪装成无 SUPER_ADMIN。
 * 与系统 normalizePlatformRole / isSuperAdminRole 保持一致，接受多种大小写（库内存的是小写 superadmin）。
 */
const SUPER_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "SUPERADMIN",
  "SUPER_ADMIN_ROLE",
  "superadmin",
  "super_admin",
  "SuperAdmin",
  "Super_admin",
  "Superadmin",
];
async function findSuperAdminId(): Promise<string | null> {
  const op = await prisma.user.findFirst({
    where: { role: { in: SUPER_ADMIN_ROLES }, status: { notIn: ["deleted", "deleting"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return op?.id ?? null;
}

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path.join(process.cwd(), f));
  }
  const apply = process.argv.includes("--apply");

  const comp = await prisma.componentcatalog.findUnique({
    where: { id: COMPONENT_ID },
    select: { activeContractId: true },
  });
  const activeContractId = comp?.activeContractId ?? null;

  const targets = await prisma.componentcontract.findMany({
    where: { componentId: COMPONENT_ID, contractVersion: TARGET_VERSION, lifecycle: "DRAFT" },
    select: { id: true, componentId: true, contractVersion: true, lifecycle: true },
  });

  if (targets.length !== 1) {
    console.error(
      `ARCHIVE_FAIL TARGET_NOT_UNIQUE: 匹配目标数量=${targets.length}（必须恰好为 1）。` +
        ` 组件=${COMPONENT_ID} 版本=${TARGET_VERSION} lifecycle=DRAFT。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  const target = targets[0];
  if (target.id === activeContractId) {
    console.error(
      `ARCHIVE_FAIL TARGET_IS_ACTIVE: 目标 ${target.id} 正是当前 activeContractId，禁止归档激活合同。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  // 区分“无操作人记录”（可预期）与“数据库查询异常”（必须原样抛出）
  let operatorId: string | null = null;
  try {
    operatorId = await findSuperAdminId();
  } catch (e) {
    console.error("ARCHIVE_FAIL DB_ERROR:", (e as Error)?.message || String(e));
    await prisma.$disconnect();
    process.exit(2);
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          action: "ARCHIVE_DRY_RUN",
          componentId: target.componentId,
          targetId: target.id,
          targetVersion: target.contractVersion,
          targetLifecycle: target.lifecycle,
          activeContractId,
          operatorId: operatorId ?? "(MISSING_SUPER_ADMIN)",
          wroteDatabase: false,
        },
        null,
        2,
      ),
    );
    if (!operatorId) {
      console.error(
        "D2_WAITING_FOR_SUPER_ADMIN: 未找到真实 SUPER_ADMIN 操作人；--apply 前必须先存在具备 system:manage 的 SUPER_ADMIN 账号。",
      );
    }
    await prisma.$disconnect();
    return;
  }

  if (!operatorId) {
    console.error(
      "D2_WAITING_FOR_SUPER_ADMIN: 未找到真实 SUPER_ADMIN 操作人，拒绝归档（不自动建号、不伪造 operatorId）。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const archived = await archiveContract({
    componentId: COMPONENT_ID,
    contractVersion: TARGET_VERSION,
    operatorId,
  });

  // 校验：归档后状态与 activeContractId 未变化
  const afterComp = await prisma.componentcatalog.findUnique({
    where: { id: COMPONENT_ID },
    select: { activeContractId: true },
  });
  const afterTarget = await prisma.componentcontract.findUnique({
    where: { id: target.id },
    select: { lifecycle: true },
  });

  // 校验：operationlog 已记录本次归档（action=component_contract:archive，且 detail.contractId=目标）
  const logs = await prisma.operationlog.findMany({
    where: { action: "component_contract:archive" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const auditMatched = logs.some((l) => (l.details as Record<string, unknown> | null)?.contractId === target.id);

  // 校验：重复执行幂等（已是 ARCHIVED，repository 直接幂等返回，不产生新审计/状态变更）
  const idempotentRun = await archiveContract({
    componentId: COMPONENT_ID,
    contractVersion: TARGET_VERSION,
    operatorId,
  });

  const ok =
    afterTarget?.lifecycle === "ARCHIVED" &&
    afterComp?.activeContractId === activeContractId &&
    auditMatched &&
    idempotentRun.lifecycle === "ARCHIVED";

  console.log(
    JSON.stringify(
      {
        action: "ARCHIVE_APPLY",
        targetId: target.id,
        targetLifecycle: afterTarget?.lifecycle ?? null,
        activeContractIdUnchanged: afterComp?.activeContractId === activeContractId,
        operatorId,
        auditLogExists: auditMatched,
        idempotentLifecycle: idempotentRun.lifecycle,
        wroteDatabase: true,
        ok,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error("ARCHIVE_FAIL", (e as Error)?.message || String(e));
  prisma.$disconnect();
  process.exit(2);
});
