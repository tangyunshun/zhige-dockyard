-- 修复 user_byo_model_def.apiKeyCipher 长度上限 + 新增供应商(providerName)字段
--
-- 问题：Prisma 的 String 在 MySQL 下默认映射为 varchar(191)，
-- 而 AES-256-GCM 加密后的 base64 密文常 > 191 字符，导致新增/更新自带模型时
-- 报 "The provided value for the column is too long for the column's type. Column: apiKeyCipher"。
-- 统一改为 TEXT（与 workspace_byo_model 保持一致）。
--
-- 同时新增 providerName（供应商/厂商名称），用于标识自带模型的厂商归属。

ALTER TABLE `user_byo_model_def`
  MODIFY COLUMN `apiKeyCipher` TEXT NOT NULL,
  ADD COLUMN `providerName` VARCHAR(191) NOT NULL DEFAULT '';

ALTER TABLE `workspace_byo_model`
  MODIFY COLUMN `apiKeyCipher` TEXT NOT NULL,
  ADD COLUMN `providerName` VARCHAR(191) NOT NULL DEFAULT '';
