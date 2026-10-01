# 知阁·舟坊 通用组件合同生产落地与架构规范 (PRODUCTION_READY)

> **设计基准版本**: v1.0.0 (通用组件合同生产闭环)  
> **状态**: `PRODUCTION_READY`（已完成增量数据库迁移、仓储并发 CAS、Studio 执行唯一真源、不可变快照、防泄露隔离与全量测试验收）  
> **核心目标**: 构建支撑系统 60 个组件及未来无限扩展的不可变版本化组件合同体系，解除试点组件特判与厂商绑定，彻底消除双真源与合同泄露。

---

## 1. 架构定位与核心业务闭环

### 1.1 核心职责与边界划分
| 领域模块 | 核心职责 | 与组件合同的边界 |
|---|---|---|
| **组件合同领域 (`component-contract`)** | 声明业务输入、多步分析需求、成果物结构、渲染器、**所需模型能力** | 只声明能力枚举（如 `TEXT_GENERATION`），**严禁出现厂商/模型名/API Key** |
| **模型注册表 (`model-registry`)** | 管理真实供应商 (`modelprovider`) 与部署 (`modeldeployment`) | 负责承接合同声明的能力要求，进行能力匹配和底层路由 |
| **空间模型策略 (`workspace_model_policy`)** | 企业/团队空间指定的模型白名单与路由策略 | 负责在合同能力要求范围内，应用空间维度的调度策略 |
| **模型计费核心 (`model-pricing`)** | 记录模型基准售价与成本价 | 负责计算 Token 对应的法币或算力点；合同中仅声明计费模式，**绝不允许成本价充当售价** |
| **工作台 Studio (`/api/studio`)** | 组件执行引擎，解析输入、调用模型、扣费结算、落库产物 | **唯一真源直连合同仓储**，彻底废除 `detail.executionProfile`，固化不可变执行快照 |

### 1.2 架构决策：不可变独立版本表 + 主表外键引用
1. **独立版本实体 `component_contract`**：承载特定版本的标准合同（输入约束、多步骤编排、成果物结构、Prompt 模板、质量与计费策略）；
2. **主表外键指针 `component_catalog.activeContractId`**：指向当前线上激活版本，原子级切换与回滚，外键配置 `onDelete: Restrict, onUpdate: Restrict` 防误删；
3. **不可变执行快照 `component_task.config.contractSnapshot`**：任务发起时锁定执行时刻的合同完整快照，历史重试与成果物审计永远沿用执行当时的合同，新旧版本互不干扰。

---

## 2. 数据库物理模型与增量迁移

### 2.1 合同版本表：`component_contract` (`componentcontract`)
```prisma
model componentcontract {
  id              String            @id @default(uuid())
  componentId     String            @map("component_id")
  contractVersion String            @map("contract_version")
  lifecycle       String            @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED
  description     String?           @db.VarChar(255)
  contract        Json              // 经过 validateComponentContract 校验的标准合同 JSON
  publishedAt     DateTime?         @map("published_at")
  publishedBy     String?           @map("published_by") // 发布人 userId (不可变操作者快照)
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")

  component       componentcatalog  @relation("CatalogContracts", fields: [componentId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  activeForCatalogs componentcatalog[] @relation("ActiveContract")

  @@unique([componentId, contractVersion], map: "ComponentContract_componentId_contractVersion_key")
  @@index([componentId, lifecycle], map: "ComponentContract_componentId_lifecycle_idx")
  @@map("component_contract")
}
```

### 2.2 目录主表增量：`component_catalog` (`componentcatalog`)
```prisma
model componentcatalog {
  // ... 原有基础展示字段保持不变 ...
  activeContractId String?            @map("active_contract_id")
  activeContract   componentcontract? @relation("ActiveContract", fields: [activeContractId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  contracts        componentcontract[] @relation("CatalogContracts")
}
```

### 2.3 增量迁移记录
- **迁移 61 (`20260920220000_add_active_contract_id`)**: 在 `component_catalog` 增量添加 `active_contract_id`，创建外键关联 `component_contract.id`，索引与外键均约束为 `RESTRICT`。
- **迁移 62 (`20260920223000_seed_c07_active_contract`)**: 标准 SQL 增量初始化 `C07`（产品需求文档生成器）首个 `1.0.0` PUBLISHED 标准合同，并将 `component_catalog.active_contract_id` 原子绑定，满足系统展示与运行全量落库数据查询标准。

