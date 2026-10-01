-- 价格唯一真源收口：删除 modeldeployment 上的旧「分/1K」价格字段
-- 说明：运行时、价格快照、成本计算均已改为只读取 modelpricing；此处为正式增量迁移（非 reset）。
ALTER TABLE `modeldeployment`
  DROP COLUMN `inputPricePer1KCents`,
  DROP COLUMN `outputPricePer1KCents`;
