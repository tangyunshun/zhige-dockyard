-- 前台文档中心(/docs) 数据库驱动化改造：为 systemdocument 及历史快照表补充展示字段
-- 摘要(简介) / 代码示例 / 关联链接(JSON: {label,path}) / 有用点赞数

-- AlterTable: systemdocument
ALTER TABLE `systemdocument`
    ADD COLUMN `summary` TEXT NULL,
    ADD COLUMN `codeSample` TEXT NULL,
    ADD COLUMN `relatedLink` VARCHAR(191) NULL,
    ADD COLUMN `helpfulCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable: system_document_history
ALTER TABLE `system_document_history`
    ADD COLUMN `summary` TEXT NULL,
    ADD COLUMN `codeSample` TEXT NULL,
    ADD COLUMN `relatedLink` VARCHAR(191) NULL,
    ADD COLUMN `helpfulCount` INTEGER NOT NULL DEFAULT 0;
