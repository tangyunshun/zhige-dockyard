-- 模型部署增加连通性健康状态与最近测试时间（与模型供应商同口径）
ALTER TABLE `modeldeployment` ADD COLUMN `health` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    ADD COLUMN `lastTestedAt` DATETIME(3) NULL;
