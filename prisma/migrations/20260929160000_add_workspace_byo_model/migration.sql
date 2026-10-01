-- 新增空间自带模型（BYO）表
-- 一个空间至多一条 BYO 配置（workspaceId 唯一）；API Key 以 AES-256-GCM 密文落库。

CREATE TABLE `workspace_byo_model` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `protocol` VARCHAR(191) NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  `baseUrl` VARCHAR(191) NOT NULL,
  `apiKeyCipher` TEXT NOT NULL,
  `capabilities` JSON NOT NULL DEFAULT ('[]'),
  `contextLimit` INTEGER NOT NULL DEFAULT 32000,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `priceInputMicrosPerMillion` INTEGER NULL,
  `priceOutputMicrosPerMillion` INTEGER NULL,
  `priceStatus` VARCHAR(191) NOT NULL DEFAULT 'UNCONFIGURED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WorkspaceByoModel_workspaceId_key` (`workspaceId`),
  INDEX `WorkspaceByoModel_workspaceId_idx` (`workspaceId`)
) /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;
