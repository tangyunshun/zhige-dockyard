-- 删除系统文档时，其编辑历史不再随外键级联物理蒸发：
-- 1) document_id 改为可空；2) 外键改为 ON DELETE SET NULL；3) 新增 note 字段用于“删除前快照”标注。
ALTER TABLE `system_document_history` MODIFY COLUMN `document_id` VARCHAR(191) NULL;

ALTER TABLE `system_document_history` DROP FOREIGN KEY `SystemDocumentHistory_documentId_fkey`;

ALTER TABLE `system_document_history` ADD CONSTRAINT `SystemDocumentHistory_documentId_fkey` FOREIGN KEY (`document_id`) REFERENCES `systemdocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `system_document_history` ADD COLUMN `note` VARCHAR(191) NULL;
