-- AlterTable
-- 补齐遗留差异：schema 中 systemdocument.visibility 已存在但从未迁入库
ALTER TABLE `systemdocument` ADD COLUMN `visibility` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC';

-- CreateTable 资料移除单：管理员移除资料的原因与执行记录，支持恢复
CREATE TABLE `documentremoval` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `titleSnapshot` VARCHAR(191) NOT NULL,
    `uploaderId` VARCHAR(191) NULL,
    `removedBy` VARCHAR(191) NOT NULL,
    `reasonCode` VARCHAR(191) NOT NULL,
    `reasonDetail` TEXT NULL,
    `notifiedCount` INTEGER NOT NULL DEFAULT 0,
    `removedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `restoredAt` DATETIME(3) NULL,
    `restoredBy` VARCHAR(191) NULL,

    INDEX `DocumentRemoval_workspaceId_removedAt_idx`(`workspaceId`, `removedAt`),
    INDEX `DocumentRemoval_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable 资料级操作权限
CREATE TABLE `assetpermission` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `roleScope` VARCHAR(191) NULL,
    `positionCode` VARCHAR(191) NULL,
    `canView` BOOLEAN NOT NULL DEFAULT true,
    `canUpload` BOOLEAN NOT NULL DEFAULT false,
    `canEdit` BOOLEAN NOT NULL DEFAULT false,
    `canDelete` BOOLEAN NOT NULL DEFAULT false,
    `canShare` BOOLEAN NOT NULL DEFAULT false,
    `canComment` BOOLEAN NOT NULL DEFAULT true,
    `canManageVersion` BOOLEAN NOT NULL DEFAULT false,
    `grantedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetPermission_workspaceId_idx`(`workspaceId`),
    INDEX `AssetPermission_workspaceId_userId_idx`(`workspaceId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable 资料版本快照
CREATE TABLE `documentversion` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `versionNo` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `changeNote` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentVersion_documentId_createdAt_idx`(`documentId`, `createdAt`),
    UNIQUE INDEX `DocumentVersion_documentId_versionNo_key`(`documentId`, `versionNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable 资料评论
CREATE TABLE `documentcomment` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentComment_documentId_createdAt_idx`(`documentId`, `createdAt`),
    INDEX `DocumentComment_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable 资料分享链接
CREATE TABLE `documentshare` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `permission` VARCHAR(191) NOT NULL DEFAULT 'view',
    `expiresAt` DATETIME(3) NULL,
    `accessCount` INTEGER NOT NULL DEFAULT 0,
    `revokedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `documentshare_token_key`(`token`),
    INDEX `DocumentShare_documentId_idx`(`documentId`),
    INDEX `DocumentShare_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
