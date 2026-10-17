-- 平台级默认模型池 + 新空间体验额度 + 算力点提升申请
--
-- 设计原则：不新建平行账本。
--   - 模型复用 modeldeployment（不新建 model 表）；
--   - 余额与流水复用 pointgrant / pointledger / workspacequota.tokenBalance；
--   - 仅新增「默认模型池」「额度申请表」两张结构表，并在空间策略上补一个禁用清单字段。

-- CreateTable: platformdefaultmodel（平台默认模型池：FREE 自动继承 / PAID 需额外开通）
CREATE TABLE `platformdefaultmodel` (
    `id` VARCHAR(191) NOT NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'FREE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformDefaultModel_deploymentId_kind_key`(`deploymentId`, `kind`),
    INDEX `PlatformDefaultModel_kind_enabled_idx`(`kind`, `enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: quotaapply（算力点提升申请：审批通过后入账空间共享池）
CREATE TABLE `quotaapply` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `applyPoints` BIGINT NOT NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `adminId` VARCHAR(191) NULL,
    `approvedPoints` BIGINT NULL,
    `adminRemark` TEXT NULL,
    `ledgerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `QuotaApply_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `QuotaApply_workspaceId_status_idx`(`workspaceId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: workspace_model_policy 增加「空间级禁用清单」
-- 支撑「有效模型 = 平台默认免费 + 空间额外开通 - 空间禁用」的三段式计算
ALTER TABLE `workspace_model_policy` ADD COLUMN `disabledDeploymentIds` JSON NOT NULL;
