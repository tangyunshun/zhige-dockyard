-- 用户自助退款申请：用户对已扣费任务申请退还算力点，经管理员审批后执行退点。
-- 本表仅记录申请事实与审批结论；真实退点由账务层生成 REFUND 流水，refundLedgerId 为唯一可追溯凭证。

-- CreateTable
CREATE TABLE `refundrequest` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `componentId` VARCHAR(191) NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `adminId` VARCHAR(191) NULL,
    `adminRemark` TEXT NULL,
    `refundLedgerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `RefundRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `RefundRequest_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `RefundRequest_taskId_userId_key`(`taskId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
