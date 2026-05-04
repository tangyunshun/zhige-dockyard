-- CreateTable
CREATE TABLE `SmsCode` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'reset-password',
    `used` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmsCode_phone_idx`(`phone`),
    INDEX `SmsCode_code_idx`(`code`),
    INDEX `SmsCode_type_idx`(`type`),
    INDEX `SmsCode_used_idx`(`used`),
    INDEX `SmsCode_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
