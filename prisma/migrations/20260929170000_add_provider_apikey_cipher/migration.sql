-- 模型供应商支持后台直接录入加密 API Key（避免必须改服务端环境变量）
-- apiKeyCipher 为空时仍回退到 apiKeyEnv 对应的环境变量（兼容旧配置）。

ALTER TABLE `modelprovider`
  ADD COLUMN `apiKeyCipher` TEXT NULL;
