-- 为 workspace_byo_model 增加 shareWithMembers 字段，支持自带模型共享开关
-- 默认 true（允许空间成员共享调用；false 时仅空间所有者可使用）
ALTER TABLE `workspace_byo_model` ADD COLUMN `shareWithMembers` BOOLEAN NOT NULL DEFAULT true;
