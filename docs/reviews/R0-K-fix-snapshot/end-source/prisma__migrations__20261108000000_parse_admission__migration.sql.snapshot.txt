-- [R0-K / 原 F14 K03] 解析专用共享准入表（离线迁移，授权前不执行）
-- 仅新增两张解析专用表，不修改任何既有存储、账务、退款或模型注册表。
-- 回滚：DROP TABLE `parselease`; DROP TABLE `parseadmissioncounter`;
-- 迁移未执行前，解析准入诚实返回 PARSE_ADMISSION_NOT_READY (503)，不在业务请求中建表/生成客户端。

CREATE TABLE `parseadmissioncounter` (
  `id` VARCHAR(191) NOT NULL,
  `active` INT NOT NULL DEFAULT 0,
  `workUnits` INT NOT NULL DEFAULT 0,
  `requests` INT NOT NULL DEFAULT 0,
  `windowStart` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `parselease` (
  `id` VARCHAR(191) NOT NULL,
  `leaseId` VARCHAR(191) NOT NULL,
  `claimToken` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `instanceId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `workUnits` INT NOT NULL DEFAULT 0,
  `leaseUntil` DATETIME(3) NOT NULL,
  `releasedAt` DATETIME(3) NULL,
  `note` VARCHAR(240) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `parselease_leaseId_key` (`leaseId`),
  UNIQUE INDEX `parselease_claimToken_key` (`claimToken`),
  INDEX `parselease_userId_status_idx` (`userId`, `status`),
  INDEX `parselease_status_leaseUntil_idx` (`status`, `leaseUntil`),
  INDEX `parselease_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
