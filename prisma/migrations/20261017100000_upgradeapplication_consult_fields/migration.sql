-- 定制咨询链路补齐：
-- 1) description 保存用户提交的需求说明（此前后端直接丢弃该字段）
-- 2) adminRemark / handledBy 供管理端记录处理备注与处理人
-- 3) workspaceId 改为可空：允许尚未创建/无管理权限空间的用户提交定制咨询
ALTER TABLE `upgradeapplication` ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `adminRemark` TEXT NULL,
    ADD COLUMN `handledBy` VARCHAR(191) NULL,
    MODIFY COLUMN `workspaceId` VARCHAR(191) NULL;
