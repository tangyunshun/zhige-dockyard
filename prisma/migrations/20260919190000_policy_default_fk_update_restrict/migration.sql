-- 空间策略默认模型外键：ON UPDATE CASCADE -> RESTRICT。
-- 被引用列 modeldeployment.id 是主键（不可变），此处收紧为 RESTRICT 以与
-- 「注册表标识不可被静默改写」的整体约束保持一致（与 ModelDeployment_providerId_fkey 相同口径）。
ALTER TABLE `workspace_model_policy`
  DROP FOREIGN KEY `WorkspaceModelPolicy_defaultDeploymentId_fkey`;

ALTER TABLE `workspace_model_policy`
  ADD CONSTRAINT `WorkspaceModelPolicy_defaultDeploymentId_fkey`
  FOREIGN KEY (`defaultDeploymentId`) REFERENCES `modeldeployment`(`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
