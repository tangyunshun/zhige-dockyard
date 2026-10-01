-- 回填存量「记住我」会话：迁移前勾选 7 天免登录的用户仅体现为超长 session_expires_at（>24h），
-- 批量置位 session_remember_me，使显式标记方案对存量会话同样生效，避免修复只覆盖新登录。
UPDATE `user`
SET `session_remember_me` = true
WHERE `session_token` IS NOT NULL
  AND `session_expires_at` IS NOT NULL
  AND `session_expires_at` > NOW() + INTERVAL 24 HOUR;
