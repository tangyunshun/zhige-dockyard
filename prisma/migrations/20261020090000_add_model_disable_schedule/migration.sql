-- CreateTable: modeldisableschedule（模型禁用计划：立即/定时禁用，到点由 cron 执行替换默认+通知+审计）
CREATE TABLE `modeldisableschedule` (
    `id` VARCHAR(191) NOT NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `effectiveAt` DATETIME(3) NOT NULL,
    `replacementDeploymentId` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `impact` JSON NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ModelDisableSchedule_status_effectiveAt_idx` ON `modeldisableschedule`(`status`, `effectiveAt`);

-- AddForeignKey
ALTER TABLE `modeldisableschedule` ADD CONSTRAINT `ModelDisableSchedule_deploymentId_fkey` FOREIGN KEY (`deploymentId`) REFERENCES `modeldeployment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
