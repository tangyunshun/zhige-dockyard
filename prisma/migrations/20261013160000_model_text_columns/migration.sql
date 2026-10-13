-- 将与「用户可输入的长文本」相关的模型列统一改为 TEXT，彻底消除
-- "The provided value for the column is too long" 类问题（与 apiKeyCipher 同类修复）。
-- 涉及：modelprovider.baseUrl、user_byo_model_def.baseUrl、workspace_byo_model.baseUrl。
-- 说明：apiKeyCipher 三表已在各自迁移/本次会话中改为 TEXT，此处不再重复。

ALTER TABLE `modelprovider` MODIFY COLUMN `baseUrl` TEXT NOT NULL;
ALTER TABLE `user_byo_model_def` MODIFY COLUMN `baseUrl` TEXT NOT NULL;
ALTER TABLE `workspace_byo_model` MODIFY COLUMN `baseUrl` TEXT NOT NULL;
