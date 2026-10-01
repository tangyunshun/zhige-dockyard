-- 模型注册表关联完整性：把「应用层检查」升级为「数据库级外键」
--
-- 背景：此前 modeldeployment.providerId 与 workspace_model_policy.defaultDeploymentId
-- 仅有应用层校验，删改并发下仍可能产生悬挂引用。
-- 前置核验（scripts/verify-model-registry-integrity.ts）已确认：
--   两表均无重复 id；modeldeployment 无无法匹配供应商 name 的记录；策略无无效部署引用。
--
-- 语义说明：modeldeployment.providerId 的取值语义是「供应商平台标识」，
-- 即 modelprovider.name（name 为唯一键），而非 modelprovider.id。

-- 1) 部署 → 供应商（RESTRICT：仍有部署时禁止删除供应商，杜绝悬挂部署）
ALTER TABLE `modeldeployment`
  ADD CONSTRAINT `ModelDeployment_providerId_fkey`
  FOREIGN KEY (`providerId`) REFERENCES `modelprovider`(`name`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) 空间策略默认模型 → 部署（RESTRICT：被引用时禁止删除部署）
--    注意：allowedDeploymentIds 为 JSON 数组，无法建立外键，
--    其完整性由 model-registry-lock 命名锁 + 接口校验保证。
ALTER TABLE `workspace_model_policy`
  ADD CONSTRAINT `WorkspaceModelPolicy_defaultDeploymentId_fkey`
  FOREIGN KEY (`defaultDeploymentId`) REFERENCES `modeldeployment`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
