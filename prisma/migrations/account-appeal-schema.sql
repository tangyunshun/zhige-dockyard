-- 账号申诉表
CREATE TABLE IF NOT EXISTS `AccountAppeal` (
  `id` VARCHAR(36) PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `userAccount` VARCHAR(100) NOT NULL COMMENT '用户账号（手机/邮箱/用户名）',
  `userName` VARCHAR(50) COMMENT '用户姓名',
  `userPhone` VARCHAR(20) COMMENT '用户手机',
  `userEmail` VARCHAR(100) COMMENT '用户邮箱',
  `banReason` TEXT COMMENT '封禁原因',
  `appealReason` TEXT NOT NULL COMMENT '申诉原因',
  `appealEvidence` TEXT COMMENT '申诉证据（截图 URL 等）',
  `contactInfo` VARCHAR(200) COMMENT '联系方式',
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '申诉状态',
  `adminId` VARCHAR(36) COMMENT '处理管理员 ID',
  `adminName` VARCHAR(50) COMMENT '处理管理员姓名',
  `adminComment` TEXT COMMENT '管理员备注',
  `processedAt` DATETIME COMMENT '处理时间',
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  
  INDEX `idx_userId` (`userId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_createdAt` (`createdAt`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账号申诉表';

-- 插入测试数据
INSERT INTO `AccountAppeal` (id, userId, userAccount, userName, appealReason, status, createdAt, updatedAt)
VALUES (
  'appeal-test-001',
  'user-test-001',
  '13800138000',
  '测试用户',
  '我的账号被误封禁，请求解封。我一直是正常使用，没有违反任何规定。',
  'pending',
  NOW(),
  NOW()
);
