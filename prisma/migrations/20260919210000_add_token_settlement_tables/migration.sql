-- AlterTable
ALTER TABLE `refundrecovery` ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `tokensettlementhold` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `holdPoints` BIGINT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'HELD',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `holdDetails` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TokenSettlementHold_taskId_key`(`taskId`),
    UNIQUE INDEX `TokenSettlementHold_idempotencyKey_key`(`idempotencyKey`),
    INDEX `TokenSettlementHold_userId_status_idx`(`userId`, `status`),
    INDEX `TokenSettlementHold_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `TokenSettlementHold_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tokensettlement` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'HOLD',
    `holdPoints` BIGINT NOT NULL,
    `actualPricePoints` BIGINT NOT NULL DEFAULT 0,
    `releasedPoints` BIGINT NOT NULL DEFAULT 0,
    `supplementPoints` BIGINT NOT NULL DEFAULT 0,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `cacheReadTokens` INTEGER NOT NULL DEFAULT 0,
    `cacheWriteTokens` INTEGER NOT NULL DEFAULT 0,
    `costMicros` BIGINT NOT NULL DEFAULT 0,
    `pricingSnapshot` JSON NOT NULL,
    `settlementVersion` INTEGER NOT NULL DEFAULT 1,
    `errorCode` VARCHAR(191) NULL,
    `auditMessage` TEXT NULL,
    `settledAt` DATETIME(3) NULL,
    `releasedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TokenSettlement_taskId_key`(`taskId`),
    INDEX `TokenSettlement_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `TokenSettlement_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
    INDEX `TokenSettlement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
