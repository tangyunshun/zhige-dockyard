# Workspace-Hub 优化任务清单

版本: v1.0 | 对应: WORKSPACE-HUB-SPEC.md | 优先级: P0 > P1 > P2

---

## 概况

| 总量 | P0(阻断) | P1(核心功能缺失) | P2(优化) |
|------|---------|-----------------|---------|
| 23 项 | 5 项 | 10 项 | 8 项 |

---

# P0 — 阻断级问题

## P0-1：缺失 7 个子组件文件

**问题**：page.tsx 导入了 7 个组件但文件全都不存在，页面无法编译。

**规格要求**：创建以下 7 个组件文件：

src/components/workspace-hub/
  UserGreeting.tsx
  PersonalWorkspaceCard.tsx
  EnterpriseWorkspaceList.tsx
  ResourceOverview.tsx
  QuickActions.tsx
  FeaturedComponents.tsx
  PendingSection.tsx

**给 Antigravity IDE 的 prompt**：

Use antigravity-workflows. Create 7 React "use client" components in src/components/workspace-hub/. Each must use zg-* CSS classes from globals.css. Primary color tech-blue (#3182ce). No marketing decoration. These are workspace dashboard components.

1. UserGreeting: Props { user }. Shows greeting with name, membership badge, current date. No admin entry.

2. PersonalWorkspaceCard: Props { workspace, state, onEnter, onUpgrade, onRename, onReset, onDelete }. Renders differently per 7 states.

3. EnterpriseWorkspaceList: Props { workspaces, onEnter, onManage }. Role-based cards.

4. ResourceOverview: Props { quota, onUpgrade }. Three progress bars.

5. QuickActions: Props { onJoinInvitation, onComponentMarket }. Two buttons only.

6. FeaturedComponents: Props { components }. Recent component list.

7. PendingSection: Props { invitations, applications, onView }. Conditional render.

---

## P0-2：缺失 useWorkspaceHub hook 及 5 个独立 hook

**问题**：@/hooks/useWorkspaceHub 文件不存在。

**规格要求**：拆为 5 个独立 hook：

src/hooks/
  useWorkspaceHubData.ts     — 聚合数据获取 + 状态派生
  usePersonalWorkspace.ts    — 个人空间 CRUD
  useEnterpriseWorkspace.ts  — 企业空间操作
  useInvitation.ts           — 邀请码管理
  useDeleteWorkspace.ts      — 删除/重置流程

**useWorkspaceHubData.ts 核心逻辑**：

调用 GET /api/user/workspace-hub/dashboard，返回聚合数据。推导 personalState：

function derivePersonalState(personalWs, upgradeMode, isDeleted) {
  if (isDeleted) return 'DELETED';
  if (!personalWs) return 'NONE';
  if (upgradeMode === 'replace') return 'REPLACE';
  if (upgradeMode === 'migrate') return 'MIGRATE';
  if (upgradeMode === 'parallel') return 'PARALLEL';
  return 'NORMAL';
}

---

## P0-3：page.tsx 的 JSX 未使用子组件

**问题**：page.tsx 导入了子组件，但 return 中仍然是 ~900 行内联代码。

**规格要求**：page.tsx 应为约 80 行的编排代码：

export default function WorkspaceHub() {
  const { data, isLoading, refresh } = useWorkspaceHubData();
  const personal = usePersonalWorkspace();
  const enterprise = useEnterpriseWorkspace();

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <UserGreeting user={data.user} />
      <PersonalWorkspaceCard ... />
      <EnterpriseWorkspaceList ... />
      {data.hasPending && <PendingSection ... />}
      <QuickActions ... />
      <ResourceOverview ... />
    </div>
  );
}

**实现**：将 page.tsx 中所有内联 JSX 替换为子组件调用。

---

## P0-4：内联模态框未独立为组件

**问题**：page.tsx 中有 4 个内联模态框，合计 ~800 行。

