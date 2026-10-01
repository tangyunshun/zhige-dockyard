# 知阁·舟坊 通用组件平台能力盘点矩阵 (Component Capability Matrix)

> **确定性基准标识**: `STATIC_AUDIT_DETERMINISTIC_BENCHMARK`  
> **数据源**: 生产数据库 `component_catalog` 表全量只读扫描与生产源码动态证据交叉校验  
> **真实组件总数**: **88** 项（无硬编码数量，依据真实数据库行数分析）  

---

## 1. 核心统计与审计置信度概览

| 统计维度 | 数量 | 占比 | 审计证据说明 |
|---|:---:|:---:|---|
| **组件总数** | **88** | 100.0% | 数据库实际组件行数 |
| **已启用组件** | **88** | 100.0% | `isPublished = true` |
| **真实模型执行链** | **1** | 1.1% | 具备 `REAL_MODEL` 执行合同与适配链路 |
| **组件特判分支** | **1** | 1.1% | 动态扫描命中源码专有分支 |
| **OBSERVED 完全观测组件** | **1** | 1.1% | 具备直接数据库与源码引用证据 |
| **INFERRED 结构化推断组件** | **6** | 6.8% | 依据输入输出模式完成结构推断 |
| **UNKNOWN 证据缺失组件** | **81** | 92.0% | 关键字段缺失，严格保留 UNKNOWN |

---

## 2. 建议组件原型分布 (基于证据归类)

| 建议原型 | 组件数量 | 占比 |
|---|:---:|:---:|
| `TEXT_ONLY` | 67 | 76.1% |
| `TEXT_AND_FILES` | 13 | 14.8% |
| `SINGLE_FILE` | 6 | 6.8% |
| `TABLE_OR_SCORE_OUTPUT` | 2 | 2.3% |

---

## 3. 全量组件能力审计明细

