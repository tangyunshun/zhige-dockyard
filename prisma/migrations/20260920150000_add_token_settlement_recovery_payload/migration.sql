-- AlterTable
ALTER TABLE `tokensettlementrecovery`
    ADD COLUMN `usage` JSON NULL,
    ADD COLUMN `pricingSnapshot` JSON NULL,
    ADD COLUMN `settlementVersion` INTEGER NULL;
