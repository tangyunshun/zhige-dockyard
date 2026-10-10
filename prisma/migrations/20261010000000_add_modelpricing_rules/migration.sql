-- 为 modelpricing 增加通用规则容器 rules（JSON，可空）
-- 承载「任何模型任何规则」的非标定价信息：多币种参考价、订阅套餐积分抵扣系数、缓存存储计费标记等。
-- 成本/售价主口径仍以微元字段为准；rules 仅作扩展元数据，不得替代主价格字段参与结算。

-- AlterTable
ALTER TABLE `modelpricing` ADD COLUMN `rules` JSON NULL;
