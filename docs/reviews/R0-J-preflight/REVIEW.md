# 原方案 F13 / R0-J 实施前代码核查

日期：2026-11-07。依据：2026-11-05 原重构方案 F13。R0-I2 归档补交已独立通过；本文件是下一批范围核查，不是 F13 修复验收。本助手未修改业务代码。

## 同一个业务目标

用户在空间上传资料或知识附件时，使用已授权的存储容量；新增占用不能绕过上限。上传失败应有明确结果，删除成功后容量准确释放，软移除/可恢复资料仍占实际空间。平台不会因无限制上传、漏记、误释放或孤儿文件持续承担未受控存储成本。本批不新增存储收费套餐或承诺整体盈利。

## 当前事实

| 问题 | 代码证据 | 离线复现/判断 |
| --- | --- | --- |
| 配额缺失、0 和非法负数被当成不限制 | storage-quota.ts:33—35 | 实际 helper 在配额缺失、limit=0、limit=-2 时均放行；已有明确 -1 作为正向对照 |
| 校验和用量增加分离 | handler.ts:4531、4622；6407、6424 | 额度 100，两次各 60 同时检查后均可增加，最终 120 |
| 删除读取旧值后绝对覆盖 | storage-quota.ts:69—78 | 用量 100 并发扣 30 和 40，实际剩 60，应剩 30 |
| 增减失败被吞掉 | storage-quota.ts:56—58、79—81 | 合成更新失败时两种函数仍正常返回，不能据此声称记账成功 |
| BigInt 转 Number 会丢精度 | storage-quota.ts:34、36、74 | 大于安全整数的边界夹具出现实际超限仍通过；字节判定应保留 BigInt |
| 普通上传失败链可能留文件/漏占用 | handler.ts:4538 先保存，4600 建文档，4622 记账 | 静态：落存储、建记录和记账没有一个可恢复的占用闭环；后续异常/提前返回没有统一清理 |
| JSON 文本请求可提供 fileSize | handler.ts:4555、4589—4592、4621—4622 | 静态：没有物理文件也可能按客户端声称的 fileSize 入账；与本服务“只计真实物理文件”口径冲突 |
| 知识附件使用另一套直接写盘流程 | handler.ts:6415—6443 | 静态：写文件、增加用量、建文档分离，数据库失败后未闭合；父条目空间也需与记账空间一致 |
| 文件保存与读取/删除的本地路径不一致，删除吞异常 | file-store.ts:buildObjectKey/saveAssetFile/toObjectKey/deleteAssetFile | 实际 helper 配合内存 fs：保存至 uploads/assets/assets/w1，读取/删除定位 uploads/assets/w1；读失败，删除返回但文件仍在 |
| 某些批量/清空入口能绕过统一出账 | handler.ts:5727—5752；workspace/clear-data/route.ts:95—111 | 静态：batch_delete_assets 直接删文档；clear-data 删除记录后删文件并直接归零，未验证每个对象已清除、也未处理并发上传 |

其中原子额度与删除失真是原 F13 明确范围；真实文件字节来源、路径一致、失败与旁路清理是保证该范围闭环必须核对的现有路径，不另外扩展为存储平台重建。

普通 upload_doc 分支的空间归属检查位于文件保存之后（handler.ts:4566—4569），应在同一上传改动中前置鉴权再发生存储副作用。知识附件父文档与 attWsId 必须一致；不能把其他空间的容量和文件记录挂在此父条目下。本轮没有做真实越权写入，也不把静态风险表述为已经发生线上攻击。

## 已确认的入口范围

- `POST /api/studio?action=upload_doc`：multipart 物理文件与 JSON 文本兼容分支。
- `POST /api/studio?action=upload_knowledge_attachment`：知识附件。
- Studio 的 `remove_asset` 私密硬删除、`batch_remove_assets` 私密硬删除、`delete_removal_record` 彻底删除。
- `batch_delete_assets`：现有批量直接删除，必须避免绕过权限、文件与占用处理。
- `POST /api/workspace/clear-data`：仅修物理文件删除/占用归零旁路与上传竞争，不改任务、组件、默认初始化或审计清空等其他重置策略。
- `restore_asset`、`restore_knowledge`、公开资料软移除和 `delete_knowledge/deleteDocument` 的软删除：只回归保证不错误释放/重复增加容量，不改既有审核治理规则。

实际模型：workspacequota.storageUsed/storageLimit 为 BigInt 字节；document.fileSize 为可空 Int、filePath 为相对路径。旧数据可空，不可把未知占用默认为已释放；套餐配置 maxStorage 存在 MB/字节的不同口径，本批保留既有套餐和授权数值，不重做权益体系。

## 复现证据和边界

本人运行：`vitest run --no-color --config docs/reviews/R0-J-preflight/vitest.preflight.config.ts`，1 文件 10 项通过，退出 0。其中 9 项是当前缺陷复现，1 项是已有明确 -1 的正向对照；不是修复验收。完整观察见 storage-facts.json。helper 调用真实代码，Prisma/fs 使用内存替身，没有真实数据库、磁盘上传或云对象操作。

上述上传/删除 handler 顺序与批量/重置属于源码检查，尚未做 handler 级运行验证。实际部署使用本地还是 S3、本地历史对象位置、库内真实差异和磁盘占用均未查询，因此不声称线上已超额或文件已丢失。实施者须为这些路径补实际 handler + IO 夹具证据。

## 冻结边界与完成门槛

本批只解决 F13 的现有存储准入、计量和可恢复删除，不接 F14 解析限流/OCR 预算、F15 短信、F16 直充，不改 F11/F12 收费门禁、点数、定价或支付。优先复用现有模型和模式；必要的存储操作持久化只限本闭环，离线结构草案与迁移状态必须明示，禁止在请求中自动 DDL。

验收必须同时覆盖两条真实上传入口、原子竞争、失败/重试/重复删除、物理路径、清空旁路、用户错误呈现和只读对账；不能只改 quota helper 就声称 F13 完成。具体逐项标准见 IDE-R0-J-PROMPT.md。
