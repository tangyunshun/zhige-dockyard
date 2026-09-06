-- CreateTable
CREATE TABLE `notificationgroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'custom',
    `roleKey` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NotificationGroup_type_idx`(`type`),
    INDEX `NotificationGroup_roleKey_idx`(`roleKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificationgroupmember` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL DEFAULT 'include',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationGroupMember_groupId_idx`(`groupId`),
    INDEX `NotificationGroupMember_userId_idx`(`userId`),
    UNIQUE INDEX `NotificationGroupMember_groupId_userId_key`(`groupId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notificationgroupmember` ADD CONSTRAINT `NotificationGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `notificationgroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
