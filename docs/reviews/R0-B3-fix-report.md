# R0-B3 修复报告：关闭 B2-1 剩余时间边界

> **状态：R0-B3 待独立复核**。本项及必要回归通过后冻结席位批次，不继续加入一般优化或新功能。
> 不进入下一功能批次、不部署、不宣称生产就绪或盈利闭环完成。

---

## 〇、理解确认与范围

| 项 | 内容 |
|---|---|
| 唯一任务 | 关闭 R0-B2 唯一阻断项 B2-1：**事务内部异步数据库操作等待后，仍使用等待前的时间判断订单及套餐有效性** |
| 明确不做 | B2-2 周期校验、B2-3 成功页面恢复、B2-4 回滚说明**已冻结，未重新开发**；不扩展到企业池、退款、定价、增长、全站鉴权、架构重构、DDL、支付模式 |
| 允许改动 | `src/lib/payment/seat-addon-fulfill.ts`、`src/app/api/__tests__/r0b-seat-addon.test.ts`、一个新报告与实际开始副本 |
| 实际改动源码 | 仅上述两个文件；7 个冻结项与全部历史报告哈希未变（见第六节核对表） |
| 用户可见结果 | 异步等待（订单写 / 空间读写 / 空间写）期间跨过支付截止或套餐到期时**不再错误发放席位**；合法窗口内仍恰好发放一次 |

**错误前提更正（不覆盖 B2 报告）**：`R0-B2-fix-report.md` 第一节称「排队/取锁等待发生在进入回调之前」「授权裁决时刻在取得锁后计算」——**不成立**。进入 `$transaction` 回调不等于取得任何行锁；回调后的 `updateMany` / `findUnique` 仍是异步 IO，各自可能等待。B2 把 `now` 移入回调第一行，只覆盖了「回调前跨界」，条件写参数里的 `now` 在等待后不会自动更新。本批按真实锁顺序重建裁决点。

---

## 一、唯一根因

B3 开始态事务：

```text
$transaction 回调开始
  now = new Date()                         ← 等待前采样
  await 订单 updateMany(expiresAt gte now)  ← 可能等待；条件参数仍为旧 now
  await 空间 findUnique()                  ← 可能等待
  await 空间 updateMany(planExpiresAt gt now) ← 可能等待；条件参数仍为旧 now
  commit
```

条件在数据库按最新行求值，但绑定的时间参数是旧常量。审核复现：08:00:00.000 采样、订单截止 08:00:00.500、第一条写内部等 2s，实际裁决时钟 08:00:02.000 仍用 08:00:00.000 比较 → 三入口全部 `SUCCESS + 2 席位`；套餐在订单写 / 空间读 / 空间写等待中跨界同样放行。

---

## 二、修复：真实锁顺序、采样点与授权点

**不引入 raw SQL / `FOR UPDATE` / 新锁表 / 新服务**，沿用项目既有 Prisma 条件 `updateMany` 模式，把「时间判断」从各条件写中移除，集中到唯一授权点。

| 步骤 | 操作 | 真实取得的锁 / 性质 | 是否可能等待 |
|---|---|---|---|
| ① | `billingrecord.updateMany` 条件写：`{ id, status: "PENDING", expiresAt: 预检订单截止 }` → 临时写 SUCCESS + 履约 metadata | **订单行排他写锁（X lock，`WHERE` 为当前读＋写）**，持有至事务提交/回滚 | 是（等订单行锁） |
| ② | `workspace.findUnique` 一致性读，复核企业资格/溢出 | **普通读，不是锁**；不用于裁决时间 | 是（IO） |
| ③ | `workspace.updateMany` 条件写：`{ id, type, status notIn, plan, planBillingCycle, planExpiresAt: 预检套餐到期基准 }` → 席位增量 | **空间行排他写锁**，持有至提交/回滚；条件同时锁定报价事实 | 是（等空间行锁） |
| ④ | **唯一授权点**：`authorizedAt = new Date()` | ①③ 两把 X 锁均在手、所有影响资格的等待已结束、事务未提交（可完整回滚） | 否（之后无任何 `await`） |
| ⑤ | 纯 JS 最终授权：订单 `isOrderExpired({status:"PENDING", expiresAt}, authorizedAt)`；套餐 `planExpiresAt > authorizedAt` | 失败 → `throw` → 同一事务整体回滚 | 否 |
| ⑥ | 授权通过 → 交由事务提交 | 提交阶段跨界**不再反转**已合法授权 | — |

要点：

