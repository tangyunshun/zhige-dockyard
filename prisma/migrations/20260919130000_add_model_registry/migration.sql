-- Phase 1 模型注册表：供应商 / 模型部署 / 空间模型策略
-- CreateTable: modelprovider
CREATE TABLE `modelprovider` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `protocol` VARCHAR(191) NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  `baseUrl` VARCHAR(191) NOT NULL,
  `apiKeyEnv` VARCHAR(191) NOT NULL DEFAULT 'MODEL_API_KEY',
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ModelProvider_name_key`(`name`),
  INDEX `ModelProvider_enabled_idx`(`enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: modeldeployment
CREATE TABLE `modeldeployment` (
  `id` VARCHAR(191) NOT NULL,
  `providerId` VARCHAR(191) NOT NULL,
  `modelId` VARCHAR(191) NOT NULL,
  `upstreamModel` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL DEFAULT '',
  `contextLimit` INTEGER NOT NULL DEFAULT 32000,
  `inputPricePer1KCents` INTEGER NOT NULL DEFAULT 0,
  `outputPricePer1KCents` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ModelDeployment_providerId_modelId_key`(`providerId`, `modelId`),
  INDEX `ModelDeployment_providerId_idx`(`providerId`),
  INDEX `ModelDeployment_enabled_idx`(`enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: workspace_model_policy
CREATE TABLE `workspace_model_policy` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `defaultDeploymentId` VARCHAR(191) NULL,
  `allowedDeploymentIds` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WorkspaceModelPolicy_workspaceId_key`(`workspaceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
