-- 为模型部署增加数据库驱动的能力声明（规范化 JSON 字符串数组）
-- 取值必须来自抽象能力白名单（TEXT_GENERATION / STRUCTURED_OUTPUT / VISION / LONG_CONTEXT / FILE_ANALYSIS）；
-- 严禁写入具体厂商或模型名，且 contextLimit 不得作为能力替代表达。
ALTER TABLE `modeldeployment` ADD COLUMN `capabilities` JSON NOT NULL DEFAULT ('[]');
