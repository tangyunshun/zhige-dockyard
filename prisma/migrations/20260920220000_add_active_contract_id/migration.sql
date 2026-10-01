-- AlterTable
ALTER TABLE `component_catalog` ADD COLUMN `active_contract_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ComponentCatalog_activeContractId_idx` ON `component_catalog`(`active_contract_id`);

-- AddForeignKey
ALTER TABLE `component_catalog` ADD CONSTRAINT `ComponentCatalog_activeContractId_fkey` FOREIGN KEY (`active_contract_id`) REFERENCES `component_contract`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
