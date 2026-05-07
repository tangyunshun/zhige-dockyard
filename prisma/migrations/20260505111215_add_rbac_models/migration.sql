/*
  Warnings:

  - You are about to drop the column `category` on the `componenttask` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `ComponentTask_category_idx` ON `componenttask`;

-- AlterTable
ALTER TABLE `componenttask` DROP COLUMN `category`;

-- AlterTable
ALTER TABLE `workspace` ADD COLUMN `workspacequotaId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `systemdocument` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `tags` VARCHAR(191) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SystemDocument_authorId_fkey`(`authorId`),
    INDEX `SystemDocument_category_idx`(`category`),
    INDEX `SystemDocument_createdAt_idx`(`createdAt`),
    INDEX `SystemDocument_isPublished_idx`(`isPublished`),
    INDEX `SystemDocument_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspacequota` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `membershipLevelId` VARCHAR(191) NOT NULL,
    `enterpriseSlots` BIGINT NOT NULL DEFAULT 1,
    `usedSlots` BIGINT NOT NULL DEFAULT 0,
    `tokenBalance` BIGINT NOT NULL DEFAULT 0,
    `storageUsed` BIGINT NOT NULL DEFAULT 0,
    `storageLimit` BIGINT NOT NULL DEFAULT 1073741824,
    `apiCallsUsed` BIGINT NOT NULL DEFAULT 0,
    `apiCallsLimit` BIGINT NOT NULL DEFAULT 1000,
    `resetAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspacequota_workspaceId_key`(`workspaceId`),
    INDEX `WorkspaceQuota_workspaceId_idx`(`workspaceId`),
    INDEX `WorkspaceQuota_membershipLevelId_idx`(`membershipLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspacepost` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#64748b',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WorkspacePost_workspaceId_idx`(`workspaceId`),
    UNIQUE INDEX `WorkspacePost_workspaceId_name_key`(`workspaceId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postmember` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostMember_postId_idx`(`postId`),
    INDEX `PostMember_workspaceId_idx`(`workspaceId`),
    UNIQUE INDEX `PostMember_userId_postId_key`(`userId`, `postId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `componentpermission` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `componentId` VARCHAR(191) NOT NULL,
    `canView` BOOLEAN NOT NULL DEFAULT true,
    `canEdit` BOOLEAN NOT NULL DEFAULT false,
    `canDelete` BOOLEAN NOT NULL DEFAULT false,
    `canExecute` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ComponentPermission_postId_idx`(`postId`),
    INDEX `ComponentPermission_componentId_idx`(`componentId`),
    UNIQUE INDEX `ComponentPermission_postId_componentId_key`(`postId`, `componentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projectrole` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `permissions` JSON NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectRole_projectId_idx`(`projectId`),
    INDEX `ProjectRole_userId_idx`(`userId`),
    UNIQUE INDEX `ProjectRole_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `systemdocument` ADD CONSTRAINT `SystemDocument_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace` ADD CONSTRAINT `workspace_workspacequotaId_fkey` FOREIGN KEY (`workspacequotaId`) REFERENCES `workspacequota`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspacequota` ADD CONSTRAINT `WorkspaceQuota_membershipLevelId_fkey` FOREIGN KEY (`membershipLevelId`) REFERENCES `membershiplevel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspacepost` ADD CONSTRAINT `WorkspacePost_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postmember` ADD CONSTRAINT `PostMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postmember` ADD CONSTRAINT `PostMember_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `workspacepost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `componentpermission` ADD CONSTRAINT `ComponentPermission_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `workspacepost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
