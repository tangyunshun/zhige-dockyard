-- 账单与交易记录表：记录空间套餐升级、会员订阅、算力充值等真实交易流水
-- 供计费中心（/settings/billing）查询、对账与发票导出使用
CREATE TABLE `billing_record` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `status` VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
    `channel` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `invoiceUrl` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BillingRecord_userId_idx` (`userId`),
    INDEX `BillingRecord_workspaceId_idx` (`workspaceId`),
    INDEX `BillingRecord_status_idx` (`status`),
    INDEX `BillingRecord_createdAt_idx` (`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
