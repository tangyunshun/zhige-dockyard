/**
 * 初始化「模型能力展示名」字典到 systemsetting 表（幂等：已存在且非空则不覆盖）。
 * 目的：界面上的能力中文名以数据库为准、管理员可在后台调整，代码里不再写死。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  MODEL_CAPABILITY_LABELS,
  MODEL_CAPABILITY_LABELS_KEY,
} from "../src/lib/model-capability-labels";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.systemsetting.findUnique({
    where: { key: MODEL_CAPABILITY_LABELS_KEY },
    select: { value: true },
  });
  if (existing && (existing.value || "").trim().length > 0) {
    console.log("已存在，跳过：", existing.value.slice(0, 80), "...");
    return;
  }
  const value = JSON.stringify(MODEL_CAPABILITY_LABELS);
  await prisma.systemsetting.upsert({
    where: { key: MODEL_CAPABILITY_LABELS_KEY },
    create: {
      key: MODEL_CAPABILITY_LABELS_KEY,
      value,
      description: "模型抽象能力的展示名（JSON），管理员可在后台调整",
    },
    update: { value },
  });
  console.log("已写入能力展示名字典：", value);
}

main()
  .catch((e) => {
    console.error("写入失败:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