- **两个方向都覆盖**：采样点在订单写、空间读、空间写**全部返回之后**，因此订单侧与空间侧任一等待都被计入有效性判断。
- **互斥**：两次条件 UPDATE 成功后订单行与空间行均被本事务排他锁定；授权判断期间其它事务无法改动这两行。
- **完整回滚**：临时 SUCCESS、席位增量、履约 metadata 全在同一 `tx`；授权失败抛错即全部撤销，不产生「成功订单无权益」或已提交中间态；事务内无根客户端写。
- **时间口径**：全程项目 JS `Date`，不混用 MySQL `NOW()`。订单沿用 `isOrderExpired` 语义（`now > expiresAt` 才过期，**相等不过期、null 无截止不过期**）；套餐沿用预检的严格未到期规则。报价 `plan/cycle/expiry`、企业可写资格、席位溢出继续核对。
- **不新增商业政策**：无退款、宽限、补差、重买、后台恢复；订单/套餐失效返回现有可诊断拒绝，仅真实仍 PENDING 且订单本身确实过期的记录才条件关闭为 `EXPIRED`（套餐到期保留 PENDING 供人工核查）；竞争失败按最新状态分类。

---

## 三、T01—T08 固定矩阵（先复现失败 → 同一组断言验证修复）

夹具新增能力：把确定性时钟推进注入到**各 `await` 的 IO 内部**（`kind:model.method#nth`），并按 `dbEventLog` / `writeLog` 记录真实调用顺序；提交阶段单独注入 `WAIT@COMMIT`。`evalWhere` 对未知算子明确抛错，条件更新不恒 `count=1`，事务按 undo 日志真实回滚。

**复现方式（未回退工作区）**：把服务临时换成 `R0-B3-fix-snapshot/frozen-source/` 的 B3 开始态原始副本，跑**完全相同**的 T01—T08 断言，随后在 `finally` 中恢复修复版并校验哈希 `a680ceb2…` 一致。

| 编号 | 场景 | 开始态原始副本 | 修复版 | 修复版实际结果 |
|---|---|---|---|---|
| T01 | 预检有效，进入事务回调**前**等到订单/套餐过期 | PASS（B2 已有效） | **PASS** | `REJECTED`，订单 `EXPIRED`、零席位；B2 保护保留 |
| T02 | **订单写内部**等待，裁决前跨订单期限（共享 / REAL 外层 / MOCK POST 三入口） | **FAIL（错误 `FULFILLED`）** | **PASS** | 三入口均拒绝（MOCK 为 409），`WAIT@TX:billingrecord.updateMany#1+2000ms` 命中，订单 `EXPIRED`、零席位 |
| T03 | **订单写等待**期间跨套餐期限 | **FAIL** | **PASS** | 最终授权拒绝，订单 `PENDING`、席位与临时 metadata 全回滚；`writeLog` 证明两次条件写均执行 |
| T04 | **事务内空间读取**等待期间跨套餐期限 | **FAIL** | **PASS** | 拒绝、全回滚；`WAIT@TX:workspace.findUnique#1+2000ms` 命中 |
| T05 | **空间条件写内部**等待期间跨套餐期限 | **FAIL** | **PASS** | 拒绝、全回滚；`WAIT@TX:workspace.updateMany#1+2000ms` 命中，`writeLog` 恰为 `[TX billingrecord.updateMany, TX workspace.updateMany]`，证明两把行锁路径真实执行后才有最终授权 |
| T06 | 合法授权后**提交阶段**才跨截止；迟到旧过期请求 | PASS | **PASS** | `WAIT@COMMIT+2000ms` 后仍 `FULFILLED` 一次、席位 +2、`SUCCESS`；迟到请求 `ALREADY_PROCESSED`，不反转、不多发 |
| T07 | 截止恰好相等 / 历史 `null` 期限 / 正常有效窗口 | PASS | **PASS** | 相等不算过期、`null` 不拒绝、正常窗口 `FULFILLED` 且重复确认只发一次 |
| T08 | 同订单并发、各写点及提交故障、资格变化 | PASS | **PASS** | 并发仅一次、根/tx 写分离、故障与资格变化全回滚、同单安全重试恰好一次 |

- 开始态副本：`4 failed / 4 passed`，退出码 **1**（失败项恰为 T02/T03/T04/T05）。
- 修复版同一组断言：`8 passed`，退出码 **0**。

---

## 四、真实开始副本与最小差量

- 采集时间 `2026-11-06T23:12:35+08:00`；`HEAD = 761684be8d5661d6ed288f3b91d1fedfdc795a75`；开始时 `git status` 115 项（101 modified / 14 untracked）前批与他人改动，未 reset/clean/restore。
- **改动前**保存的真实原始副本与哈希（`frozen-source/`），与 B2 独立复核 `verification.json` 的 `sha256` 完全一致，作为 B3 真实开始态：

| 文件 | B3 开始态 SHA256 | B3 结束态 SHA256 | 差量 |
|---|---|---|---|
| `src/lib/payment/seat-addon-fulfill.ts` | `4fc0e9a42e95e…` | `a680ceb22a195c…` | **+81 / −18** |
| `src/app/api/__tests__/r0b-seat-addon.test.ts` | `ee29b40ac5e60e…` | `6077a33df08ab…` | **+243 / −1** |

