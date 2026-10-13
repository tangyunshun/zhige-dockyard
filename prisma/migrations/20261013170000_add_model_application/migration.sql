-- 模型使用申请 + 成员级获批默认模型
-- 仅普通成员(MEMBER)可发起对白名单内非空间默认系统模型的「申请使用」，由空间所有者审批；
-- 审批通过后按 (userId, workspaceId) 落地到 workspace_member_model_preference，仅改变该成员默认模型。

-- CreateTable
CREATE TABLE `modelapplication` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `applicantId` VARCHAR(191) NOT NULL,
    `applicantName` VARCHAR(191) NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `modelLabel` VARCHAR(191) NULL,
    `providerName` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewerId` VARCHAR(191) NULL,
    `reviewerName` VARCHAR(191) NULL,
    `rejectReason` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ModelApplication_workspaceId_idx`(`workspaceId`),
    INDEX `ModelApplication_applicantId_idx`(`applicantId`),
    INDEX `ModelApplication_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_member_model_preference` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `isAuto` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WSMemberModelPref_workspaceId_idx`(`workspaceId`),
    INDEX `WSMemberModelPref_userId_idx`(`userId`),
    UNIQUE INDEX `WSMemberModelPref_workspace_user_key`(`workspaceId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
