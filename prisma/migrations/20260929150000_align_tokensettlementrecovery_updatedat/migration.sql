-- 修复既有 schema 漂移：tokensettlementrecovery.updatedAt 当前数据库上带有 DEFAULT CURRENT_TIMESTAMP(3)，
-- 而 schema.prisma 中该字段声明为 @updatedAt（由 Prisma 客户端维护，不需要数据库层默认值）。
--
-- 该漂移会导致 prisma migrate dev 的漂移检测持续报出差异，阻碍后续新迁移的正常生成，
-- 因此单独一个迁移将其对齐；不改任何数据，仅去掉数据库层的默认值。

ALTER TABLE `tokensettlementrecovery` ALTER COLUMN `updatedAt` DROP DEFAULT;