---

## 3. 核心机制设计与并发防御

### 3.1 生命周期 CAS 与不可变防篡改
```
[创建草稿] DRAFT ──── CAS(updateDraft) ────> DRAFT (仅限草稿可编辑)
               │
               ├──── CAS(publishContract) ───> PUBLISHED (内容永久只读冻结)
               │                                      │
               │                                      ├──── 原子绑定/切换 activeContractId
               │                                      │
               └──── CAS(archiveContract) ────> ARCHIVED (废弃归档，幂等安全)
```
1. **DRAFT 可变编辑**：`updateDraft` 必须携带 `where: { id, lifecycle: "DRAFT" }`，并发冲突即刻拦截；
2. **PUBLISHED 绝对只读**：一旦由 DRAFT 转为 PUBLISHED，服务层与数据库彻底封死写入口，严禁原地修改；若要升级，必须由管理员基于当前版本或新内容创建新版本；
3. **安全归档与防失活保护**：
   - 严禁归档当前处于激活状态的版本（抛出 409 `ACTIVE_CONTRACT_CANNOT_ARCHIVE`）；
   - 重复归档返回幂等成功；
4. **并发发布竞态**：高并发（如 10 个线程同时发布同一草稿）严格保证且仅有 1 次成功，其余均受 CAS 条件更新保护拦截。

### 3.2 审计日志同事务强保障
- 发布与归档操作必须在 `prisma.$transaction` 内与 `operationlog` 强绑定；
- 若操作人外键校验失败或审计写入异常，全事务强制回滚，生命周期与合同内容保持不变，杜绝“吞掉异常导致无审计变更”的安全漏洞。

### 3.3 Studio 运行时唯一真源
- **双真源消除**：彻底废除 `comp.detail.executionProfile` 及其模型绑定字段；
- **唯一真源路由**：`/api/studio` 执行时直接调用仓储函数 `getActiveContractSnapshot(componentId)`，仅允许执行处于 `PUBLISHED` 且被 `activeContractId` 绑定的生效合同；
- **不可变快照落库**：
  - 新任务执行：取当前激活合同快照，深拷贝固化于 `component_task.config.contractSnapshot` 及 `result.contractVersion`；
  - 任务重试执行：严格读取历史任务已固化的 `historicalTask.config.contractSnapshot`，确保历史任务即便在组件升级新版本后也能 100% 确定性重试；
  - 拦截未激活、草稿或归档状态：统一抛出规范 HTTP 错误（404/409），严禁模拟假数据或降级假执行。

### 3.4 敏感信息防泄露与 RBAC 权限隔离
1. **客户端查询接口 `/api/components/[id]/contract-snapshot`**：
   - **普通用户/匿名访问**：白名单清洗机制，仅输出展示所需的 `input.inputMode`、`input.textConstraints`、`input.fileConstraints`、`output.renderers` 等公开字段；严禁下发 `promptTemplate`、`pipeline`、`qualityPolicy`、内部规则与模型策略。
   - **平台超级管理员**：必须持有 `system:manage` 核心管理权限，方可查看完整内部执行快照；
2. **管理端 API 权限矩阵**：
   - `/api/admin/components/contracts*` 所有写操作（创建草稿、编辑草稿、发布、激活、归档）全部强制校验 `system:manage` 权限；普通用户或无权管理员一律 403 阻断。

---

## 4. 自动化测试与工程验证矩阵

| 测试套件 | 验证范围 | 测试用例数 | 结果 |
|---|---|---|---|
| `component-contract-pure.test.ts` | 纯领域输入/输出校验、多步骤编排、白名单、模型字段拒绝、敏感信息过滤 | 29 | **100% PASS** |
| `component-contract-repository.test.ts` | 数据库持久化、CAS 并发防篡改、唯一键 P2002 映射、真实外键审计回滚 | 9 | **100% PASS** |
| `contracts-route.test.ts` | 管理员 API 路由鉴权、RBAC 隔离、草稿/发布/归档闭环、模型绑定字段阻断 | 4 | **100% PASS** |
| `studio-contract-integration.test.ts` | Studio 唯一真源执行、不可变快照重试、新老冲突裁决、反泄露白名单清洗 | 6 | **100% PASS** |
| `route.test.ts` (Studio 原有套件) | 真实模型调用、multipart 文件与 MIME 双向匹配、Token 预扣与退款幂等 | 7 | **100% PASS** |

