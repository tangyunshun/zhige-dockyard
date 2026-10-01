-- 模型注册表「引用完整性」串行锁：单行锁表。
--
-- 背景：原先使用 MySQL 命名锁 GET_LOCK/RELEASE_LOCK，但 Prisma interactive transaction
-- 的回调 finally 会在 COMMIT 之前执行，导致锁在提交前就被释放，无法保证
-- workspace_model_policy.allowedDeploymentIds（JSON，无外键）的引用完整性。
--
-- 改用「行锁 + SELECT ... FOR UPDATE」：InnoDB 行锁由数据库持有至事务结束自动释放，
-- 保护边界必然覆盖到提交完成。
CREATE TABLE `registrylock` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 单例锁行（必须存在，否则 FOR UPDATE 会退化为间隙锁语义而失去串行保护）
INSERT INTO `registrylock` (`id`) VALUES ('MODEL_REGISTRY_REFS')
ON DUPLICATE KEY UPDATE `id` = `id`;
