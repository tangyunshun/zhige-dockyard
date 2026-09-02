-- CreateTable 空间级套餐配置表：供空间创建初始化与空间套餐升级使用，后台可配置
CREATE TABLE `workspaceplan` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `priceMonthly` INTEGER NOT NULL DEFAULT 0,
    `priceYearly` INTEGER NOT NULL DEFAULT 0,
    `maxComponents` INTEGER NOT NULL DEFAULT 0,
    `maxMembers` INTEGER NOT NULL DEFAULT 0,
    `maxStorage` INTEGER NOT NULL DEFAULT 0,
    `maxApiCalls` INTEGER NOT NULL DEFAULT 0,
    `tokenLimit` INTEGER NOT NULL DEFAULT 0,
    `features` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `purchasable` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspaceplan_key_key`(`key`),
    INDEX `WorkspacePlan_sortOrder_idx`(`sortOrder`),
    INDEX `WorkspacePlan_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed 默认空间套餐（与 constants/workspace-plans.ts 保持一致）
INSERT INTO `workspaceplan` (`id`, `key`, `name`, `description`, `priceMonthly`, `priceYearly`, `maxComponents`, `maxMembers`, `maxStorage`, `maxApiCalls`, `tokenLimit`, `features`, `sortOrder`, `purchasable`, `isActive`, `createdAt`, `updatedAt`)
VALUES
('cm1workspaceplan000001', 'STANDARD', '标准版', '适合初创小团队的基础协作空间', 0, 0, 100, 10, 1024, 1000, 20000, JSON_ARRAY('10 个团队协同席位', '100 个组件装配额度', '1 GB 云端存储', '每月 1,000 次调用额度', '基础组件与标准技术支持'), 1, true, true, NOW(), NOW()),
('cm1workspaceplan000002', 'PRO', '专业版', '适合成长型团队，解锁全量组件与更高并发', 19900, 199000, 500, 50, 10240, 10000, 100000, JSON_ARRAY('50 个团队协同席位', '500 个组件装配额度', '10 GB 云端存储', '每月 10,000 次调用额度', '全量组件、优先支持与数据分析'), 2, true, true, NOW(), NOW()),
('cm1workspaceplan000003', 'ENTERPRISE', '旗舰版', '面向大型组织，席位与组件无限制并含 SLA 保障', 69900, 699000, -1, -1, 102400, 100000, 500000, JSON_ARRAY('团队席位无限制', '组件装配额度无限制', '100 GB 云端存储', '每月 100,000 次调用额度', '专属支持、高级分析与 SLA 保障'), 3, true, true, NOW(), NOW()),
('cm1workspaceplan000004', 'CUSTOM', '定制版', '按合同约定的线下定制方案', 0, 0, -1, -1, -1, -1, 1000000, JSON_ARRAY('全部能力按合同约定开放'), 4, false, true, NOW(), NOW());
