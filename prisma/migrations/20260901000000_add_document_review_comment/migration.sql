-- AlterTable: 为 document 新增独立的审核意见字段，杜绝审核意见写入正文 content
ALTER TABLE `document` ADD COLUMN `review_comment` TEXT NULL;

-- 数据回填：历史审核意见曾被塞进 content 的 JSON 包装中，迁移到独立字段
UPDATE `document`
SET `review_comment` = JSON_UNQUOTE(JSON_EXTRACT(CAST(`content` AS JSON), '$.reviewComment'))
WHERE `review_comment` IS NULL
  AND `content` IS NOT NULL
  AND JSON_VALID(`content`) = 1
  AND JSON_EXTRACT(CAST(`content` AS JSON), '$.reviewComment') IS NOT NULL;

-- 正文修复：曾把整篇正文包装成 {"reviewComment":"...","text":"原文"} 的资料，还原为原始正文
UPDATE `document`
SET `content` = JSON_UNQUOTE(JSON_EXTRACT(CAST(`content` AS JSON), '$.text'))
WHERE `content` IS NOT NULL
  AND JSON_VALID(`content`) = 1
  AND JSON_EXTRACT(CAST(`content` AS JSON), '$.reviewComment') IS NOT NULL
  AND JSON_EXTRACT(CAST(`content` AS JSON), '$.text') IS NOT NULL;

-- 正文修复：原本就是 JSON 格式资料、仅被注入 reviewComment 键的，移除该注入键还原正文
UPDATE `document`
SET `content` = JSON_REMOVE(CAST(`content` AS JSON), '$.reviewComment')
WHERE `content` IS NOT NULL
  AND JSON_VALID(`content`) = 1
  AND JSON_EXTRACT(CAST(`content` AS JSON), '$.reviewComment') IS NOT NULL;
