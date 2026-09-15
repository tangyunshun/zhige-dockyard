-- AlterTable: 企业空间成员独立算力点余额
-- 用于「成员独立余额」模型：普通成员执行组件任务时仅从其自身 tokenBalance 扣减，
-- 不再消耗空间共享池；空间所有者/管理员通过「配置算力」从共享池分配至成员余额。
ALTER TABLE `workspacemember` ADD COLUMN `tokenBalance` BIGINT NOT NULL DEFAULT 0;
