-- AlterTable
ALTER TABLE `componenttask` ADD COLUMN `workspace_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ComponentTask_workspaceId_idx` ON `componenttask`(`workspace_id`);
