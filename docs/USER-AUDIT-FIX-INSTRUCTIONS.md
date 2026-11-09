# 用户工作台（/user/*）自查清单审查报告与修复指令

> 2026-11-04 三组并行代理审查 18 个路由（约 2.2 万行）。以下为缺口清单与修复指令，按批次执行。

## 高危批次（H）

### H1 生产安全
- pay/mock/page.tsx：页面无 PAYMENT_MODE 门禁，REAL 模式仍渲染"模拟支付成功"；后端 GET /api/payments/mock/confirm 未校验 mode（仅 POST 有）→ 前端 REAL 模式直接拦截渲染 + 后端 GET 补校验
- profile/page.tsx:100,396,1110-1121：smsDebugCode 调试验证码渲染到 UI + 「点此填入」→ 加 PAYMENT_MODE/NODE_ENV 门禁或删除

### H2 不可逆操作强确认（ConfirmDialog requireText）
- developer/page.tsx:2298-2342 删除 API Key（自制 Portal 无强确认）
- byo-model/page.tsx:602-623 解绑模型无任何确认；562-580 删除模型无 requireText
- pay/page.tsx:524-543 删除对公工单无确认；504-523 撤销工单无确认
- profile/page.tsx:1249-1279 注销账号仅 checkbox
- security/page.tsx:1198-1359 下线设备/一键下线/删除历史/清空历史 4 个弹窗
- activities/page.tsx:1414-1458 单条/批量永久删除
- reviews/page.tsx:1972-2022 删除评价（含批量）

### H3 敏感信息
- activities/page.tsx:1360-1370,1342-1353 metadata 明文渲染 apiKey 等敏感值 + 查看原始 JSON 完整暴露 → 脱敏
- activities/page.tsx:1386-1396 详情「删除此条记录」未判断 isProtected（合规保护日志）→ 前端隐藏
- 脱敏：profile 668/828/1126 邮箱手机、sub-accounts 421/426、team:256、dashboard:313 邮箱
- model-usage costMicros 已在前批修复

### H4 静默吞错→LoadErrorBanner
- dashboard:173-241 五接口静默全 0 渲染
- components:144-155 非 ok 静默落空态
- settings:378-502 五个 load* 静默降级
- security:286-321 登录历史/设备失败伪装"暂无记录"
- activities:390-409、reviews:267-273、team:70-111、sub-accounts:80-102、byo-model:286-317、developer:308-316、pay:349-352/450-452/1153-1158、billing-center:120-153
- profile:183-222

### H5 前端越权暴露
- settings/permissions 已在前批修
- security/page.tsx:528-538 修改密码无 StepUp 入口（twoFactorEnabled 覆盖不全）
- sub-accounts 重置密码无 StepUp（高危）→ 接入 StepUpAuthModal
- pay/mock + upgrade 页 localStorage 驱动业务状态（upgrade:181-197 personalWorkspaceUpgraded 可篡改）→ 后端校验为准

### H6 计费校验
- RechargeModal 已修（前批）；pay 页支付按钮防连点已达标（审查确认）

## 中危批次（M）
- M1 Esc 接线：pay 工单详情、developer 6 弹窗、byo-model 下拉、profile 3 弹窗、settings 恢复默认、sub-accounts 4 弹窗、activities 2 弹窗、reviews 2 弹窗、security 4 弹窗、workspaces 3 弹窗
- M2 英文枚举 DB 化（billing_display_dict.values 已有 19 键）：points/page TYPE_LABEL/PAYMENT_LABEL 兜底直出英文、workspaces PLAN_LABELS、billing-center membershipLevel、pay statusLabel/channelLabel/orderStatusLabel、byo-model protocol、developer 任务状态 → 统一走 lookupBillingValueLabel + 库内补词条
- M3 脱敏补漏：settings:1018,1711,1739 通知邮箱、team 邮箱
- M4 表单校验：sub-accounts 邮箱格式/密码复杂度（8 位含大小写数字）、security 改密复杂度强制、developer 密钥名称长度上限、profile 签名 maxLength、workspaces 简介 maxLength
- M5 空态引导：points 暂未加入工作空间、billing-center 无空间、dashboard 操作日志、components 搜索无结果

## 低危批次（L）
- 死代码：pay 发票全套（~150 行）、components ROLE_LABELS、points formatYuanFromPoints、billing-center formatDiscountLabel/activeWorkspaceName、activities formatTimeAgo、dashboard 4 图标、security 未用导入、reviews cancelEdit 硬编码标签/虚假导出文案/预览假身份/无评价默认 5.0 星误导
- console 残留 30+ 处（dashboard/components/points/workspaces/profile/settings/security/sub-accounts/activities/reviews/developer）
- 定时器清理：pay copyToClipboard、developer setCopiedCode、workspaces copy、qr 轮询过期不停/visibilitychange、byo-model 4 处 setTimeout
- 其它：settings 刷新按钮文案 btnSaving→刷新中、settings AudioContext close()、upgrade BOM/错误 key 清理/getAuthToken 统一、quota 余额 0 显示 "-"、sub-accounts window.confirm 统一、activities 日期区间校验

## 修复规范
- 使用现有设施：LoadErrorBanner/useEscapeKey/format.ts/ConfirmDialog(requireText)/lookupBillingValueLabel(billing_display_dict)
- DB 字典缺失词条先入库（system_config.billing_display_dict.values），代码不硬编码
- 外科手术式修改，公共组件保持向后兼容
