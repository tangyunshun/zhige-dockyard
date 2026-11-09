-- 离线迁移：VerificationBudget 增加 60s 间隔与失败锁定所需字段
-- 仅说明结构变更，未在本环境执行（安全红线：禁止 apply migration）。
-- 部署时由 safe-migrate 流程执行；兼容顺序与回滚见 schema-migration-and-recovery.md。

-- 1) 上次发送时刻（毫秒时间戳）：用于 60s 目标发送间隔裁决
ALTER TABLE `VerificationBudget`
  ADD COLUMN `lastSentAt` BIGINT NOT NULL DEFAULT 0;

-- 2) 连续核验失败次数：达到上限后触发时间锁定
ALTER TABLE `VerificationBudget`
  ADD COLUMN `failCount` INT NOT NULL DEFAULT 0;

-- 3) 失败锁定截止时刻（毫秒时间戳）：> now 期间禁止发送
ALTER TABLE `VerificationBudget`
  ADD COLUMN `lockedUntil` BIGINT NOT NULL DEFAULT 0;

-- 说明：
-- - 不 DROP 现有列，不清除历史预算行；既有行 lastSentAt/failCount/lockedUntil 均默认 0（未锁、无失败）。
-- - 回滚：依次 DROP COLUMN `lockedUntil` / `failCount` / `lastSentAt`。
-- - 唯一键/索引：复用既有 id 主键与 @@index([id])，无需新增（platform/ip/target 预算键已以 id 文本编码）。
