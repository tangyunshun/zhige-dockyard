-- DropIndex
DROP INDEX `Notification_popupOnLogin_isRead_idx` ON `notification`;

-- AlterTable
ALTER TABLE `accountappeal` ADD COLUMN `businessType` VARCHAR(191) NULL DEFAULT '账号解封申诉';

-- AlterTable
ALTER TABLE `component_category` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `document` ADD COLUMN `file_ext` VARCHAR(32) NULL,
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `summary` TEXT NULL;

-- AlterTable
ALTER TABLE `documentremoval` ADD COLUMN `confirmedAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedBy` VARCHAR(191) NULL,
    ADD COLUMN `rejectReason` TEXT NULL,
    ADD COLUMN `restoreRequestMessage` TEXT NULL,
    ADD COLUMN `restoreRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE `position` MODIFY `description` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `system_config` MODIFY `value` MEDIUMTEXT NULL;

-- AlterTable
ALTER TABLE `systemdocument` MODIFY `content` TEXT NULL;

-- AlterTable
ALTER TABLE `usernotification` ADD COLUMN `defaultsSeeded` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `workspacemember` ADD COLUMN `monthlyTokenLimit` BIGINT NULL,
    ADD COLUMN `monthlyTokenUsed` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `quotaResetAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `userfeedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'suggestion',
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `contact` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserFeedback_userId_idx`(`userId`),
    INDEX `UserFeedback_status_idx`(`status`),
    INDEX `UserFeedback_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhooksubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `secret` VARCHAR(191) NOT NULL,
    `events` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `successRate` VARCHAR(191) NOT NULL DEFAULT '100%',
    `lastTriggered` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Webhook_userId_idx`(`userId`),
    INDEX `Webhook_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tokenpack` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `points` BIGINT NOT NULL,
    `price` DOUBLE NOT NULL,
    `icon` VARCHAR(191) NULL DEFAULT '⚡',
    `color` VARCHAR(191) NULL DEFAULT '#3182ce',
    `description` VARCHAR(191) NULL,
    `isPopular` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TokenPack_isActive_idx`(`isActive`),
    INDEX `TokenPack_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ComponentCategory_isActive_idx` ON `component_category`(`isActive`);

-- CreateIndex
CREATE INDEX `DocumentRemoval_workspaceId_status_idx` ON `documentremoval`(`workspaceId`, `status`);

-- CreateIndex
CREATE INDEX `DocumentRemoval_workspaceId_confirmedAt_idx` ON `documentremoval`(`workspaceId`, `confirmedAt`);

-- AddForeignKey
ALTER TABLE `userfeedback` ADD CONSTRAINT `UserFeedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `position` RENAME INDEX `Position_code_key` TO `position_code_key`;
