-- 修复价格孤儿 + 补齐 Phase 1 注册表缺失的主键（原手写迁移遗漏 PRIMARY KEY）
--
-- 背景：20260919130000 / 20260919140000 手写迁移只声明了唯一索引，未声明 PRIMARY KEY，
-- 导致 `id` 既无唯一约束也无索引：
--   1) 数据完整性缺陷：同一 id 可重复插入；
--   2) 无法为 modelpricing.deploymentId 建立外键（被引用列 modeldeployment.id 缺索引）。
--
-- 本迁移按顺序处理：
--   1) 清理历史孤儿价格行；
--   2) 防御性去重（保留每个 id 最早创建的一行）；
--   3) 补齐 PRIMARY KEY(id)；
--   4) 建立外键并启用 ON DELETE CASCADE（删除部署即级联删除价格）。

-- 1) 清理孤儿价格
DELETE FROM `modelpricing`
WHERE `deploymentId` NOT IN (SELECT `id` FROM `modeldeployment`);

-- 2) 防御性去重（仅对存在重复 id 的表执行；无重复时为无操作）
DELETE t FROM `modelprovider` t
  JOIN (SELECT `id`, MIN(`createdAt`) AS keep FROM `modelprovider` GROUP BY `id` HAVING COUNT(*) > 1) d
    ON t.`id` = d.`id` AND t.`createdAt` > d.keep;

DELETE t FROM `modeldeployment` t
  JOIN (SELECT `id`, MIN(`createdAt`) AS keep FROM `modeldeployment` GROUP BY `id` HAVING COUNT(*) > 1) d
    ON t.`id` = d.`id` AND t.`createdAt` > d.keep;

DELETE t FROM `modelpricing` t
  JOIN (SELECT `id`, MIN(`createdAt`) AS keep FROM `modelpricing` GROUP BY `id` HAVING COUNT(*) > 1) d
    ON t.`id` = d.`id` AND t.`createdAt` > d.keep;

DELETE t FROM `workspace_model_policy` t
  JOIN (SELECT `id`, MIN(`createdAt`) AS keep FROM `workspace_model_policy` GROUP BY `id` HAVING COUNT(*) > 1) d
    ON t.`id` = d.`id` AND t.`createdAt` > d.keep;

DELETE t FROM `modelcostobservation` t
  JOIN (SELECT `id`, MIN(`createdAt`) AS keep FROM `modelcostobservation` GROUP BY `id` HAVING COUNT(*) > 1) d
    ON t.`id` = d.`id` AND t.`createdAt` > d.keep;

-- 3) 补齐主键（与 schema.prisma 的 @id 对齐，恢复唯一约束与索引）
ALTER TABLE `modelprovider` ADD PRIMARY KEY (`id`);
ALTER TABLE `modeldeployment` ADD PRIMARY KEY (`id`);
ALTER TABLE `modelpricing` ADD PRIMARY KEY (`id`);
ALTER TABLE `workspace_model_policy` ADD PRIMARY KEY (`id`);
ALTER TABLE `modelcostobservation` ADD PRIMARY KEY (`id`);

-- 4) 外键级联：删除模型部署时同事务级联删除对应价格，杜绝价格孤儿
ALTER TABLE `modelpricing`
  ADD CONSTRAINT `ModelPricing_deploymentId_fkey`
  FOREIGN KEY (`deploymentId`) REFERENCES `modeldeployment`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
