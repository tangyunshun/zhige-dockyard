-- 会员等级新增「算力加油包折扣」字段（百分比：10=9折，15=8.5折，20=8折）
-- 用于高等级会员购买算力加油包时展示并结算会员价（结算时后端按此字段权威计算）
ALTER TABLE `MembershipLevel` ADD COLUMN `tokenPackDiscount` INTEGER NOT NULL DEFAULT 0;
