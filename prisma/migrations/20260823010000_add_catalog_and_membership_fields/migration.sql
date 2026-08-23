-- 组件目录新增字段：默认装配标记 / 数据流动契约 / 智能搜索关键词
ALTER TABLE `component_catalog`
    ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `contract` VARCHAR(191) NULL,
    ADD COLUMN `keywords` JSON NULL;

-- 会员等级新增字段：Token 配额
ALTER TABLE `membershiplevel`
    ADD COLUMN `tokenLimit` BIGINT NOT NULL DEFAULT 10000;

-- 默认 5 套件组件标记（与旧 DEFAULT_ALLOWED_COMPONENT_IDS 一致）
UPDATE `component_catalog` SET `isDefault` = true WHERE `id` IN ('C01', 'C02', 'C07', 'C11', 'C12');
