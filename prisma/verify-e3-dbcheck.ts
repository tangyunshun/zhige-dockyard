import * as shared from "./verify-e3-shared";

// 权威 taskId 清单（E3 全 14 成功 + 4 超时退款失败；外加 C44 首跑上行 502 失败单作为记录）
const SUCCESS = [
  "0a3f266b-aab8-4482-9bcd-d10b48f7812a", // C32
  "4b12ccde-8ce0-4460-9132-6071c4be5a1e", // C33
  "0e64ec72-1da9-42e6-8ea4-412a32558923", // C34
  "f76a2771-4bdd-49e8-b6b2-e82778fdab90", // C35
  "bbd40601-fc72-4bce-8c52-9acf039b495e", // C36
  "4a4364cc-fac2-44c7-9749-74a588cb1767", // C37
  "6640658f-276e-4fc2-bc5f-620b780342c9", // C38
  "63f6a31d-76de-468a-b603-685b738df439", // C39
  "90826849-839d-4f56-9684-84b318fe50a0", // C40
  "2896119f-1d91-4fc7-8ebf-9b238a3f42ca", // C41
  "b373ba73-ae7f-4538-bc12-1847ea09abbe", // C42
  "bec5b1ec-abd4-495d-ae1e-b2e958531703", // C43
  "ff348b95-e8a3-4912-82db-5e9e1238c6c2", // C44 (重试成功)
  "c457237f-03bc-4335-9eb6-45f80328327d", // C45
];
const FAIL = [
  "5aa1e1fa-8f56-40a5-ac63-69e2de6ba2b7", // C32 超时退款
  "d69002ce-1e22-46da-9bcd-e5705e542e4e", // C36 超时退款
  "2a0b3231-dc4b-470b-b7b7-36a0709c941a", // C40 超时退款
  "61a1cf81-e9b3-41a9-a45c-e5511d4567f9", // C44 超时退款
];
const EXTRA_FAIL = [
  "80ddfd9c-7927-4409-a755-e15a451535f6", // C44 首跑 MODEL_UPSTREAM_ERROR(502) 失败单（已退款，记录）
];
const ALL = [...SUCCESS, ...FAIL, ...EXTRA_FAIL];

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
  const out = {
    expectedTasks: ALL.length,
    foundTasks: tasks.length,
    missingTaskIds: missing,
    allPresent: missing.length === 0,
    ledgerRows: led.length,
    ledgerByTask: Object.fromEntries(ledByTask),
    tasks: tasks.sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  console.log(JSON.stringify(out, null, 2));
  await shared.prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("DBCHECK_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
