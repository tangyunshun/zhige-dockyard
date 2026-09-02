-- 为 document 表新增 uploader_id 列，记录资料/知识库文档的真实上传者用户 ID。
-- 该字段可为空（历史存量文档无记录），新建文档时由后端写入当前登录用户的 userId。
-- 展示层（前端资料列表“上传人”）根据该 ID 从 user 表解析出真实昵称/邮箱，杜绝硬编码。
ALTER TABLE `document` ADD COLUMN `uploader_id` VARCHAR(191) NULL;