| ID | 组件名称 | 观测输入原型 | 建议演进原型 | 执行链状态 | 特判状态 | 主要缺失能力 |
|---|---|:---:|:---:|:---:|:---:|---|
| **API_TEST_C_0640716b** | API测试专用组件_API_TEST_C_0640716b | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_0eabdaf5** | API测试专用组件_API_TEST_C_0eabdaf5 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_2c62f60d** | API测试专用组件_API_TEST_C_2c62f60d | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_37139576** | API测试专用组件_API_TEST_C_37139576 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **API_TEST_C_7576d2f3** | API测试专用组件_API_TEST_C_7576d2f3 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_7a28eb2b** | API测试专用组件_API_TEST_C_7a28eb2b | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_804b8f6f** | API测试专用组件_API_TEST_C_804b8f6f | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_a77c8c9e** | API测试专用组件_API_TEST_C_a77c8c9e | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **API_TEST_C_d2f4af91** | API测试专用组件_API_TEST_C_d2f4af91 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C01** | 招标文件智能解析 | `SINGLE_FILE` | `TABLE_OR_SCORE_OUTPUT` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C02** | 方案安全合规体检 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C03** | 竞品优劣深度对比 | `SINGLE_FILE` | `TABLE_OR_SCORE_OUTPUT` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C04** | 工作汇报白话文翻译 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C05** | 开发工时与成本估算 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C06** | 项目投资回报ROI分析 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C07** | 会议纪要自动转需求(PRD) | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [OBSERVED] 真实模型 | [OBSERVED] 有特判 | 存在遗留字段 component_catalog.detail.executionProfile（旧路径已退出，需清理） |
| **C08** | 业务异常与极端场景补全 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C09** | 客户差评自动聚类与提单 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C10** | 虚拟模拟测试数据生成 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C11** | 后端数据接口自动开发 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C12** | 接口数据关联设计 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C13** | 即时消息WebSocket开发 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C14** | 高并发排队消息队列集成 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C15** | 高速数据内存提速设计 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C16** | 登录权限与安全卡点 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C17** | SQL数据库查询语句生成 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C18** | 数据表结构与关系图设计 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C19** | 慢 SQL 查询自动诊断提速 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C20** | 跨数据库无缝导入与平移 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C21** | 网页界面积木生成(React) | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C22** | 网页界面积木生成(Vue) | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C23** | 多端屏幕自适应排版适配 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C24** | 炫酷数据图表一键生成 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C25** | 大厂科技感数据监控大屏 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C26** | 逻辑单元测试用例生成 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C27** | 接口自动调试与并发测试 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C28** | 服务器压力承受测试 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C29** | 代码质量与垃圾代码扫描 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C30** | 模拟真人点按界面测试 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C31** | 应用环境一键打包(Docker) | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C32** | 服务器集群自动扩容与调度 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C33** | 一键打包发布流水线 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C34** | 服务器健康监控与告警 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C35** | 多服务器运行日志大盘 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C36** | 数据库防黑客窃取扫描 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C37** | 网页防非法木马与广告植入 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C38** | 三方开源插件漏洞检测 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C39** | 国家等保2.0合规自查 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C40** | 手机号身份证智能打码 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C41** | 项目任务按工期逐步分解(WBS) | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C42** | 项目进度时间表甘特图 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C43** | 项目潜在风险防范预案 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C44** | 团队排班与闲置优化 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C45** | 一键项目结项报告 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C46** | 开发对接说明书自动生成 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C47** | 代码白话文翻译批注 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C48** | 空间内部资料全文搜索 | `SINGLE_FILE` | `SINGLE_FILE` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C49** | 研发专属智能问答客服 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C50** | 资深老手代码审查报告 | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C51** | 经典设计模式与架构规约推荐 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C52** | 软件系统底层技术选型建议 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C53** | 历史教训与团队避坑指南SOP | `TEXT_AND_FILES` | `TEXT_AND_FILES` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C54** | 智能效能分析引擎 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C55** | 自动部署与构建组件 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C56** | 架构代码生成器 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C57** | 代码安全审计工具 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C58** | 需求文档解析组件 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C59** | 自动化测试套件 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **C60** | 后端核心接口组件 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_024524b3f2** | 自动化测试组件_TEST_COMP_024524b3f2 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_098175a05d** | 自动化测试组件_TEST_COMP_098175a05d | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_0d88437722** | 自动化测试组件_TEST_COMP_0d88437722 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_22dd5bd2d0** | 自动化测试组件_TEST_COMP_22dd5bd2d0 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **TEST_COMP_487fa34ef7** | 自动化测试组件_TEST_COMP_487fa34ef7 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_5198f82660** | 自动化测试组件_TEST_COMP_5198f82660 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_577a3006f3** | 自动化测试组件_TEST_COMP_577a3006f3 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_7402731683** | 自动化测试组件_TEST_COMP_7402731683 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **TEST_COMP_8866cd471a** | 自动化测试组件_TEST_COMP_8866cd471a | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_9446724f76** | 自动化测试组件_TEST_COMP_9446724f76 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **TEST_COMP_a715084536** | 自动化测试组件_TEST_COMP_a715084536 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **TEST_COMP_aa7688ed49** | 自动化测试组件_TEST_COMP_aa7688ed49 | `TEXT_ONLY` | `TEXT_ONLY` | [OBSERVED] 非真实模型 | [INFERRED] 无特判 | 无 |
| **TEST_COMP_aaf66f34d2** | 自动化测试组件_TEST_COMP_aaf66f34d2 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_c4d5217f11** | 自动化测试组件_TEST_COMP_c4d5217f11 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_d391791a45** | 自动化测试组件_TEST_COMP_d391791a45 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_d857b4aea1** | 自动化测试组件_TEST_COMP_d857b4aea1 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_e1c9d88f23** | 自动化测试组件_TEST_COMP_e1c9d88f23 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_f39091fd91** | 自动化测试组件_TEST_COMP_f39091fd91 | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |
| **TEST_COMP_f763e67aba** | 自动化测试组件_TEST_COMP_f763e67aba | `TEXT_ONLY` | `TEXT_ONLY` | [UNKNOWN] 未配置(缺合同) | [INFERRED] 无特判 | 缺少独立执行合同 (无激活 PUBLISHED 合同)；Prompt 模板未独立版本化 |

