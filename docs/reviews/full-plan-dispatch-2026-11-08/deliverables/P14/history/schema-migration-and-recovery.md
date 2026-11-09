# 离线迁移、兼容顺序与回滚（U12 / 原 13）

> 本环境**未执行任何 `migrate dev/deploy/apply`、未 seed、未 generate 客户端、未连真实库**。
> 安全红线：禁止 `migrate reset` / `db push --accept-data-loss` / 重建库；应用一律走 `scripts/safe-migrate.ps1`（先备份再 deploy）。

## 1) 完整空库可创建前提（上轮缺失项已补）

`prisma/migrations/20261109000000_verification_budget_lock/migration.sql` 已补：

- `CREATE TABLE IF NOT EXISTS VerificationBudget (...)`：含
  `id`(PK) / `count` / `windowStart` / `lastSentAt` / `failCount` / `lockedUntil` / `version` / `updatedAt` + `@@index([id])` 等价索引。
- 三条 `ADD COLUMN` 改为 `information_schema` 条件化动态 SQL：**列不存在才加**，因此：
  - 空库：建表已含全部列，三条 ADD 自动跳过（不会因"列已存在"失败）；
  - 已有旧表（只有 id/count/windowStart/version/updatedAt）：建表语句 `IF NOT EXISTS` 跳过，补三列；
  - 已执行过的实例：全部幂等，重复部署无副作用。
- 存量行三列默认 0（未锁、无失败、无上次发送），60 秒间隔从下一次真实发送起算；不丢历史预算行。
- 生产 delegate 为 `prisma.verificationBudget`（camelCase），字段名与表一致。

## 2) 请求内 DDL 下线为离线迁移

`prisma/migrations/20261109000100_request_ddl_offline/migration.sql` 提供：

| 原请求内 DDL | 现生产行为 | 离线 DDL |
|---|---|---|
| Webhooks GET/POST/PATCH/DELETE 自愈 `CREATE TABLE webhooksubscription` | 鉴权后只读探针 `SELECT 1 ... LIMIT 1`；缺表 503 `WEBHOOK_TABLE_NOT_READY` | `CREATE TABLE IF NOT EXISTS webhooksubscription`（含主键与两个索引） |
| BYO 保存/读取热 `ALTER TABLE workspace_byo_model ADD COLUMN shareWithMembers` | 一律只读探针 `SELECT shareWithMembers ... LIMIT 1`；缺列抛 `BYO_SHARE_COLUMN_NOT_READY`(503) | `information_schema` 条件化 `ADD COLUMN` |
| admin/settings 写"值过长"时 `ALTER TABLE system_config MODIFY COLUMN value MEDIUMTEXT` | 不再改列；单一 `$transaction` 提交全部 upsert + 审计，过长则整笔回滚并返回 503 `SETTINGS_VALUE_COLUMN_NOT_READY` | 条件化 `MODIFY COLUMN value MEDIUMTEXT NULL`（仅当前非长文本时） |

代码证据：`src/app/api/webhooks/route.ts`、`src/lib/workspace-byo-model.ts`、
`src/app/api/admin/settings/route.ts`；测试 `r0v-u12-request-ddl.test.ts` 断言四个 webhook 方法与 BYO 探针的运行时 `$executeRaw` DDL 计数为 0，并静态检查源码不再含可执行 DDL。

## 3) 客户端与 schema 一致性

- 本地生成客户端的 DMMF 需包含 `lastSentAt` / `failCount` / `lockedUntil` 与 `VerificationBudget` 表。
- **未执行 generate**：本轮按红线隔离真实 .env/库；负责人需在停掉 dev server、隔离环境后执行 `prisma generate` 并核对 `index.d.ts`。
- `any` 不得用来隐藏字段错位；本轮 tsc 严格 0 错误，未新增排除文件。

## 4) 回滚

- VerificationBudget 三列：`DROP COLUMN lockedUntil / failCount / lastSentAt`（生产回滚需独立授权）。
- 建表回滚：`DROP TABLE webhooksubscription`；BYO 列：`DROP COLUMN shareWithMembers`；
  settings：`MODIFY COLUMN value VARCHAR(191)`（**可能截断既有长值，须先备份**）。

## 5) 仍未演练 / 环境门

- 真 MySQL 行锁、隔离级别、事务回滚语义、PREPARE/EXECUTE 在目标实例的执行权限：**未验证**。
- 备份还原除既有 mysql 导入验证外，本轮未演练；不把说明文档当真实灾备验收。
- 数据库当前状态未知，不自动补钱/扣回/迁租户/删资料。
