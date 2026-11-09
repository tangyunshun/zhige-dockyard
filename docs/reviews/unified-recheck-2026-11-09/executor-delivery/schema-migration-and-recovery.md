# 离线迁移、delegate/索引/唯一约束与回滚

## 本次新增能力
- 模型 `VerificationBudget` 增量加列：`lastSentAt`(BigInt)、`failCount`(Int)、`lockedUntil`(BigInt)。
- 离线迁移：`prisma/migrations/20261109000000_verification_budget_lock/migration.sql`
  - `ALTER TABLE VerificationBudget ADD COLUMN lastSentAt BIGINT NOT NULL DEFAULT 0;`
  - `ALTER TABLE VerificationBudget ADD COLUMN failCount INT NOT NULL DEFAULT 0;`
  - `ALTER TABLE VerificationBudget ADD COLUMN lockedUntil BIGINT NOT NULL DEFAULT 0;`
- delegate 命名：生成客户端为 `prisma.verificationBudget`（camelCase），已修正旧 `verificationbudget` 拼写错误。
- 唯一约束/索引：复用既有 `id` 主键（platform / ip:xxx / target:channel:target 三类键）；并发靠 `version` CAS（P2025 重试）与 `upsert` 唯一键（P2002）。

## 兼容顺序与历史差异
- 既有 `smscode` 表不动，不丢历史验证码状态。
- 新列均有 `DEFAULT 0`，对存量行零破坏；不需要回填。
- 回滚：若需回退，`ALTER TABLE ... DROP COLUMN lastSentAt/failCount/lockedUntil;`（生产环境需独立授权执行，本次未执行）。

## 真实迁移未执行声明
- **本次未执行任何 `migrate dev/deploy/apply`**，也未 seed、未创建真实管理员、未发送真实验证码/邮件。
- `verification-backend.ts` 的 `ready()` 反映真实 `verificationBudget` 与 `smscode` 委托是否可用；表/列缺失时外发前稳定 503，不 Map 放行、不请求建表。
- 生成客户端不等于已部署数据库：部署前需由负责人执行上述离线迁移并验证列存在。

## 请求内 DDL（U12）状态
- 已处理：公开诊断路由不再触发结构写（改为授权读取）。
- 未处理（仍可能含请求内 DDL）：webhooks 自愈建表、BYO 保存热 ALTER、后台 settings 惰性扩列——待后续批次移除并改为离线迁移 + not-ready。
