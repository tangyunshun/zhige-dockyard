-- AlterTable
ALTER TABLE `tokensettlement`
    MODIFY `costMicros` BIGINT NULL,
    ADD COLUMN `userPriceMicros` BIGINT NULL;

-- CreateTable
CREATE TABLE `tokensettlementrecovery` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `recoveryType` VARCHAR(191) NOT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `processingStartedAt` DATETIME(3) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `claimToken` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TokenSettlementRecovery_taskId_key`(`taskId`),
    UNIQUE INDEX `TokenSettlementRecovery_claimToken_key`(`claimToken`),
    INDEX `TokenSettlementRecovery_status_leaseUntil_idx`(`status`, `leaseUntil`),
    INDEX `TokenSettlementRecovery_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
