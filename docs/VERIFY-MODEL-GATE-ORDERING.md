# 模型门禁与「先模型后算力点」顺序验证说明

> 目标：证明修复后「空间默认模型」门禁在「模拟预览」与「真实执行」两条分支都真实生效，
> 且门禁一定先于「算力点余额」检查。验证环境：开发库（dev server :3000 + 同库），使用 test-01 个人空间。
> 日期：2026-10-14　验证对象：`src/app/api/studio/route.ts`

---

## 0. 修复点（背景）

原实现存在两个问题：

1. **「模拟预览」分支吞掉了错误**：在 `simulate`（估算/预览）分支里，默认模型解析被包在 `try` 中，出错只打日志、不拦截。
   结果：用「模拟预览」去跑没设默认模型的空间，照样返回估算点数，用户察觉不到「没设模型」这道门槛，只有真正点「执行」才咬人。
2. **「默认模型」与「算力点」检查顺序未严格保证**：需要从代码结构上保证「先验证模型、再验证算力点」。

修复（`src/app/api/studio/route.ts`，外科手术式两处）：
- 让最外层异常出口也能识别 `MODEL_DEFAULT_NOT_CONFIGURED` 这类错误，返回干净的 `HTTP 403`（而不是笼统 `500`）。
- 在「模拟预览」分支里，把默认模型解析失败从「静默吞掉」改为「向上抛出、由统一出口报告明确错误码」。

> 注意：仅改出口与错误传播，**未改动业务逻辑与认证/权限判定**。

---

## 1. 验证脚本

| 脚本 | 验证什么 | 是否动写库 |
|---|---|---|
| `scripts/verify-gate-negative.ts` | 门禁负向生效：摘掉默认模型 → 跑 C12 → 应被 `MODEL_DEFAULT_NOT_CONFIGURED` 拦截 → 还原 | 临时改 `workspace_model_policy.defaultDeploymentId`，跑完即还原 |
| `scripts/verify-order-hardcore.ts` | 顺序硬核验证：同时「摘默认模型 + 把算力点清零」→ 跑 C12 → 应返回**模型**错误而非**余额不足** → 全部还原 | 临时改默认模型 + 清零 `pointgrant`/`userwallet`/`workspacequota`，跑完即还原 |

两个脚本都支持从 `.env` 读取环境变量（含 `DATABASE_URL`），密码通过 `TEST_PWD` 环境变量传入，**不写死在文件里**。

### 运行前准备

- dev server 在 `http://127.0.0.1:3000` 运行中；
- 根目录存在 `.env`（含 `DATABASE_URL`）；
- 提供 test-01 登录密码：`$env:TEST_PWD="Test01@163.com"`（PowerShell）。

### 运行命令

```powershell
# 脚本一：门禁负向生效
$env:TEST_PWD="Test01@163.com"; npx tsx scripts/verify-gate-negative.ts

# 脚本二：顺序硬核验证（临时清零算力点）
$env:TEST_PWD="Test01@163.com"; npx tsx scripts/verify-order-hardcore.ts
```

常量（脚本内）：账户 `test-01`、个人空间 `ws-personal-1787924572254-wu6kio`、组件 `C12`（接口数据关联设计）。

---

## 2. 验证结果（实跑）

### 2.1 脚本一 `verify-gate-negative.ts`（门禁负向生效）

```
当前默认模型 deploymentId = 78fb45bc-08e4-4658-a7cf-a22441595dc6
BYO 模型存在？ false
已临时摘掉默认模型

=== 负向：无默认模型时跑 C12 ===
HTTP 403 code= MODEL_DEFAULT_NOT_CONFIGURED success= false
error= 当前空间尚未配置默认模型，无法执行任务。请前往空间「模型」页面设置一个默认模型后再试。

已还原默认模型为 78fb45bc-08e4-4658-a7cf-a22441595dc6

=== 还原后再次跑 C12 ===
HTTP 200 code= undefined success= true error= undefined

结论: 门禁生效=true 还原成功=true
```

**结论**：模拟预览分支下，「没设默认模型」现在会明确拦截（原实现会被悄悄吞掉）；还原后恢复正常。

### 2.2 脚本二 `verify-order-hardcore.ts`（顺序硬核验证）

```
清零前可用余额 available = 80 (wallet=40, ws=40)
默认模型 = 78fb45bc-08e4-4658-a7cf-a22441595dc6  相关 pointgrant 桶数 = 4  wallet= 40n  quota= 40

清零后可用余额 available = 0 （应=0，确认余额不足可触发）

=== 硬核：无默认模型 + 余额清零 时跑 C12 ===
HTTP 403 code= MODEL_DEFAULT_NOT_CONFIGURED success= false
error= 当前空间尚未配置默认模型，无法执行任务。请前往空间「模型」页面设置一个默认模型后再试。

还原后可用余额 available = 80 （应与清零前一致）

=== 还原后再次跑 C12 ===
HTTP 200 code= undefined success= true error= undefined

结论: 模型先于算力点=true (返回MODEL_DEFAULT_NOT_CONFIGURED)  还原成功=true
```

**结论**：在「没设默认模型 + 算力点已清零」**同时成立**时，系统返回的是**模型错误**（`MODEL_DEFAULT_NOT_CONFIGURED`）而非**余额不足**（`POINTS_INSUFFICIENT`）。
这实打实证明：**先验证默认模型，再验证算力点**。若顺序相反，会因余额=0 先报「余额不足」。

---

## 3. 关键断言与判定口径

| 断言 | 期望 | 结果 |
|---|---|---|
| 门禁在模拟预览分支生效 | 无默认模型 → `403 MODEL_DEFAULT_NOT_CONFIGURED` | ✅ |
| 默认模型检查先于算力点检查 | 双条件成立时返回模型错误、非余额不足 | ✅ |
| 验证后数据可还原 | 默认模型、算力点余额与清零前一致 | ✅ |

---

## 4. 数据还原清单（验证产生的临时改动，均已还原）

- `workspace_model_policy.defaultDeploymentId`（test-01 个人空间）：临时置 `null`，已还原为 `78fb45bc-...`。
- `pointgrant` 4 个分桶 `remaining`：临时置 0，已还原。
- `userwallet.balance`、`workspacequota.tokenBalance`：临时置 0，已还原。
- 验证后 `getBalanceSummary` 显示可用余额恢复为 80，C12 跑通（HTTP 200），无残留影响。

---

## 5. 交付脚本

- `scripts/verify-gate-negative.ts`（门禁负向验证）
- `scripts/verify-order-hardcore.ts`（顺序硬核验证）

> 复测：只要 dev server 与 `.env` 就绪，重跑上述两条命令即可复验；密码经 `TEST_PWD` 注入，脚本本身不落库任何凭据。
