-- AlterTable
ALTER TABLE `componenttask` ADD COLUMN `category` VARCHAR(191) NULL,
    ADD COLUMN `icon` VARCHAR(191) NULL,
    ADD COLUMN `isPublished` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `tags` VARCHAR(191) NULL,
    ADD COLUMN `usageCount` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `ComponentTask_isPublished_idx` ON `componenttask`(`isPublished`);

-- CreateIndex
CREATE INDEX `ComponentTask_category_idx` ON `componenttask`(`category`);

-- CreateIndex
CREATE INDEX `ComponentTask_sortOrder_idx` ON `componenttask`(`sortOrder`);
