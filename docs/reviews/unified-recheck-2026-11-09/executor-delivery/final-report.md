# 统一返工最终报告（P14）

- 评审基线提交：`5162e5b12b105c71ca71fb628854d32f7201f371`
- 本修复 HEAD：同基线 + 本次离线代码改动（见 final-manifest.json）
- 状态口径：`IMPLEMENTED_OFFLINE_VERIFIED` / `FAILED` / `DECISION_BLOCKED` / `ENVIRONMENT_UNVERIFIED`
- 重要：所有修复均**未连接真实数据库/支付/短信/模型/部署**，外部 IO 用隔离替身；离线迁移已准备但**未执行**。

## 用户可见结果与真实闭环

- 验证码 / 重置密码：生产算法（60s 间隔、日限、5 次失败锁 30 分钟、平台/IP/账号技术边界）已实现并跑通隔离委托；重置密码消费失败绝不写密码；用途严格隔离（注册码不能改密、登录码不能绑定）。
- 计费口径：加价率不再对 >10000 做 ÷10 猜测（20000 保留 20000）；FREE 额度查询改为只读，不再写库/写死 100。
- 调价：全局加价率批量同步删除重复 upsert、用真实 `updateMany.count`、审计与改价同事务（不再审计失败仍伪成功），GET 不再猜单位。
- 公开诊断：`/api/health/debug-test01` 与 `/api/test-db` 两个无鉴权泄露私有数据（配额、成员邮箱、用户资料、申诉）的路由已加平台授权守卫，未授权一律 403。
- 初始化：`init-admin` 从“任何人可建超级管理员 + 原始 SQL 混写 created_at”重写为“授权 token 校验 + 事务原子认领（systemconfig 唯一键，并发第二笔整笔回滚）+ Prisma create 正确字段名”。

## 逐项状态（U01–U12）

| 编号 | 项 | 状态 | 说明 |
|---|---|---|---|
| U02/U03 | 生产验证码与一次性授权 | IMPLEMENTED_OFFLINE_VERIFIED | 后端重写 + 4 处路由接线 + 离线迁移 + 24 个测试（含真实算法隔离委托） |
| U06 | BYO 新目的地+空 key 不重用旧 key | IMPLEMENTED_OFFLINE_VERIFIED | 仅同 endpoint+协议一致才复用已保存密钥 |
| U08 | 计费口径 / FREE 只读 | IMPLEMENTED_OFFLINE_VERIFIED | 4 个测试覆盖 |
| U09-6 | 全局调价计数/审计/事务 | IMPLEMENTED_OFFLINE_VERIFIED | 删重复 upsert、真实 count、审计同事务、GET 不猜单位 |
| U05-3 | 关闭公开诊断私有数据 | IMPLEMENTED_OFFLINE_VERIFIED | debug-test01、test-db 加平台授权守卫 |
| U05-4 | init-admin 原子初始化 | IMPLEMENTED_OFFLINE_VERIFIED | 授权 token + 事务唯一认领 + 正确字段 |
| U05-1/2/5/6/7 | 完整认证复活 / API Key 状态 / 企业边界 / 标准岗位目录 | FAILED | 尚未改动 auth 兜底、api-key 账号状态、企业撤权 UI/Open/Key 一致性、标准岗位目录泄露 |
| U04 | 支付并发唯一认领 / 真实收款事实 | FAILED | payment/fulfill、wechatpay、alipay、notify 入口未改动 |
| U07 | 解析隔离停止证明 / 有界读取 | FAILED | parse-admission/parse-runner/extract-text/handler 未改动 |
| U01/U10/U11 | 真实页面接线 / 运营恢复 / 价值成本指标 / 首值旅程 | FAILED | 既有纯逻辑层存在但未接真实 API/页面入口；浏览器串联未做 |
| U12 | 移除请求内 DDL | PARTIAL | 已修公开诊断；webhooks 自愈建表、BYO 保存热 ALTER、后台 settings 惰性扩列尚未处理 |
| U13 | 唯一共享集成 | DECISION_BLOCKED | 依赖上述各实现项实际交到，当前未齐 |
| U14 | 验收矩阵/固定终点 | IN_PROGRESS | 本目录即为交付材料，但多项仍 FAILED |

## 仍失败 / 未接线 / 待决策 / 未实际验证

- **FAILED（需继续实现）**：U04 支付、U05-1/2/5/6/7、U07 解析、U01/U10/U11 页面接线。
- **ENVIRONMENT_UNVERIFIED**：任何真实浏览器/页面串联、真实 MySQL 锁、渠道验签互通、供应商成本、人工业务验收。
- **DECISION_BLOCKED**：预算/定价/商业退款/保留期/企业转个人规则仍按“未批准即拒绝”，不编批准记录。

## 测试与类型

- 新增/修复测试：`r0l-verification`、`r0l2-verification-production`、`r08-billing-quota`。
- 精确运行：`node node_modules/vitest/vitest.mjs run <文件>`（vitest 在本环境常被误判为 watch，故用 node 直接调用）。
- `tsc --noEmit -p tsconfig.json`：本批次改动**零类型错误**；仓库既有 5 个 tsc 错误已全部在本批次测试文件内修正后归零。
- 严禁无过滤全仓测试（仓库含真实数据库写测试）。