完整哈希与副本见 `docs/reviews/R0-B3-fix-snapshot/manifest.json`、`frozen-source/`、`end-source/`。

服务侧差量仅：① 把 `now` 降级为不参与裁决的 `writeStamp`；② 两次条件写移除时间比较、改为锁定报价事实；③ 在两把锁到手后新增唯一授权点（新时间采样 + 纯 JS 判断）；④ catch 增加授权失败分类。测试侧差量为 IO 内部等待注入 + T01—T08 矩阵。**未改任何页面、路由、定价、周期、展示契约或商业开关。**

冻结项核对（哈希与 B2 复核记录一致，零改动）：`fulfill.ts` `2fde4030…`、`mock/confirm` `2795103f…`、`qr/page.tsx` `12663337…`、`mock/page.tsx` `0f0b2d84…`、`payment-cashier-display.ts` `541726f8…`、`seat-addon/route.ts` `0ab6a55c…`、`order-expiry.ts` `15b9395b…`；`R0-B2-fix-report.md` `70c7d3c1…`、`R0-B1-fix-report.md` `13fbac79…` 及 B2 独立审核目录均未改动，不覆盖旧报告。

---

## 五、验证命令与退出码

依赖检查（先做）：5 个指定隔离文件均为 `vi.mock("@/lib/prisma")`、`realDbMarker=False`，无 `new PrismaClient` / `DATABASE_URL` / `mysql://`；未下载依赖、未跑全量测试。

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `npx vitest run src/app/api/__tests__/r0b-seat-addon.test.ts -t "R0-B3 T01" --reporter=dot`（**B3 开始态原始副本**） | 4 failed / 4 passed（T02—T05 复现错误履约） | **1** |
| 2 | 同上（**修复版**，同一组断言） | **8 passed** | **0** |
| 3 | `npx vitest run r0b-seat-addon.test.ts r0a-business-boundary.test.ts r0a2-real-combo.test.ts r0a3-combo-regression.test.ts r0a4-combo-regression.test.ts --reporter=dot` | **5 files / 202 tests passed**（194 项既有回归 + 8 项 T 矩阵），3.73s | **0** |
| 4 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | **21/21 checks passed**（页面未重写） | **0** |
| 5 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |
| 6 | `read_lints`（两个改动文件） | 0 诊断 | — |

第 1 步的临时换入在 `finally` 中恢复并二次校验哈希一致，**未实际回退工作区**；复现后当前工作区保持修复态。

---

## 六、账务影响

- **零真实数据库写入 / 迁移 / seed / 补账 / 退款；零真实支付、模型、短信、邮件调用；零部署；零环境密钥读取。**
- 定价、折算、舍入、月年周期、赠送、名额、BYOK、结算开关、支付模式全部未动；B2 已关闭的三项冻结。
- 行为上的唯一变化是闸门收紧：事务内部等待期间跨过订单/套餐期限时不再错误发放席位。拒绝时订单诚实 `EXPIRED` 或保留 `PENDING` 供人工核查，不新增退款/宽限/补差/后台恢复政策；已合法授权并提交的订单不清账、不撤回、不自动退款。
- 未发现也未宣称任何已发生的实际资金损失；审核材料亦说明这是确定性 IO 等待模型，不是线上事故证据。

---

## 七、未验证项（如实标注）

1. **真实 MySQL 行锁 / 隔离级别 / 条件 UPDATE 的加锁时机未实测**：本批只用内存夹具模拟 IO 等待、条件求值与事务回滚；两把 X 锁的语义基于 InnoDB 条件 UPDATE 的当前读＋写推断，**不构成数据库并发证据**，需独立复核在隔离库验证。
2. **浏览器 DOM / 端到端真实支付**：页面 21 项为 vm 受控组件执行，非浏览器渲染；真实网关、证书、二维码未验证。
3. **真实业务数据与历史真实库测试残留**：未查询当前生产库、未调查旧残留。
4. **定价与商业口径**：月年定价、零价/舍入、利润、退款政策仍按原路线图独立复核，本批未修改或重新批准。
5. 一般加固（完成响应类型收紧、页面跨请求取消等）不在本批范围，登记后续，不作为继续补修理由。

---

## 八、状态与停止

B2-1 唯一阻断项按 T01—T08 及 194 项必要回归通过，21 项页面检查与类型检查重跑通过，**到此停止并交回独立审核**：

- **最终状态：R0-B3 待独立复核**；
- 席位批次源码与隔离结论冻结；不进入企业池 / 退款 / 增长 / 全站鉴权等下一批，不新增一般优化或新功能；
- 不宣称生产就绪、真实交易可用或平台盈利闭环完成；
- 历史报告与 B2 快照不覆盖；当前工作区保持修复态，未实际回退。
