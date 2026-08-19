-- AlterTable
ALTER TABLE `user` ADD COLUMN `allow_multi_device` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `banned_until` DATETIME(3) NULL,
    ADD COLUMN `deletion_requested_at` DATETIME(3) NULL,
    ADD COLUMN `device_limit` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `last_activity_at` DATETIME(3) NULL,
    ADD COLUMN `last_login_device` VARCHAR(191) NULL,
    ADD COLUMN `last_login_ip` VARCHAR(191) NULL,
    ADD COLUMN `last_login_region` VARCHAR(191) NULL,
    ADD COLUMN `password_changed_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `password_expire_date` DATETIME(3) NULL,
    ADD COLUMN `refresh_token_prev` VARCHAR(191) NULL,
    ADD COLUMN `sso_openid` VARCHAR(191) NULL,
    ADD COLUMN `sso_provider` VARCHAR(191) NULL,
    MODIFY `status` ENUM('active', 'inactive', 'banned', 'deleted', 'deleting') NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE `userdevice` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceName` VARCHAR(191) NOT NULL,
    `deviceType` VARCHAR(191) NOT NULL DEFAULT 'web',
    `browser` VARCHAR(191) NULL,
    `os` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `lastActiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_access_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,

    INDEX `UserDevice_userId_idx`(`userId`),
    INDEX `UserDevice_lastActiveAt_idx`(`lastActiveAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspacekickhistory` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `workspaceName` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kickedBy` VARCHAR(191) NOT NULL,
    `kickedByName` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkspaceKickHistory_workspaceId_idx`(`workspaceId`),
    INDEX `WorkspaceKickHistory_userId_idx`(`userId`),
    INDEX `WorkspaceKickHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountAppeal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userAccount` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NULL,
    `userPhone` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `banReason` TEXT NULL,
    `appealReason` TEXT NOT NULL,
    `appealEvidence` TEXT NULL,
    `contactInfo` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `adminId` VARCHAR(191) NULL,
    `adminName` VARCHAR(191) NULL,
    `adminComment` TEXT NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `idx_userId`(`userId`),
    INDEX `idx_status`(`status`),
    INDEX `idx_createdAt`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `session_token` VARCHAR(191) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `absolute_expire_at` DATETIME(3) NOT NULL,
    `idle_expire_at` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_session_session_token_key`(`session_token`),
    INDEX `UserSession_userId_idx`(`userId`),
    INDEX `UserSession_sessionToken_idx`(`session_token`),
    INDEX `UserSession_absoluteExpireAt_idx`(`absolute_expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gateway_blacklist` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `expire_at` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GatewayBlacklist_type_target_idx`(`type`, `target`),
    INDEX `GatewayBlacklist_expireAt_idx`(`expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stepup_token` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `expire_at` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StepUpToken_userId_operation_idx`(`userId`, `operation`),
    INDEX `StepUpToken_expireAt_idx`(`expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_config` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_deletionRequestedAt_idx` ON `user`(`deletion_requested_at`);

-- AddForeignKey
ALTER TABLE `userdevice` ADD CONSTRAINT `UserDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspacekickhistory` ADD CONSTRAINT `WorkspaceKickHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountAppeal` ADD CONSTRAINT `AccountAppeal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_session` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stepup_token` ADD CONSTRAINT `StepUpToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
