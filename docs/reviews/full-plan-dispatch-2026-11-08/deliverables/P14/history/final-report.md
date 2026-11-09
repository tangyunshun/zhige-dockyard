# 统一返工收口最终报告（P14 · 2026-11-09 第二轮）

- 复核基线提交：`67243457064f645a3a4af1a2e8b4b1d012a85d2d`（上轮统一修复）
- 复核依据：`docs/reviews/unified-recheck-2026-11-09/REVIEW.md`、`independent-results.json` 与本目录独立补测
- 当前 HEAD：同基线 + 本轮离线代码改动（见 `final-manifest.json`）
- 状态口径：`IMPLEMENTED_OFFLINE_VERIFIED` / `FAILED` / `DECISION_BLOCKED` / `ENVIRONMENT_UNVERIFIED`
- 红线：全程未连接真实库 / 未执行迁移 / 未 seed / 未创建真实管理员 / 未发真实邮件·短信 / 未真实收款 / 未调真实模型 / 未部署。所有外部 IO 用隔离替身。

## 一句话结论（大白话）

这一轮把独立复核复现出来的具体缺陷逐条修掉了：验证码的并发漏计与锁、改密凭证被旧凭证盗用、短信登录一次验证码发两份会话、收款被重复兑现、跨渠道串单、金额精度被吞、初始化向导走不通、登录被拒后又被"复活"、被禁用账号的 Key 还能用，以及请求里偷偷建表改列。这些都配了能跑的测试。但页面接线、真实浏览器串联、真实数据库/渠道互通仍**没做完**，下面如实列出，没拿"测试通过"当"上线验收通过"。

## 本轮实际修完并验证的缺陷

| 组 | 缺陷 | 修法 | 证据 |
|---|---|---|---|
| U02/U03 | 冷启动并发两笔都发送却只记一次 | 冷启动改 `create` 主键唯一认领，命中已有行走同一套准入裁决 | r0l3 / 独立复核 verification-review |
| U02/U03 | 失败锁只挡发送不挡核验 | `lookup` 先查锁定 | r0l2 / r0l3 |
| U02/U03 | 过期码仍可消费 | `consume` 先定位并核对有效期/锁定 | r0l3 |
| U02/U03 | 跨日计数叠加成 11 | 窗口过期原子重置为 1 | r0l3 |
| U02/U03 | 重复失败回退把预算打成负数 | 条件 `count>0` 才 decrement | r0l3 |
| U03 | SMTP 结果 resolve 就当已接收 | 按 `accepted/rejected` 核实目标接收事实，空 accepted 归 unknown | r0f / mailer-review |
| U09-6 | 调价与审计是两个事务，审计失败价格已改 | 改价/默认/审计合并为单一 `$transaction`，任一步失败整笔回滚 | r0d / pricing-review |
| U06 | 路径大小写 / HTTPS→HTTP 被当成同一目的地 | 按 URL 结构保留 scheme、host 大小写归一、路径大小写敏感、默认端口归一 | r0e / byo-review |
| U05-1/2 | 完整认证拒绝后被弱兜底复活；Key 不查账号状态 | 删除 `requirePlatformAuth` 的 JWT 弱兜底；Key 命中后实查账号禁用/封禁/注销 | r0g / security-review |
| U05-4 | 安装向导第一步只回 success，第二步必 403 | 基于已批准 SETUP_TOKEN 签发短期一次性安装授权；向导传递并在创建动作同一事务内认领消费 | r0z / init-diagnostics-review |
| U04 | 双订单并发同一交易号都履约 | 按「渠道+商户语境+交易号」落持久原子唯一认领（主键唯一 P2002），findFirst 不再单独裁决 | r0y / payment-review |
| U04 | 渠道不符、REAL 缺交易号/金额、金额精度被 Math.round 吞、晚收款覆盖首笔 | 渠道/币种严格核对；底层 REAL 精确金额门禁；严格元→分解析（10.004 拒绝）；多笔晚收款保留首笔并另存冲突 | r0y / r0x / r0b |
| U02 | 旧改密凭证借后来签发的新码恢复改密权 | resetToken 绑定 challengeId + jti；服务端按 challenge 身份原子条件消费 | r0u / reset-review |
| U02 | 短信登录并发同一码签发两份会话 | 验证后立即原子取得唯一消费权，消费失败不发 token/cookie；注册/绑定同样前置消费 | r0u / login-review |
| U12 | 业务请求里 CREATE TABLE / ALTER TABLE | webhooks 自愈建表、BYO 热加列、settings 惰性扩列全部改为只读结构探针 + 稳定 503 not-ready，结构交给离线迁移 | r0v |

