-- AlterTable
ALTER TABLE `membershiplevel` MODIFY `maxEnterpriseWorkspaces` BIGINT NOT NULL DEFAULT 1,
    MODIFY `maxComponents` BIGINT NOT NULL DEFAULT 100,
    MODIFY `maxTeamSize` BIGINT NOT NULL DEFAULT 5;