**规格要求**：创建 components/workspace-hub/modals/ 目录下的独立 Modal 组件：

| 文件 | 用途 |
|------|------|
| UpgradeModal.tsx | 升级为企业（3种模式选择，需要新建） |
| JoinEnterpriseModal.tsx | 邀请码加入（从内联提取） |
| ShareWorkspaceModal.tsx | 分享空间（移至workspace设置页） |
| DeleteConfirmModal.tsx | 合并删除+重置为通用组件 |

所有 Modal 使用 zg-modal-overlay / zg-modal / zg-modal-header / zg-modal-body / zg-modal-footer 样式。

---

## P0-5：删除/重置弹窗代码高度重复

**问题**：两个弹窗结构相同，仅文案不同，各 ~300 行重复代码。

**实现**：合并为通用 ConfirmModal，通过 props 控制：

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  confirmText: string;     // 用户需输入的确认词
  warnings: string[];
  onConfirm: (token?: string) => void;
  onCancel: () => void;
}

---

# P1 — 核心功能缺失

## P1-1：个人空间 7 种状态未实现

**问题**：目前只有一套 UI，没有根据 personalState 切换。

**规格要求**：PersonalWorkspaceCard 处理 7 种状态：

| 状态 | 标签 | 标签颜色 | 主按钮 |
|------|------|---------|--------|
| NORMAL | ● 正常 | emerald | 进入工作空间 |
| PARALLEL | ⬆ 并行 | orange | 进入工作空间 |
| REPLACE | ⬆ 替换 | red | 重新创建个人空间 |
| MIGRATE | ⬆ 迁移 | red | 重新创建个人空间 |
| DELETED | ● 已删除 | slate | 创建个人空间 |
| NONE | (无) | — | 创建个人空间 |

**实现指引**：

使用配置映射表：

const STATE_CONFIG = {
  NORMAL: { tagText: '● 正常', tagBg: '#ecfdf5', tagColor: '#059669', btnText: '进入工作空间', showUpgrade: true, menuItems: ['重命名', '重置', '删除'] },
  PARALLEL: { tagText: '⬆ 并行', tagBg: '#fff7ed', tagColor: '#ea580c', btnText: '进入工作空间', showUpgrade: false, menuItems: ['重命名', '重置', '删除'] },
  REPLACE: { tagText: '⬆ 替换', tagBg: '#fef2f2', tagColor: '#dc2626', btnText: '重新创建个人空间', showUpgrade: false, menuItems: ['查看企业空间'] },
  MIGRATE: { tagText: '⬆ 迁移', tagBg: '#fef2f2', tagColor: '#dc2626', btnText: '重新创建个人空间', showUpgrade: false, menuItems: ['查看企业空间'] },
  DELETED: { tagText: '● 已删除', tagBg: '#f1f5f9', tagColor: '#64748b', btnText: '创建个人空间', showUpgrade: false, menuItems: ['删除记录'] },
  NONE: { tagText: '', tagBg: 'transparent', tagColor: 'transparent', btnText: '创建个人空间', showUpgrade: false, menuItems: [] }
};

---

## P1-2：企业空间角色未区分

**问题**：所有企业空间卡片相同，未区分 Owner/Admin/Member。

**规格要求**：

const roleConfig = {
  OWNER: { badge: '拥有者', icon: 'crown', showManage: true, menuItems: ['成员管理', '组件库管理', '企业设置', '升级套餐', '使用统计'] },
  ADMIN: { badge: '管理员', icon: 'wrench', showManage: true, menuItems: ['邀请成员', '组件库管理'] },
  MEMBER: { badge: '成员', icon: 'user', showManage: false, menuItems: [] }
};

Owner 看到：[进入空间] [管理] [⋮ 5 项]
Admin 看到：[进入空间] [管理] [⋮ 2 项]
Member 看到：[进入空间] （无 ⋮ 菜单）

---

