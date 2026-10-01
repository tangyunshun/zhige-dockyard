/**
 * 清理测试残留（仅匹配测试夹具前缀，绝不触碰真实业务数据）
 *
 * 背景：部分长耗时测试进程被外部中断（未执行 finally），导致临时组件/用户/空间/流水残留，
 * 其中 isPublished=true 的临时组件还会出现在公开组件大厅。
 *
 * 安全约束：
 *  - 仅匹配明确的测试前缀（C_TMP_ / u_c07_ / u_c07f_ / u_inp_ / u_upe_ / u_c0105_ / u_c05m_ / u_c05u_ / ws_* / doc_c07*）；
 *  - 删除组件前先解除 componentcatalog.activeContractId 外键引用；
 *  - 幂等；不带 --apply 时为只读预演。
 *
 * 用法：npx tsx prisma/cleanup-test-leftovers.ts [--apply]
 */
import { prisma } from "@/lib/prisma";

const USER_PREFIXES = ["u_c07_", "u_c07f_", "u_inp_", "u_upe_", "u_c0105_", "u_c05m_", "u_c05u_"];
const WS_PREFIXES = ["ws_c07_", "ws_c07f_", "ws_inp_", "ws_upe_", "ws_c0105_", "ws_c05_"];
const COMP_PREFIXES = ["C_TMP_"];
const DOC_PREFIXES = ["doc_c07_", "doc_c07f_"];

const orUser = USER_PREFIXES.map((p) => ({ userId: { startsWith: p } }));
const orUserSelf = USER_PREFIXES.map((p) => ({ id: { startsWith: p } }));
const orWs = WS_PREFIXES.map((p) => ({ workspaceId: { startsWith: p } }));
const orWsSelf = WS_PREFIXES.map((p) => ({ id: { startsWith: p } }));
const orComp = COMP_PREFIXES.map((p) => ({ id: { startsWith: p } }));
const orCompId = COMP_PREFIXES.map((p) => ({ componentId: { startsWith: p } }));
const orDoc = DOC_PREFIXES.map((p) => ({ id: { startsWith: p } }));

async function countAll() {
  const [components, contracts, users, workspaces, ledgers, tasks, usages, docs] = await Promise.all([
    prisma.componentcatalog.count({ where: { OR: orComp } }),
    prisma.componentcontract.count({ where: { OR: orCompId } }),
    prisma.user.count({ where: { OR: orUserSelf } }),
    prisma.workspace.count({ where: { OR: orWsSelf } }),
    prisma.pointledger.count({ where: { OR: orUser } }),
    prisma.componenttask.count({ where: { OR: orUser } }),
    prisma.componentusage.count({ where: { OR: orWs } }),
    prisma.document.count({ where: { OR: orDoc } }),
  ]);
  return { components, contracts, users, workspaces, ledgers, tasks, usages, docs };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const before = await countAll();

  if (!apply) {
    console.log(JSON.stringify({ status: "DRY_RUN", before, wroteDatabase: false }, null, 2));
    await prisma.$disconnect();
    return;
  }

  // 解除外键引用后再删除组件（顺序不可颠倒）
  const comps = await prisma.componentcatalog.findMany({ where: { OR: orComp }, select: { id: true } });
  for (const c of comps) {
    await prisma.componentcatalog.update({ where: { id: c.id }, data: { activeContractId: null } });
  }
  await prisma.componentcontract.deleteMany({ where: { OR: orCompId } });
  await prisma.componentcatalog.deleteMany({ where: { OR: orComp } });

  await prisma.document.deleteMany({ where: { OR: orDoc } });
  await prisma.pointledger.deleteMany({ where: { OR: orUser } });
  await prisma.pointgrant.deleteMany({ where: { OR: orUser } });
  await prisma.refundrecovery.deleteMany({ where: { OR: orUser } });
  await prisma.userwallet.deleteMany({ where: { OR: orUser } });
  await prisma.componenttask.deleteMany({ where: { OR: orUser } });
  await prisma.componentusage.deleteMany({ where: { OR: orWs } });
  await prisma.operationlog.deleteMany({ where: { OR: orUser } });
  await prisma.workspacemember.deleteMany({ where: { OR: orWs } });
  await prisma.workspacequota.deleteMany({ where: { OR: orWs } });
  await prisma.workspace.deleteMany({ where: { OR: orWsSelf } });
  await prisma.user.deleteMany({ where: { OR: orUserSelf } });

  const after = await countAll();
  const residual = Object.values(after).reduce((s, n) => s + n, 0);
  console.log(JSON.stringify({ status: residual === 0 ? "CLEANED" : "PARTIAL", before, after, wroteDatabase: true }, null, 2));
  await prisma.$disconnect();
  if (residual !== 0) process.exit(2);
}

main().catch((e) => {
  console.error("CLEANUP_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
