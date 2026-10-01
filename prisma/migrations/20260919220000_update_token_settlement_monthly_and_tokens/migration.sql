-- AlterTable
ALTER TABLE `tokensettlementhold` ADD COLUMN `monthlyTokenUsedIncremented` BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `tokensettlement` ADD COLUMN `monthlyTokenUsedIncremented` BIGINT NOT NULL DEFAULT 0,
    MODIFY `inputTokens` BIGINT NOT NULL DEFAULT 0,
    MODIFY `outputTokens` BIGINT NOT NULL DEFAULT 0,
    MODIFY `cacheReadTokens` BIGINT NOT NULL DEFAULT 0,
    MODIFY `cacheWriteTokens` BIGINT NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE `tokensettlement` ADD CONSTRAINT `TokenSettlement_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tokensettlementhold`(`taskId`) ON DELETE CASCADE ON UPDATE CASCADE;