## P1-3：升级为企业弹窗缺失

**问题**：点击"升级为企业"后无响应。

**规格要求**：UpgradeModal 弹窗，三种模式选择：

并行模式 — 保留个人空间，同时创建新企业空间
替换模式 — 个人空间被企业替代，数据迁移（推荐）
迁移模式 — 个人数据迁移到已有企业空间

选择后调用 POST /api/workspace/create-enterprise，成功后更新 localStorage 标记。

---

## P1-4：资源概览区缺失

**问题**：页面底部没有 Token/存储/企业空间配额展示。

**实现**：ResourceOverview 组件，三个进度条，底部升级会员链接。

进度条样式：6px 高，圆角 3px，bg-slate-200 背景，blue 渐变填充。

---

## P1-5：快捷操作区缺失

**问题**：没有邀请码加入和组件市场入口。

**实现**：QuickActions 组件，两个按钮：邀请码加入 和 组件市场。使用 zg-btn-default 样式。

---

## P1-6：待处理区缺失

**问题**：有未处理邀请/申请时无提示。

**实现**：PendingSection 组件，条件渲染。有数据时显示 amber 色提示条。

---

## P1-7：用户欢迎条未组件化

**问题**：页面顶部用户信息是内联 HTML。

**实现**：提取为 UserGreeting 组件。显示用户名、会员等级、日期。

---

## P1-8：组件市场入口缺失

**实现**：在 QuickActions 中添加 组件市场 按钮，点击 router.push('/market')。

---

## P1-9：邀请码加入弹窗未独立

**实现**：提取为 JoinEnterpriseModal，包含输入、验证、预览、加入四个步骤。

---

## P1-10：删除空间逻辑应在设置页

**实现**：
1. 本页 ⋮ 菜单中"删除空间"只保留入口
2. 完整删除流程移至 /workspace/[id]/settings

---

# P2 — 优化级

## P2-1：用 zg-* CSS 类替换内联 Tailwind

大量使用 zg-btn-primary / zg-btn-default / zg-btn-danger / zg-card / zg-input 替代内联类。

## P2-2：合并删除/重置弹窗

创建通用 ConfirmModal，通过 props 控制文案。

## P2-3：删除 Header 中的管理后台入口

管理后台入口仅在全局 Header 用户下拉菜单中。

## P2-4：添加骨架屏加载状态

使用 zg-skeleton 类创建 PageSkeleton 组件。

## P2-5：ShareWorkspaceModal 移至设置页

## P2-6：二次身份验证 StepUpAuthModal 确认正确使用

## P2-7：成员管理跳转目标

Owner/Admin 点击成员管理跳转到 /workspace/[id]/members。

## P2-8：错误处理统一

统一使用 Toast 组件。

---

# 总修复步骤

## 第一阶段：修复 P0（让页面能编译）

步骤 1: 创建 5 个 hooks 文件
步骤 2: 创建 7 个子组件 + 4 个 Modal 组件
步骤 3: 重写 page.tsx 为编排模式（约 80 行）

验证：npm run build 通过。

## 第二阶段：实现 P1（让功能完整）

步骤 4: 实现 7 种个人空间状态
步骤 5: 实现 3 种企业空间角色
步骤 6: 实现 UpgradeModal
步骤 7: 实现 ResourceOverview + QuickActions + PendingSection
步骤 8: 实现 JoinEnterpriseModal

验证：页面所有功能可用。

## 第三阶段：优化 P2（提升质量）

步骤 9: 替换内联 Tailwind 为 zg-* 类
步骤 10: 合并删除/重置弹窗
步骤 11: 添加骨架屏加载
步骤 12: 整体审查

验证：代码质量和用户体验达标。

---

提示：将每个步骤的规格描述直接复制到 Antigravity IDE Agent 输入框。
建议每次只给一个步骤，完成后验证再给下一步。
每完成一步后运行 npm run build 确认无报错。