-- 模型价格体系：供应商成本与用户售价分离（微元 / 100 万 Token）
CREATE TABLE `modelpricing` (
  `id` VARCHAR(191) NOT NULL,
  `deploymentId` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
  `costInputMicrosPerMillion` INTEGER NULL,
  `costOutputMicrosPerMillion` INTEGER NULL,
  `costCacheReadMicrosPerMillion` INTEGER NULL,
  `costCacheWriteMicrosPerMillion` INTEGER NULL,
  `priceInputMicrosPerMillion` INTEGER NULL,
  `priceOutputMicrosPerMillion` INTEGER NULL,
  `priceCacheReadMicrosPerMillion` INTEGER NULL,
  `priceCacheWriteMicrosPerMillion` INTEGER NULL,
  `priceSource` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
  `priceStatus` VARCHAR(191) NOT NULL DEFAULT 'UNCONFIGURED',
  `markupRateBps` INTEGER NULL,
  `priceVersion` INTEGER NOT NULL DEFAULT 1,
  `effectiveFrom` DATETIME(3) NULL,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ModelPricing_deploymentId_key`(`deploymentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 模型成本观测数据（仅用于成本分析与运营报表）
CREATE TABLE `modelcostobservation` (
  `id` VARCHAR(191) NOT NULL,
  `providerId` VARCHAR(191) NOT NULL,
  `modelId` VARCHAR(191) NOT NULL,
  `metric` VARCHAR(191) NOT NULL DEFAULT 'OBSERVED_BLENDED_COST',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `totalTokens` INTEGER NOT NULL,
  `inputTokens` INTEGER NOT NULL,
  `outputTokens` INTEGER NOT NULL,
  `cacheTokens` INTEGER NOT NULL,
  `nonCacheTokens` INTEGER NOT NULL,
  `requestCount` INTEGER NOT NULL,
  `totalCostMicrosUsd` INTEGER NOT NULL,
  `effectiveCostPerMillionMicrosUsd` INTEGER NOT NULL,
  `nonCacheCostPerMillionMicrosUsd` INTEGER NOT NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ModelCostObservation_provider_model_idx`(`providerId`, `modelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
