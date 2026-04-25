-- CreateTable
CREATE TABLE `MembershipLevel` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameZh` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#94a3b8',
    `description` VARCHAR(191) NULL,
    `maxPersonalWorkspaces` INTEGER NOT NULL DEFAULT 1,
    `maxEnterpriseWorkspaces` INTEGER NOT NULL DEFAULT 1,
    `maxComponents` INTEGER NOT NULL DEFAULT 100,
    `maxTeamSize` INTEGER NOT NULL DEFAULT 5,
    `maxStorage` INTEGER NOT NULL DEFAULT 1073741824,
    `maxApiCalls` INTEGER NOT NULL DEFAULT 1000,
    `features` JSON NULL,
    `priceMonthly` INTEGER NOT NULL DEFAULT 0,
    `priceYearly` INTEGER NOT NULL DEFAULT 0,
    `trialDays` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MembershipLevel_name_key`(`name`),
    INDEX `MembershipLevel_name_idx`(`name`),
    INDEX `MembershipLevel_isActive_idx`(`isActive`),
    INDEX `MembershipLevel_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipOrder` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `orderType` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `paymentMethod` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `transactionId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MembershipOrder_userId_idx`(`userId`),
    INDEX `MembershipOrder_levelId_idx`(`levelId`),
    INDEX `MembershipOrder_status_idx`(`status`),
    INDEX `MembershipOrder_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipChangeLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NULL,
    `operatorId` VARCHAR(191) NULL,
    `changeType` VARCHAR(191) NOT NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MembershipChangeLog_userId_idx`(`userId`),
    INDEX `MembershipChangeLog_operatorId_idx`(`operatorId`),
    INDEX `MembershipChangeLog_changeType_idx`(`changeType`),
    INDEX `MembershipChangeLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MembershipOrder` ADD CONSTRAINT `MembershipOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipOrder` ADD CONSTRAINT `MembershipOrder_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `MembershipLevel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipChangeLog` ADD CONSTRAINT `MembershipChangeLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipChangeLog` ADD CONSTRAINT `MembershipChangeLog_operatorId_fkey` FOREIGN KEY (`operatorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipChangeLog` ADD CONSTRAINT `MembershipChangeLog_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `MembershipLevel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
