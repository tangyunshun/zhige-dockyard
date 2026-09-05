-- ============================================================
-- 算力点体系：用户钱包 / 分桶余额 / 流水总账 / 线下充值工单
-- 并补齐历史缺失的 tokenpack 表
-- ============================================================

-- CreateTable: 用户算力钱包（跨空间通用余额）
CREATE TABLE `userwallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `balance` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserWallet_userId_key`(`userId`),
    INDEX `UserWallet_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 算力分桶（发放批次，按到期时间 FIFO 消耗，到期清零）
CREATE TABLE `pointgrant` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `workspaceId` VARCHAR(191) NULL,
    `points` BIGINT NOT NULL,
    `remaining` BIGINT NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `operatorId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PointGrant_userId_status_idx`(`userId`, `status`),
    INDEX `PointGrant_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `PointGrant_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 算力点流水总账
CREATE TABLE `pointledger` (
    `id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `workspaceId` VARCHAR(191) NULL,
    `workspaceName` VARCHAR(191) NULL,
    `workspaceType` VARCHAR(191) NULL,
    `operatorId` VARCHAR(191) NULL,
    `points` BIGINT NOT NULL,
    `balanceAfter` BIGINT NOT NULL DEFAULT 0,
    `amountCents` INTEGER NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NULL,
    `orderNo` VARCHAR(191) NULL,
    `grantId` VARCHAR(191) NULL,
    `componentId` VARCHAR(191) NULL,
    `componentName` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `remark` TEXT NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PointLedger_idempotencyKey_key`(`idempotencyKey`),
    INDEX `PointLedger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `PointLedger_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
    INDEX `PointLedger_type_idx`(`type`),
    INDEX `PointLedger_direction_idx`(`direction`),
    INDEX `PointLedger_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 线下充值工单（对公转账 / 合同结算）
CREATE TABLE `tokenrechargeorder` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `workspaceName` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL,
    `applicantId` VARCHAR(191) NOT NULL,
    `applicantName` VARCHAR(191) NULL,
    `packId` VARCHAR(191) NULL,
    `packName` VARCHAR(191) NULL,
    `points` BIGINT NOT NULL,
    `amountCents` INTEGER NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'OFFLINE_BANK',
    `invoiceTitle` VARCHAR(191) NULL,
    `taxNo` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `bankAccount` VARCHAR(191) NULL,
    `voucherUrl` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewerId` VARCHAR(191) NULL,
    `reviewerName` VARCHAR(191) NULL,
    `reviewNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `ledgerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TokenRechargeOrder_orderNo_key`(`orderNo`),
    INDEX `TokenRechargeOrder_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `TokenRechargeOrder_applicantId_idx`(`applicantId`),
    INDEX `TokenRechargeOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 注意：tokenpack 表此前由运行环境直接创建（缺失迁移记录），此处不再重复建表；
-- 其结构已与 schema.prisma 中的 tokenpack model 对齐。
