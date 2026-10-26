-- 个人中心 UI 偏好迁库：此前 /api/user/settings 用源码目录 JSON 文件做持久化
-- （多实例不一致、重新部署即丢、无并发控制），改为 userpreference.uiSettings 单列 JSON 快照
ALTER TABLE `userpreference` ADD COLUMN `uiSettings` JSON NULL;
