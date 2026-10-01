-- CreateTable
CREATE TABLE `component_contract` (
    `id` VARCHAR(191) NOT NULL,
    `component_id` VARCHAR(191) NOT NULL,
    `contract_version` VARCHAR(191) NOT NULL,
    `lifecycle` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `description` TEXT NULL,
    `contract` JSON NOT NULL,
    `published_at` DATETIME(3) NULL,
    `published_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ComponentContract_componentId_lifecycle_idx`(`component_id`, `lifecycle`),
    UNIQUE INDEX `ComponentContract_componentId_contractVersion_key`(`component_id`, `contract_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `component_contract` ADD CONSTRAINT `ComponentContract_componentId_fkey` FOREIGN KEY (`component_id`) REFERENCES `component_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
