-- 新增：用户自助提交评价所需的字段（待审核流转）
-- 说明：本迁移**仅做增量新增**（ALTER TABLE ADD COLUMN + ADD INDEX），
--       不改动、不删除任何既有列与数据，历史评价记录保持原样。
-- 安全提示：对已有数据的库请始终使用 `prisma migrate deploy`（切勿使用 migrate dev / reset）。

ALTER TABLE `testimonial`
    ADD COLUMN `submitterId` VARCHAR(191) NULL,
    ADD COLUMN `submittedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewNote` VARCHAR(191) NULL;

CREATE INDEX `Testimonial_submitterId_idx` ON `testimonial`(`submitterId`);
