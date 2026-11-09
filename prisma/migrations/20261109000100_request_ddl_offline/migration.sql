-- 离线迁移（U12 / 原 13）：把原先在业务请求里执行的结构变更改为离线部署。
-- 本环境未执行（安全红线：禁止 apply migration）。部署由 safe-migrate 流程执行。
-- 生产代码已移除这些请求内 DDL，缺结构时稳定返回 not-ready（503），不自动建表/扩列。
-- 依次为：A) webhooksubscription 建表；B) workspace_byo_model.shareWithMembers 加列；
--        C) system_config.value 扩容至 MEDIUMTEXT。
-- 均幂等（IF NOT EXISTS / information_schema 条件化），重复部署无副作用。

-- A) Webhook 订阅表（原先由 GET/POST/PATCH/DELETE /api/webhooks 自愈 CREATE TABLE）
CREATE TABLE IF NOT EXISTS `webhooksubscription` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `secret` VARCHAR(191) NOT NULL,
  `events` TEXT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `successRate` VARCHAR(50) NOT NULL DEFAULT '100%',
  `lastTriggered` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `Webhook_userId_idx` (`userId`),
  INDEX `Webhook_active_idx` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- B) BYO 共享列（原先由 GET/PUT /api/workspace/byo-model 等请求热 ALTER ADD COLUMN）
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `workspace_byo_model` ADD COLUMN `shareWithMembers` BOOLEAN NOT NULL DEFAULT true',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_byo_model' AND COLUMN_NAME = 'shareWithMembers'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- C) 系统配置值列扩容（原先由 POST /api/admin/settings 写「值过长」时惰性 ALTER）
--    仅在列当前不是长文本类型时执行，避免重复部署反复改列。
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `system_config` MODIFY COLUMN `value` MEDIUMTEXT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_config'
    AND COLUMN_NAME = 'value' AND DATA_TYPE IN ('mediumtext', 'longtext')
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回滚：DROP TABLE `webhooksubscription` / DROP COLUMN `shareWithMembers` /
--        MODIFY COLUMN `value` VARCHAR(191)（生产回滚需独立授权，可能截断既有长值）。
