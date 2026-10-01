-- AlterTable
ALTER TABLE `refundrecovery`
  ADD COLUMN `processingStartedAt` DATETIME(3) NULL,
  ADD COLUMN `leaseUntil` DATETIME(3) NULL;
