-- 个人签名/团队寄语：此前前端提交 bio 但后端不落库（保存成功却静默丢失），补齐字段
ALTER TABLE `user` ADD COLUMN `bio` TEXT NULL;
