-- 商业化订阅制与会员/套餐维度字段
-- 会员等级新增：并发任务数 / 单文件大小上限 / 可分配模型数 / 自建模型数
-- 空间套餐新增：并发任务数 / 单文件大小上限 / 可分配模型数 / 自建模型数
-- 空间新增：订阅生命周期（生效起止时间 + 计费周期），用于到期自动降级

-- AlterTable
ALTER TABLE `membershiplevel` ADD COLUMN `maxByoModels` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `maxConcurrency` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `maxModelAllocations` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `maxSingleFileBytes` BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `workspace` ADD COLUMN `planBillingCycle` VARCHAR(191) NULL,
    ADD COLUMN `planExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `planStartedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `workspaceplan` ADD COLUMN `maxByoModels` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `maxConcurrency` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `maxModelAllocations` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `maxSingleFileBytes` BIGINT NOT NULL DEFAULT 0;
