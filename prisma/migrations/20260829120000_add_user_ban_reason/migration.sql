-- 为 user 表新增 ban_reason 列，用于存储管理员封禁用户时选择/填写的封禁原因，
-- 作为用户详情、登录页申诉、申诉详情等页面统一读取的权威来源
ALTER TABLE `user` ADD COLUMN `ban_reason` TEXT NULL;
