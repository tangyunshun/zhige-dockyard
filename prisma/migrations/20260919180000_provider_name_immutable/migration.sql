-- 供应商名称不可变（平台稳定标识）：
-- modelprovider.name 被 modeldeployment.providerId 与
-- componentcatalog.detail.executionProfile.model.defaultProviderId（JSON，无法建外键）共同引用。
-- ON UPDATE CASCADE 只能同步 modeldeployment.providerId，无法同步 JSON 合同与观测/历史记录，
-- 改名会造成「合同 providerId ≠ 注册表 providerId」并使真实调用直接失败。
-- 因此把外键更新动作收紧为 RESTRICT：应用层已禁止改名，数据库层面同样禁止。
ALTER TABLE `modeldeployment`
  DROP FOREIGN KEY `ModelDeployment_providerId_fkey`;

ALTER TABLE `modeldeployment`
  ADD CONSTRAINT `ModelDeployment_providerId_fkey`
  FOREIGN KEY (`providerId`) REFERENCES `modelprovider`(`name`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
