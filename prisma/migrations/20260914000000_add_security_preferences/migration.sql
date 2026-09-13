-- 为用户偏好表补充安全相关开关字段：高危操作二次验证(2FA) 与 异地登录告警
ALTER TABLE `userpreference`
  ADD COLUMN `twoFactorEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `loginAlertEnabled` TINYINT(1) NOT NULL DEFAULT 1;
