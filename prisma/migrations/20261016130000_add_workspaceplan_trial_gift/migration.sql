-- 空间套餐表新增「新空间一次性体验额度赠送」字段（企业套餐差异化）
--
-- 设计原则：trialGift 复用 workspaceplan 表自身，不新建平行表。
--   - 列为 JSON，存储 { enabled, points, expireDays }；
--   - 允许为空（NULL），为空时由代码常量 WORKSPACE_PLANS 兜底；
--   - 写入后优先于常量，使管理员可在后台直接调赠送额度，无需发版。

ALTER TABLE `workspaceplan` ADD COLUMN `trialGift` JSON NULL;
