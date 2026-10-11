-- 供应商连通性健康状态与最近测试时间
-- 对应 schema.prisma modelprovider 新增 health / lastTestedAt 字段
-- 注意：本库为 MySQL，标识符用反引号，VARCHAR 用于小枚举值以支持默认值
ALTER TABLE `modelprovider` ADD COLUMN `health` VARCHAR(16) NOT NULL DEFAULT 'unknown';
ALTER TABLE `modelprovider` ADD COLUMN `lastTestedAt` TIMESTAMP(3) NULL;
