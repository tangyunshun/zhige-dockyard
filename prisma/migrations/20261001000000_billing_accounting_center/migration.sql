-- 批次 1：BILLING-1-ACCOUNTING-CENTER（算账中心与账务地基）
--
-- 1) modelpricing 增加「价格来源」列：
--    PLATFORM  平台模型注册表价（默认，既有数据全部归此类）
--    USER_BYOK 用户自带模型（方案 B：按登记的官方单价折算后收服务费）
--    核验状态沿用既有 priceStatus / VERIFIED 语义，本批次不改变任何既有价格数值。
ALTER TABLE `modelpricing` ADD COLUMN `priceOrigin` VARCHAR(191) NOT NULL DEFAULT 'PLATFORM';
