-- 租约 fencing token：每次认领生成，用于阻止旧 Worker 覆盖新 Worker 的状态
-- AlterTable
ALTER TABLE `refundrecovery`
  ADD COLUMN `claimToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `RefundRecovery_claimToken_key` ON `refundrecovery`(`claimToken`);
