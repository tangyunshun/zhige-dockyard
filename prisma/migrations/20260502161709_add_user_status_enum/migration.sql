/*
  Warnings:

  - You are about to alter the column `status` on the `user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(0))`.

*/
-- AlterTable
ALTER TABLE `membershiplevel` ADD COLUMN `isPopular` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isRecommended` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `last_forced_logout_at` DATETIME(3) NULL,
    ADD COLUMN `last_login_at` DATETIME(3) NULL,
    ADD COLUMN `session_expires_at` DATETIME(3) NULL,
    ADD COLUMN `session_token` VARCHAR(191) NULL,
    MODIFY `status` ENUM('active', 'inactive', 'banned') NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE `workspace` ADD COLUMN `lastActiveAt` DATETIME(3) NULL,
    MODIFY `logo` LONGTEXT NULL;

-- CreateIndex
CREATE INDEX `Workspace_lastActiveAt_idx` ON `Workspace`(`lastActiveAt`);
