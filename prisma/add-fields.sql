-- 添加 isRecommended 和 isPopular 字段到 MembershipLevel 表
ALTER TABLE MembershipLevel 
ADD COLUMN isRecommended BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN isPopular BOOLEAN DEFAULT FALSE NOT NULL;

-- 更新白银会员为推荐
UPDATE MembershipLevel SET isRecommended = TRUE WHERE name = 'SILVER';

-- 更新黄金会员为热门
UPDATE MembershipLevel SET isPopular = TRUE WHERE name = 'GOLD';

-- 验证更新
SELECT name, nameZh, isRecommended, isPopular FROM MembershipLevel ORDER BY sortOrder;
