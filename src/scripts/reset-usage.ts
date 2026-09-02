import { prisma } from "@/lib/prisma";

async function main() {
  console.log("正在重置数据库 componentcatalog 表的所有 usageCount 为 0...");
  const result = await prisma.componentcatalog.updateMany({
    data: {
      usageCount: 0,
    },
  });
  console.log(`成功重置了数据库中 ${result.count} 条组件记录的调度次数为 0 次！`);
}

main()
  .catch((e) => {
    console.error("重置失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
