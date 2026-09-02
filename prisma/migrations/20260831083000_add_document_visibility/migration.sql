-- 为 document 表新增 visibility 列，记录资料/文档的共享范围（PUBLIC 空间公开 / PRIVATE 个人私密）。
-- 历史存量文档默认补为 PUBLIC，与前端展示层此前的默认表现保持一致。
-- 新建文档时由后端写入用户上传时选择的 visibility 值。
ALTER TABLE `document` ADD COLUMN `visibility` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC';
