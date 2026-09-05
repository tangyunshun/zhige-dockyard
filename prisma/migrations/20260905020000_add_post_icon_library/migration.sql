-- CreateTable
CREATE TABLE `posticonlibrary` (
    `id` VARCHAR(191) NOT NULL,
    `iconKey` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PostIconLibrary_iconKey_key`(`iconKey`),
    INDEX `PostIconLibrary_category_idx`(`category`),
    INDEX `PostIconLibrary_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- RenameIndex（platformstandardpost.name 唯一索引与 schema 默认命名对齐）
ALTER TABLE `platformstandardpost` RENAME INDEX `PlatformStandardPost_name_key` TO `platformstandardpost_name_key`;