## 验证证据（精确命令与结果）

- 正式回归（18 文件 / **318 passed**）：
  `node node_modules/vitest/vitest.mjs run src/app/api/__tests__/r0l-*.test.ts ... r0v-u12-request-ddl.test.ts`
  完整文件清单见 `final-tests.json`。
- 独立复核补测（11 文件 / **58 passed**）：DEFECT 断言已全部改成正确结果断言，
  用临时 `vitest.recheck.config.ts`（跑完已删除，`@`→`src` 别名）执行：
  `node node_modules/vitest/vitest.mjs run --config docs/reviews/unified-recheck-2026-11-09/vitest.recheck.config.ts`
- 严格类型检查：`node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` → **0 错误**（未新增排除文件、未放松模式、未用 any 绕字段错误）。
- 所有敏感拒绝断言同时检查存储/资金/网络调用计数与最终状态；事务测试替身忠实实现主键唯一（P2002）、条件 count、失败整笔回滚，不用"自动成功"失真 mock。

## 仍失败 / 未接线 / 待决策 / 未实际验证（必须如实申报）

- **FAILED（本轮未实现）**
  - U07（原 1/F14）：解析隔离"无停止证明过 100 秒仍占隔离"、ACTIVE sweep 计数未命中回滚、读取前实际有界读取 —— `parse-admission.ts` / `parse-runner.ts` / `extract-text` 未改。
  - U01/U10（原 6/8/11）：生产成本预算只有 Memory 后端、编排未接真实 task/attempt/费用持久入口、来源可退依据/配额映射守卫未接实际服务、运营恢复未接管理员页面/API、null tenant scope 跨租户边界。
  - U11/U12（原 10/12）：首页 60+/300% 与登录安全回跳、首值旅程页面、价值成本指标未接 API；预付/消费/利润分栏、未知成本口径未完成。
  - U05-5/6/7：debug/test01 之外的标准岗位跨空间私有统计、企业撤权在 UI/Open/Key/资料各入口一致性、历史保留矩阵。
  - U13/U14：原 1–14 全量唯一共享集成、同版本冻结 SHA 与页面/业务矩阵未完成。
- **DECISION_BLOCKED**：平台现金预算/加价率/售价、商业退款/保留期/企业转个人政策未批准，保持拒绝/暂停，不编批准记录。
- **ENVIRONMENT_UNVERIFIED**：真实 MySQL 行锁与迁移执行、微信/支付宝验签互通、真实 SMTP/短信供应商、真实浏览器页面串联与人工业务验收、供应商与固定成本。离线迁移已准备但**未执行**；客户端生成需隔离真实 .env 后由负责人执行。

## 交付材料清单

`final-manifest.json`（版本与文件）、`final-tests.json`（命令/结果/替身范围）、
`production-wiring-map.md`（入口→服务→事实→页面）、`scope-acceptance-map.md`、
`schema-migration-and-recovery.md`、`decisions-and-release-gates.md`、
`user-journey-evidence.md`、`handoff.json`。

所有实现者停写，状态统一 `DELIVERED_PENDING_INDEPENDENT_REVIEW`；开发者不自签独立验收或生产就绪。
