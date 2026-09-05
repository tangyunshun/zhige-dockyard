-- CreateTable
CREATE TABLE `platformstandardpost` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#3182ce',
    `icon` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isWorkspaceDefault` BOOLEAN NOT NULL DEFAULT false,
    `isSystemReserved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformStandardPost_name_key`(`name`),
    INDEX `PlatformStandardPost_code_idx`(`code`),
    INDEX `PlatformStandardPost_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postalias` (
    `id` VARCHAR(191) NOT NULL,
    `postName` VARCHAR(191) NOT NULL,
    `alias` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PostAlias_postName_alias_key`(`postName`, `alias`),
    INDEX `PostAlias_postName_idx`(`postName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postcodealias` (
    `id` VARCHAR(191) NOT NULL,
    `postCode` VARCHAR(191) NOT NULL,
    `roleCode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PostCodeAlias_postCode_roleCode_key`(`postCode`, `roleCode`),
    INDEX `PostCodeAlias_postCode_idx`(`postCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
