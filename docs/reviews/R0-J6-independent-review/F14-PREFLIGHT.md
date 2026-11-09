# 原路线F14当前代码预检（R0-K开工依据）

日期：2026-11-08。F13已通过后，仅为原F14准备下一批指令，不实施业务修复。原要求来源：`docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md` 第78行：解析可取消/隔离执行、页数/解压/CPU/内存限制、实例间共享并发和预算。

## 1. 当前实现与已存在的保护

| 当前入口/代码 | 已核实事实 |
| --- | --- |
| `src/app/api/studio/extract-text/route.ts:8` | 单账号并发3、每分钟20；均为模块内Map。认证前置 |
| 同文件:70–85 | buffer读入后才检查20MB；外层Promise.race在60秒返回空串，没有给底层传取消信号 |
| `src/lib/text-extract.ts:543` | WithTimeout创建AbortController，但await底层工作；中止信号不等于Office解析已结束 |
| 同文件:386–456 | 图片OCR已有worker terminate、延迟创建后发现取消再终止等实现，不能说所有解析都未取消 |
| 同文件:337–355 | 压缩包已有深度和每层前20个条目限制；但entry.getData前没有全任务实际解压字节总预算 |
| 同文件:86、123、178及旧格式分支 | OfficeParser、OOXML手工展开、SheetJS及旧Office还原在当前进程执行，未见统一硬终止边界 |
| `src/app/api/studio/handler.ts:58/3146/4601` | 文件读取、模型任务材料、资料上传已调用WithTimeout，但仍受底层非合作解析限制 |
| `src/app/api/workspace/assets/[assetId]/preview/route.ts:66` | 表格预览直接XLSX.read，Word预览直接mammoth.convertToHtml，文本兜底直接extractTextFromBuffer；这些重解析同样需纳入资源边界 |

预览的图片/PDF直接返回已鉴权文件URL分支不做服务端重解析，不要求为了本批改造为OCR或新格式能力。任务file模式已有100MB绝对上限和合同校验；不得把独立提取接口20MB误写成全系统既有上限。

## 2. 两条实际离线复现

使用当前route/helper，仅替换OfficeParser为可控延迟Promise、认证为离线用户并使用虚拟时钟，不读真实文件，不启动OCR，不连接数据库/模型/网络。

1. **WithTimeout没有终结Office工作，迟到文本被接收**：传10ms期限，推进到25ms，调用仍未结束、解析仍活跃；放行解析后返回正常文本。见F14-preflight-evidence.json的office-timeout-not-enforced。
2. **响应超时后旧解析仍在、名额先释放**：同时启动3个独立提取请求；推进60001ms，三个请求均400空文本，底层3个解析仍活跃；再发同账号第4笔，底层活跃数变为4，突破声明的3个并发。最终主动结束替身，所有Promise收回。见route-timeout-releases-slot-before-parser-stops。

两条均独立执行并通过现象确认，结果见F14-vitest-results.json。此处“通过”表示原F14缺陷被复现，不是修复验收通过。没有用真实超大文件或压缩炸弹试压。

## 3. 共享资源与部署事实

当前解析入口未见跨实例共享租约/计数。仓库以MySQL/Prisma为主，没有现成解析租约模型；registrylock是模型注册表的事务串行锁，不能挪作长期解析锁；退款恢复有claimToken/leaseUntil模式可参考，但不得把解析记录写入退款或资金表。

下一批若必须新增解析专用的最小共享准入模型和离线迁移文件，属于F14实现范围；真实迁移、生产参数和部署验证尚未授权。不能用本机Map或单进程队列声称解决多实例，也不能自动假定Redis已经部署。

当前核查的解析入口未见供应商模型API扣费调用。本批风险按CPU、内存、解压/OCR和并发占用定性，不把本地解析夸称为已证明的供应商收费漏洞。

## 4. 下一批四组完成定义

- K01：统一执行边界能终止非合作重解析；响应超时与资源回收一致，迟到结果不再成功。
- K02：请求、文件与嵌套解析共享有限预算，涵盖输入、解压、页/图像/表格处理、输出、时间和内存。
- K03：实际入口共享跨实例原子准入和容量；只有终止确认后才释放，旧执行者不能释放新租约；未就绪诚实阻断。
- K04：所有既有重解析入口接线、权限与F13清理保持、错误可区分、正常小文件可用，并提交隔离生命周期证据。

详细范围、测试及停止条件以IDE-R0-K-PROMPT.md为准。不开新产品功能，不进入F15/F16，不修改费用或模型策略。
