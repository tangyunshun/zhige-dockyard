-- CreateTable
CREATE TABLE `apiUsage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'GET',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `responseCode` INTEGER NULL,
    `latencyMs` INTEGER NULL,

    INDEX `ApiUsage_userId_idx`(`userId`),
    INDEX `ApiUsage_timestamp_idx`(`timestamp`),
    INDEX `ApiUsage_endpoint_idx`(`endpoint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
