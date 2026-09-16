-- 新增：首页「用户评价」表
-- 说明：本迁移**仅做新增**（CREATE TABLE），不改动、不删除任何既有表或数据。
-- 安全提示：对已有数据的库请始终使用 `prisma migrate deploy`（切勿使用 migrate dev / reset）。

CREATE TABLE `testimonial` (
    `id` VARCHAR(191) NOT NULL,
    `groupNo` INTEGER NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'personal',
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NULL,
    `org` VARCHAR(191) NULL,
    `avatar` VARCHAR(191) NULL,
    `rating` INTEGER NOT NULL DEFAULT 5,
    `content` TEXT NOT NULL,
    `tags` JSON NULL,
    `highlightLabel` VARCHAR(191) NULL,
    `highlightValue` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Testimonial_groupNo_idx`(`groupNo`),
    INDEX `Testimonial_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
