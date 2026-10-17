-- AlterTable
ALTER TABLE `modelprovider` MODIFY `health` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    MODIFY `lastTestedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `platformdefaultmodel` ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `quotaapply` ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `workspace_byo_model` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `modelpricingperiod` (
    `id` VARCHAR(191) NOT NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `weekdays` VARCHAR(191) NULL,
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `costInputMicrosPerMillion` INTEGER NULL,
    `costOutputMicrosPerMillion` INTEGER NULL,
    `costCacheReadMicrosPerMillion` INTEGER NULL,
    `costCacheWriteMicrosPerMillion` INTEGER NULL,
    `priceInputMicrosPerMillion` INTEGER NULL,
    `priceOutputMicrosPerMillion` INTEGER NULL,
    `priceCacheReadMicrosPerMillion` INTEGER NULL,
    `priceCacheWriteMicrosPerMillion` INTEGER NULL,
    `priceSource` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
    `priceStatus` VARCHAR(191) NOT NULL DEFAULT 'UNCONFIGURED',
    `markupRateBps` INTEGER NULL,
    `priceVersion` INTEGER NOT NULL DEFAULT 1,
    `effectiveFrom` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `modelpricingperiod_deploymentId_idx`(`deploymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `modelpricingperiod` ADD CONSTRAINT `ModelPricingPeriod_deploymentId_fkey` FOREIGN KEY (`deploymentId`) REFERENCES `modeldeployment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_byo_model_assignment` ADD CONSTRAINT `user_byo_model_assignment_defId_fkey` FOREIGN KEY (`defId`) REFERENCES `user_byo_model_def`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
