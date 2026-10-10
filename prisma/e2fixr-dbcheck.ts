import * as shared from "./verify-e2fix-shared";

const SUCCESS = [
  "430f7999-874e-41be-89b7-e3885a600c69",
  "1f9e83d5-662b-485a-8931-dff7a6311324",
  "8ed486b2-8edb-47e0-9657-4c5ae931a656",
  "1c53cd4c-0a74-43ff-ab9f-225cdc5fe079",
  "2564caed-898a-42ee-a3e0-38db154594cf",
  "deb6c3a9-bee1-46d0-b31c-09d2069d45fd",
  "00f8c584-a8f2-4a92-a50e-4f8a5454af44",
  "9590a113-47e4-479c-baa5-d36fd03dd656",
  "df5aeef5-b4d0-4799-932a-5d4c9380fac8",
  "da87660e-a3fe-4089-bcbc-ddf237ee7a03",
  "f584d9dc-e77d-4699-9ad7-6236daf7ba44",
  "90f6efea-a2dd-453f-beab-bf87d6448d6d",
];
const FAIL = [
  "5a882979-e7f5-4ed0-a7d4-14d8b8d9e7ae",
  "4ac424c6-209b-4d3a-98fe-c9db1965ccba",
  "587b0929-b33d-4015-a6aa-e796dad7d3dd",
];
const ALL = [...SUCCESS, ...FAIL];

async function main() {
  const tasks = await shared.prisma.componenttask.findMany({
    where: { id: { in: ALL } },
    select: { id: true, status: true, userId: true, createdAt: true },
  });
  const led = await shared.prisma.pointledger.findMany({
    where: { taskId: { in: ALL } },
    select: { taskId: true, type: true, points: true, createdAt: true },
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
