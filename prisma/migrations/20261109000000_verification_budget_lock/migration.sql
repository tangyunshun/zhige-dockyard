-- 离线迁移（U12 / 原 13）：VerificationBudget 表 + 60s 间隔/失败锁定字段
-- 本环境未执行（安全红线：禁止 apply migration / 禁止重建库）。
-- 部署由 safe-migrate 流程（先自动备份再 deploy）执行；顺序与回滚见
-- docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/schema-migration-and-recovery.md
--
-- 兼容状态矩阵：
--   A) 全新空库：下面 1) 建完整表；2) 的三条 ADD COLUMN 会因列已存在报错 —— 因此
--      采用 information_schema 条件化 ADD COLUMN（列不存在才加），使 A/B 状态都幂等通过。
--   B) 已有旧表（只有 id/count/windowStart/version/updatedAt）：建表语句 IF NOT EXISTS 跳过，
--      2) 补齐 lastSentAt / failCount / lockedUntil 三列（存量行默认 0，不丢历史预算）。
--   C) 已执行过本迁移的实例：全部步骤均为条件化/IF NOT EXISTS，重复执行无副作用。
-- 不 DROP 任何列、不清空任何表、不迁移租户/资金。

-- 1) 创建表（空库前提）。列与 prisma/schema.prisma 的 VerificationBudget 模型一致：
--    id(主键) / count / windowStart / lastSentAt / failCount / lockedUntil / version / updatedAt。
CREATE TABLE IF NOT EXISTS `VerificationBudget` (
  `id` VARCHAR(191) NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  `windowStart` BIGINT NOT NULL DEFAULT 0,
  `lastSentAt` BIGINT NOT NULL DEFAULT 0,
  `failCount` INT NOT NULL DEFAULT 0,
  `lockedUntil` BIGINT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `VerificationBudget_id_idx` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 已有旧表兼容（列缺失才补）。MySQL 不支持 ADD COLUMN IF NOT EXISTS，
--    用 information_schema + 动态 SQL 条件化执行，保证重复部署幂等。
-- 2a) 上次发送时刻（毫秒时间戳）：60s 目标发送间隔裁决
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `VerificationBudget` ADD COLUMN `lastSentAt` BIGINT NOT NULL DEFAULT 0',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VerificationBudget' AND COLUMN_NAME = 'lastSentAt'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2b) 连续核验失败次数：达到 5 次后触发 30 分钟锁定
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `VerificationBudget` ADD COLUMN `failCount` INT NOT NULL DEFAULT 0',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VerificationBudget' AND COLUMN_NAME = 'failCount'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2c) 失败锁定截止时刻（毫秒时间戳）：> now 期间禁止发送与核验
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `VerificationBudget` ADD COLUMN `lockedUntil` BIGINT NOT NULL DEFAULT 0',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VerificationBudget' AND COLUMN_NAME = 'lockedUntil'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 说明：
-- - 存量行三个新列默认 0（未锁、无失败、无上次发送），60s 间隔从下一次真实发送起算。
-- - 回滚：DROP COLUMN `lockedUntil` / `failCount` / `lastSentAt`（生产执行需独立授权）。
-- - 生产代码侧 verification-backend.ts 用 Prisma delegate（camelCase verificationBudget），
--   字段名与本表一致；部署后需隔离真实 .env 重新 generate 客户端（未执行）。
