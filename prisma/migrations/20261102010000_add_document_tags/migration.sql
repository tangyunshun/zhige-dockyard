-- KB-2：知识条目标签系统
-- 为 document 表增加 tags 字段（JSON 数组，存储字符串标签，最多 5 个，每个 1~20 字）
ALTER TABLE document ADD COLUMN tags JSON NULL;
