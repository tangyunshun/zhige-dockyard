-- AddPopupOnLogin
ALTER TABLE `notification` ADD COLUMN `popupOnLogin` BOOLEAN NOT NULL DEFAULT false;

-- AddIndex
ALTER TABLE `notification` ADD INDEX `Notification_popupOnLogin_isRead_idx`(`popupOnLogin`, `isRead`);
