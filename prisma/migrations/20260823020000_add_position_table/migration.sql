-- 岗位表：预置岗位 + 自定义岗位统一定义
CREATE TABLE `position` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `badge` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,
    `colorCls` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `isPreset` BOOLEAN NOT NULL DEFAULT true,
    `editable` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `defaultAllowedComponentIds` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Position_code_key` (`code`),
    INDEX `Position_status_idx` (`status`),
    INDEX `Position_sortOrder_idx` (`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
