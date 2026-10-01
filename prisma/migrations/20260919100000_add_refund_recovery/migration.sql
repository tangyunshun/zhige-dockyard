-- 模型失败退款恢复记录：待退款/重试状态持久化（不记录原始材料 / Prompt / API Key）
CREATE TABLE `refundrecovery` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `consumeIdempotencyKey` VARCHAR(191) NOT NULL,
  `consumeLedgerIds` JSON NOT NULL,
  `details` JSON NOT NULL,
  `points` BIGINT NOT NULL DEFAULT 0,
  `monthlyUsedRollback` BIGINT NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `RefundRecovery_taskId_key_key`(`taskId`, `consumeIdempotencyKey`),
  INDEX `RefundRecovery_status_idx`(`status`),
  INDEX `RefundRecovery_userId_idx`(`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
