/**
 * 【只读审计脚本 · 严禁写操作】
 * 用途：批次 1 停条件 1（BYO 语义冲突）裁决依据——
 *   统计 workspace_byo_model 现有登记记录条数，并判断是否为真实用户数据。
 * 本脚本只执行 findMany / count，不做任何 create / update / delete。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.workspace_byo_model.findMany({
    select: {
      id: true,
      workspaceId: true,
      label: true,
      enabled: true,
      priceInputMicrosPerMillion: true,
      priceOutputMicrosPerMillion: true,
      priceStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(`[只读] workspace_byo_model 登记记录条数: ${rows.length}`);
  console.log(JSON.stringify(rows, null, 2));

  if (rows.length > 0) {
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: rows.map((r) => r.workspaceId) } },
      select: { id: true, name: true, type: true, ownerId: true, createdAt: true },
    });
    console.log("[只读] 关联空间（判断是否真实用户数据）:");
    console.log(JSON.stringify(workspaces, null, 2));
  }

  // 附带：平台模型价格登记情况（用于待登记清单）
  const pricings = await prisma.modelpricing.findMany({
    select: {
      deploymentId: true,
      priceSource: true,
      priceStatus: true,
      costInputMicrosPerMillion: true,
      costOutputMicrosPerMillion: true,
      priceInputMicrosPerMillion: true,
      priceOutputMicrosPerMillion: true,
      markupRateBps: true,
    },
  });
  console.log(`[只读] modelpricing 记录条数: ${pricings.length}`);
  console.log(JSON.stringify(pricings, null, 2));
}

main()
  .catch((e) => {
    console.error("只读审计失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
