-- 会话策略标记：登录时勾选「7天内免登录」为 true。
-- 该会话豁免 10 分钟空闲超时（A-01），仅受 7 天绝对超时（A-02）约束；
-- 未勾选记住我的会话保持既有「空闲 10 分钟 + 动态绝对超时」双约束。
ALTER TABLE `user` ADD COLUMN `session_remember_me` BOOLEAN NOT NULL DEFAULT false;
