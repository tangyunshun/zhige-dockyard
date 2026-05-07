import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function test() {
  console.log("🧪 测试 BigInt 更新...\n");

  try {
    // 测试更新一个会员等级
    const updated = await prisma.membershiplevel.update({
      where: { name: "FREE" },
      data: {
        nameZh: "免费版",
        maxEnterpriseWorkspaces: BigInt(1),
        maxComponents: BigInt(100),
        maxTeamSize: BigInt(5),
        maxStorage: BigInt(1073741824),
        maxApiCalls: BigInt(1000),
      },
    });

    console.log("✅ 更新成功！");
    console.log("更新后的记录:", {
      name: updated.name,
      nameZh: updated.nameZh,
      maxEnterpriseWorkspaces: updated.maxEnterpriseWorkspaces.toString(),
      maxComponents: updated.maxComponents.toString(),
      maxTeamSize: updated.maxTeamSize.toString(),
      maxStorage: updated.maxStorage.toString(),
      maxApiCalls: updated.maxApiCalls.toString(),
    });
  } catch (error: any) {
    console.error("❌ 更新失败");
    console.error("错误类型:", error.constructor.name);
    console.error("错误消息:", error.message);
    console.error("错误代码:", error.code);
    console.error("Prisma 客户端:", error.clientVersion);
    if (error.meta) {
      console.error("错误详情:", error.meta);
    }
  }

  await prisma.$disconnect();
}

test().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
