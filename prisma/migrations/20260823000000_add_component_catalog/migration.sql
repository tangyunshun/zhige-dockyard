-- 组件目录表：系统全部组件的唯一数据源
CREATE TABLE `component_catalog` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NOT NULL,
    `tags` JSON NOT NULL,
    `isPremium` BOOLEAN NOT NULL DEFAULT false,
    `estimatedTokens` INTEGER NOT NULL DEFAULT 0,
    `previewData` JSON NOT NULL,
    `businessTags` JSON NULL,
    `inputMode` VARCHAR(191) NOT NULL DEFAULT 'text',
    `accept` VARCHAR(191) NULL,
    `hint` VARCHAR(191) NULL,
    `detail` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ComponentCatalog_category_idx` ON `component_catalog`(`category`);
CREATE INDEX `ComponentCatalog_isPublished_idx` ON `component_catalog`(`isPublished`);
CREATE INDEX `ComponentCatalog_sortOrder_idx` ON `component_catalog`(`sortOrder`);

-- 组件分类表：阶段分类的显示名/主题色/组件范围
CREATE TABLE `component_category` (
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `range` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
