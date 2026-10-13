-- 中央「我的模型库」：用户级 BYO 模型定义 + 多空间绑定关系。
--
-- 设计：user_byo_model_def 集中维护端点/密钥/能力/单价（一处维护）；
--      user_byo_model_assignment 把某个定义绑定到多个工作空间（多处引用）。
-- 空间实际生效的 BYO 行仍 materialize 到既有的 workspace_byo_model（按 workspaceId 唯一），
-- 由应用层在绑定/解绑/定义更新时同步，从而复用现有解析与展示逻辑，不改动执行核心。
--
-- 注：刻意不建外键（onDelete 由应用层级联处理），以避免影子库重放时外键约束失败。

CREATE TABLE `user_byo_model_def` (
  `id` VARCHAR(191) NOT NULL,
  `ownerUserId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `protocol` VARCHAR(191) NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  `baseUrl` VARCHAR(191) NOT NULL,
  `apiKeyCipher` VARCHAR(191) NOT NULL,
  `capabilities` JSON NOT NULL,
  `contextLimit` INTEGER NOT NULL DEFAULT 32000,
  `priceInputMicrosPerMillion` INTEGER NULL,
  `priceOutputMicrosPerMillion` INTEGER NULL,
  `priceStatus` VARCHAR(191) NOT NULL DEFAULT 'UNCONFIGURED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `UserByoModelDef_ownerUserId_idx` (`ownerUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_byo_model_assignment` (
  `id` VARCHAR(191) NOT NULL,
  `defId` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT 1,
  `shareWithMembers` BOOLEAN NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserByoAssignment_def_workspace_key` (`defId`, `workspaceId`),
  INDEX `UserByoAssignment_workspaceId_idx` (`workspaceId`),
  INDEX `UserByoAssignment_defId_idx` (`defId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
