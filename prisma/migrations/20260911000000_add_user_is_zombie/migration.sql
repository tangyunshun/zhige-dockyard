-- 僵尸用户标记：供每日定时扫描（src/lib/zombie-user.ts）写入，管理后台据此筛选与清理
-- AlterTable
ALTER TABLE `user` ADD COLUMN `is_zombie` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
ALTER TABLE `user` ADD INDEX `User_isZombie_idx`(`is_zombie`);
