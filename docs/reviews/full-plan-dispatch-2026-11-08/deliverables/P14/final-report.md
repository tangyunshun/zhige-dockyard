# P14 最终报告：统一剩余修复（第三轮 · 2026-11-10）

- 基线提交：`6d9f68b403798a8243f11eeb36a587916c4deb13`（上轮收口提交，本轮为工作区改动 29 文件，未提交）
- 本轮依据：`docs/reviews/unified-closeout-review-2026-11-09/REVIEW.md` + `IDE-REMAINING-CLOSEOUT-PROMPT.md`
- 状态口径：`IMPLEMENTED_OFFLINE_VERIFIED` / `FAILED` / `ENVIRONMENT_UNVERIFIED`
- 红线：全程未连接真实库 / 未执行迁移 / 未 seed / 未创建真实管理员 / 未发真实邮件·短信 / 未真实收款 / 未调真实模型 / 未部署。所有外部 IO 用隔离替身。
- **此前版本报告完整保留于 `history/`（2026-11-09 第二轮及更早）。**

## 一句话结论（大白话）

这一轮把复核报告点名的**七组具体缺陷**修掉了：席位增购绕过交易唯一认领、晚到账并发丢事实、发送预算回退错位、消费端不查失败锁、改密失败后凭证作废、Webhooks 绕过完整会话、调价审计记 0/0、BYO 丢 query、解析无停止证据腾槽、登录回跳可跳外站。这些都配了能跑的正式测试（41 文件 792 项全绿）。但**生产成本后端、企业撤权矩阵、首页改版、运营恢复接后台、指标接 API 这几块大的接线仍然没做**，下面 §三如实列出，没拿"测试通过"当"全部完成"。

## 一、本轮实际修完并验证（IMPLEMENTED_OFFLINE_VERIFIED）

### 1. 原5 / U04：交易事实唯一性覆盖所有订单与终态

| 缺陷 | 修法 | 证据 |
| --- | --- | --- |
| SEAT_ADDON 绕过 (渠道,商户,交易号) 唯一认领，一笔收款可支撑多订单席位 | `fulfillPaidOrder` 认领行覆盖**全部订单类型**：先认领成功（P2002 裁决并发）再委托席位服务；跨订单同交易 → REJECTED | r0y 新增"同一交易并发两个不同席位订单：最多一次权益"；r0b 93 用例全绿 |
| REAL 席位缺交易号仍能履约 | REAL 门禁不再豁免席位（放终态/超时留证分支之后，不挡无凭证过期关单） | r0y"REAL 席位缺交易号 → 拒绝，零权益" |
| 晚到账并发读改写 metadata 丢事实；SUCCESS 新交易被当重发丢弃 | 终态到账以 (渠道,商户,交易号) 认领行**原子落行**（PENDING_RECOVERY），并发两笔各自成行；SUCCESS 第二笔交易落 DIFF_FACT 差异行可追溯；同笔重放幂等 ACK 并重读最新状态分类；超时已收款留证+条件关单 | r0y"终态订单两笔不同交易并发到账：两笔事实都可追溯""SUCCESS 订单收到另一笔交易：留存差异事实并 ACK"；r0b 超时用例改新契约 |

### 2. 原2/4 / U02/U03：验证码

| 缺陷 | 修法 | 证据 |
| --- | --- | --- |
| A 重复 failed 回填退掉 B 的占用（count>0 只防负） | 新增 `VerificationSendClaim`：admitSend 为各维度持久化 PENDING 认领（含窗口起点）；failed 回填按认领 PENDING→REFUNDED 幂等转换（重复回填 count=0 零效果）；跨窗口迟到回填标 OBSOLETE；认领写失败 → 释放占用 + 503 | r0l2 夹具增认领替身（真实唯一约束）；29 项验证码测试全绿 |
| consume 不查失败锁：先成功核验再触发锁，消费仍 ok | consume 与 lookup 同一锁定事实（已锁即使持有效 token 也 429） | r0l/r0l2/r0l3 回归 |
| 锁表 P2021 被吞成 null 当"没有锁"继续放行 | `VerificationBackendUnavailableError`：lookup 抛出（verify 层 notReady fail-closed 不计用户失败）、consume 503 零敏感效果；「记录不存在」与「服务不可用」严格区分 | 同上 |
| recordFailure 首次 upsert update={} 丢失败次数 | create + P2002 重试读改（并发安全） | r0l3 夹具 |
| 旧码标用与新码创建非原子 | issue 在同一事务内完成（生产交互事务） | r0l2（$transaction 路由到替身模型） |
| ip/actorId 未传生产预算 | send-email-code 从可信代理头（x-forwarded-for 最后一跳/x-real-ip）取 IP、从服务端会话取 actorId；不信任 body | r0l 正常路径断言 |
| **改密先消费后更新，update 失败重试永远 400** | 新增 `PasswordResetClaim`（jti 状态机 PENDING→AUTH_CONSUMED→COMPLETED）：写失败后同 token 重试不重复消费；响应丢失重放幂等成功；密码只写一次 | r0u 7 用例（两处断言按幂等契约更新，保留"不重做敏感写"不变量） |

### 3. 原2 / U03：邮件精确接收事实

