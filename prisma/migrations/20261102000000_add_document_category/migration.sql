-- 知识条目分类真实化（KN-2）：此前前端必填但后端丢弃、库中无字段可存
ALTER TABLE `document` ADD COLUMN `category` VARCHAR(191) NULL;
