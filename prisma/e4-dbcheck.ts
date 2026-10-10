import * as shared from "./verify-e4-shared";

// 权威 taskId 清单（E4 验证结果）
// 11 个成功单（VERIFIED，含 1.0.0 首跑与 1.0.1 重试）
const SUCCESS = [
  "72ef71fb-7421-4365-aef9-dc69913859e2", // C46
  "1072d32f-592f-46b0-bcf4-7bc586725e1e", // C47 重试
  "01c7dd77-43dd-4be3-8ede-6c3fe55f5fed", // C48 重试
  "e326f185-5ce8-4ae0-91ed-5eebb42271d9", // C49
  "cc9a898a-6569-48f8-8c82-9237b30f9ad6", // C50
  "639890bc-e5f5-4578-9cec-1f2074b9b48f", // C51
  "99b812b2-5fee-4744-bbe2-95b626332f7c", // C52 重试
  "456696df-2081-4f27-9dae-26dbe6a664e7", // C53 重试
  "54f79c21-ea28-4d2f-beb7-f27df26ce16f", // C54 重试
  "4b59d050-f996-493c-a1e5-6c8e573a857f", // C55 重试
  "e6d88b29-a70b-46bf-bef1-29b79a776d0f", // C56
];
// 3 个失败抽样（超时 REFUNDED）
const FAIL = [
  "42e6e978-35fd-43f8-b914-a2309fbbab51", // C50 超时退款
  "65281e33-0d63-4503-a1a1-6e6316ca135a", // C55 超时退款
  "61639053-cec7-4384-b00f-c7dfd4ece067", // C60 超时退款
];
// 4 个受上游密钥配额(403)阻塞的失败单（FAILED+全额退款，非合同缺陷，待配额恢复后复验）
const BLOCKED_FAILED = [
  "1af0598e-e296-4e94-ac27-f9b012a11673", // C57 403
  "f9c49e59-8f8a-4f21-98d9-52516762d815", // C58 403
  "af35670e-bb91-4e46-97a2-fd9e1c0b0dc5", // C59 403
  "2158d486-e8d3-48d6-b30d-10f8fc6806ef", // C60 403
];
const ALL = [...SUCCESS, ...FAIL, ...BLOCKED_FAILED];

async function main() {
  const tasks = await shared.prisma.componenttask.findMany({
    where: { id: { in: ALL } },
    select: { id: true, status: true, userId: true, createdAt: true },
  });
  const led = await shared.prisma.pointledger.findMany({
    where: { taskId: { in: ALL } },
    select: { taskId: true, type: true, points: true },
  });
  const foundIds = new Set(tasks.map((t) => t.id));
  const missing = ALL.filter((id) => !foundIds.has(id));
  const ledByTask = new Map<string, { consume: number; refund: number }>();
  for (const r of led) {
    if (!r.taskId) continue;
    const cur = ledByTask.get(r.taskId) ?? { consume: 0, refund: 0 };
    const p = Number(r.points);
    if (r.type === "CONSUME") cur.consume += p;
    else if (r.type === "REFUND") cur.refund += p;
    ledByTask.set(r.taskId, cur);
  }
  const statusByTask = new Map(tasks.map((t) => [t.id, t.status]));
  const out = {
    expectedTasks: ALL.length,
    foundTasks: tasks.length,
    missingTaskIds: missing,
    allPresent: missing.length === 0,
    ledgerRows: led.length,
    ledgerByTask: Object.fromEntries(ledByTask),
    statusByTask: Object.fromEntries(statusByTask),
  };
  console.log(JSON.stringify(out, null, 2));
  await shared.prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("DBCHECK_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