- 删除 includes 子串误判；按传输契约提取规范化地址**精确比较**（malice 不再命中 alice）。
- 无 accepted/rejected 确认事实 → unknown（NO_CONFIRMATION_FACT）；目标拒收 → failed；**SMTP 未配置 = failed（确定未发起）**，与已发起 unknown 区分（r0f 断言更新）。

### 4. 原9 / U05：完整身份真实入口一致 + 回跳安全

- Webhooks 删除 x-user-id 信任路径：一律完整 validateUser（会话/封禁/强制下线/到期），带凭证被拒即 401 不回退、不返回 secret。
- workspace list / switch / upgrade(×2) / create-personal / workspace-hub-dashboard 五入口同口径移除 x-user-id 快速通道。
- 登录页 `sanitizeInternalRedirect`：拒绝外站、协议相对(//)、反斜杠、任何 scheme、编码绕过（解码一次复查）；三处消费点（已登录跳转/回跳参数/登录后 finalPath）全覆盖，不合法回落 `/workspace-hub`。

### 5. 原11 / U09-6：调价审计同事务真实计数

- global-markup 改交互式事务：事务内取得实际 updateMany.count 后构建审计再提交；API 与持久 audit details 同为真实行数（default 0/0 = 真实语义）；任一步失败整笔回滚（r0d 夹具升级支持交互式事务 + 回滚语义）。

### 6. 原8 / U06：BYO 目的地 query

- normalizeEndpoint 捕获并逐字节比较 query——tenant/重复/编码变化默认不复用旧 key；host/scheme/path/端口/重定向保护保留（r0e 全绿）。

### 7. 原1 / F14：停止/回收/有界读取

| 缺陷 | 修法 | 证据 |
| --- | --- | --- |
| 过期 ACTIVE 凭 TTL/grace 腾槽 | sweep 只把过期 ACTIVE 转 QUARANTINED（诊断保留，计数完全不动）；退出证据由 runner exit 事件驱动 claimToken CAS 归还 | r0k1 两用例改新契约（计数守恒 + CAS 幂等），25 用例全绿 |
| QUARANTINED 凭 createdAt 时限腾槽 | 仅 `EXIT_CONFIRMED:` 证据标记（迟到退出确认但归还未命中时写入）+ 超安全时限才按 CAS+计数命中守恒回收；无证据保留待管理员带证据恢复 | 同上 |
| 先无限 arrayBuffer 后看上限 | 读取前 Blob.size 预检，超限 413（Content-Length 仍不作唯一依据） | extract-text 源码（r0k 组合回归） |

### 8. 证据保护（§0.6）

- **133 个被误删的审核/原方案 Markdown 已按 git HEAD 逐路径恢复**（未全仓 restore）。
- 9 个被改写旧审核测试事实核查：payment/security 旧版完好；byo/pricing/verification 在 unified-independent-review 目录为第三版本（非旧版）；init-diagnostics/login/mailer/reset 旧版从未入 git、原始 blob 不可恢复——如实声明，不伪造，不为补名字创建假文件。本轮新断言全部写入正式测试；旧独立审核目录零修改。

## 二、本轮验证

- 正式 41 文件联合回归：**792/792 通过，exit 0**（2026-11-10 00:27；上轮审核的 1 项 DOCX 预览 504 时间敏感失败本轮未复现——上轮首次结果保留于审核目录，不据此否认）。
- `tsc --noEmit --incremental false -p tsconfig.json` exit 0。
- 两份解析 node:test 与 18 项基线由既有证据保护，本轮未改动解析格式逻辑。

## 三、仍未完成（FAILED / ENVIRONMENT_UNVERIFIED，不宣称全部完成）

| 原项 | 状态 | 具体缺口 |
| --- | --- | --- |
| 原6/7/8 U01/U10 | **FAILED** | 成本预约无生产共享原子后端与真实入口接线（同键异参/并发预算/UNKNOWN 保留/结算不清已耗）；持久 task/attempt/供应商事实与费用恢复未接真实入口；来源退款未接真实 ledger/grant/hold。原因：跨 Studio/Open/估价/多步重试接线 + 生产数据模型设计，工程量超出本轮交付 |
| 原9 U05（剩余） | **FAILED** | 企业撤权全入口矩阵、岗位私有统计收口、首页不实宣传（60+/300%）与首次价值页面 |
| 原10/11/12 U11/U12 | **FAILED** | 运营恢复接真实后台（持久可信事实/服务端权限/CAS）；指标接 API 与真实经营口径（预付款≠已消费、未知固定成本不判完整利润） |
| 原13 | 部分 + **ENVIRONMENT_UNVERIFIED** | VerificationSendClaim/PasswordResetClaim 已入离线 schema 草案（本轮新增，未执行迁移）；迁移历史 checksum/已部署实例兼容需真实环境核实 |
| 原14 | 部分 + **ENVIRONMENT_UNVERIFIED** | 当前版本 manifest/SHA/可复跑命令已交（final-manifest.json/final-tests.json）；浏览器实际旅程证据未采集 |

## 四、决策门（无新增已批准项）

售价/现金预算/赠送/商业退款/保留期/企业转个人政策、生产 Token 结算/BYOK 新收费、真实迁移/部署、浏览器验证——全部维持既有门，见 decisions-and-release-gates.md（未改动）。

**由用户将本报告 + final-manifest.json + final-tests.json 交独立审核；执行者不自签独立验收、真实交易或生产可用。**
