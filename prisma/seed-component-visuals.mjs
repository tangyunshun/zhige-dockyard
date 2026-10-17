/**
 * 组件能力可视化图表种子：为每个组件按其能力与价值配置专属图表（detail.visual）。
 * - 全部数据写入数据库 component_catalog.detail.visual，前端按规格渲染，不在代码里写死组件内容
 * - 所有数字均取自各组件既有文案（roiText / outputMock / description）中的真实业务预估，禁止编造
 * - 图表类型：flow 多节点流程图 / compare 前后对比条形图 / metrics 核心指标卡 / timeline 阶段时间线
 *
 * 运行：node prisma/seed-component-visuals.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const VISUALS = {
  C01: {
    kind: "compare",
    title: "标书解析提效对比",
    bars: [{ label: "标书通读与偏离核对", before: 180, after: 0.5, beforeText: "3 小时", afterText: "30 秒" }],
    caption: "人工通读 3 小时的核对工作，本组件 30 秒输出结构化偏离表（含 5 项匹配 / 2 项定制 / 1 项无法满足）。",
  },
  C02: {
    kind: "compare",
    title: "合规审查提效对比",
    bars: [{ label: "方案安全合规审查", before: 960, after: 2, beforeText: "2 天", afterText: "2 分钟" }],
    caption: "资深专家 2 天的审查量，2 分钟完成并附政策对照与修改方案。",
  },
  C03: {
    kind: "metrics",
    title: "竞品对比输出全景",
    metrics: [
      { value: "8 项", label: "我方优势", hint: "自动提炼可主打卖点" },
      { value: "3 项", label: "我方劣势", hint: "提前准备应答口径" },
      { value: "5 项", label: "双方持平", hint: "中立呈现避免夸大" },
    ],
    caption: "人工对比整理需 1 整天，多维分析表 1 分钟自动生成。",
  },
  C04: {
    kind: "flow",
    title: "一份方案 · 两种汇报口径",
    nodes: [
      { tag: "输入", title: "原始技术方案", desc: "架构图与实现逻辑" },
      { title: "识别汇报对象", desc: "高管 / 技术 / 客户" },
      { tag: "输出", title: "高管版汇报", desc: "突出商业价值与省钱亮点" },
      { tag: "输出", title: "技术版汇报", desc: "保留代码与架构逻辑" },
    ],
    caption: "无需手写多份材料，一份方案自动适配各种汇报场合。",
  },
  C05: {
    kind: "metrics",
    title: "成本测算输出示例",
    metrics: [
      { value: "45 万", label: "人力成本", hint: "按模块清单估算" },
      { value: "12 万", label: "服务器成本", hint: "含资源规格建议" },
      { value: "35%", label: "预估整体毛利", hint: "辅助报价决策" },
    ],
    caption: "人工精细化测算需半天，算法推荐 2 分钟出结果（以上为示例口径）。",
  },
  C06: {
    kind: "flow",
    title: "ROI 分析流水线",
    nodes: [
      { tag: "输入", title: "收益与成本数据", desc: "上线收益 + 人工成本" },
      { title: "投入产出建模", desc: "回收周期与净利测算" },
      { tag: "输出", title: "ROI 评估报告", desc: "如：6 个月回收、净增 120 万" },
    ],
    caption: "用数据量化研发收益，辅助立项与投资决策。",
  },
  C07: {
    kind: "compare",
    title: "PRD 编写提效对比",
    bars: [{ label: "会议纪要整理为 PRD", before: 240, after: 1, beforeText: "半天", afterText: "1 分钟" }],
    caption: "杂乱纪要一键变格式化 PRD：核心流程、用户故事、功能点与测试指标。",
  },
  C08: {
    kind: "flow",
    title: "异常场景推演链路",
    nodes: [
      { tag: "输入", title: "正常主流程", desc: "如：选商品 → 发起支付" },
      { title: "边界与异常推演", desc: "库存不足 / 并发超卖 / 支付超时…" },
      { tag: "输出", title: "异常应对清单", desc: "12 种场景的处置提示" },
    ],
    caption: "预防 60% 以上因设计遗漏引发的线上故障。",
  },
  C09: {
    kind: "compare",
    title: "差评处理提效对比",
    bars: [{ label: "海量差评归类定位", before: 240, after: 0.5, beforeText: "4 小时", afterText: "30 秒" }],
    caption: "聚类出核心痛点并自动向研发提缺陷单，如数据库超时类问题直接定位。",
  },
  C10: {
    kind: "metrics",
    title: "模拟数据生成能力",
    metrics: [
      { value: "10,000 条", label: "秒级批量生成", hint: "姓名 / 手机号 / 交易记录" },
      { value: "0", label: "真实敏感数据使用", hint: "杜绝生产数据泄密风险" },
      { value: "多行业", label: "行业模板", hint: "金融 / 电商等一键套用" },
    ],
    caption: "测试数据逼真且脱敏，摆脱手工造数与泄密两难。",
  },
  C11: {
    kind: "compare",
    title: "接口开发提效对比",
    bars: [{ label: "标准数据接口开发", before: 120, after: 0.17, beforeText: "2 小时", afterText: "10 秒" }],
    caption: "产出含字段校验、错误提示与注解的 Node.js / Java 接口代码。",
  },
  C12: {
    kind: "flow",
    title: "表关系设计流水线",
    nodes: [
      { tag: "输入", title: "口语化关系描述", desc: "如：用户有多个订单" },
      { title: "关系解析", desc: "实体 / 外键 / 基数识别" },
      { title: "DDL 生成", desc: "建表语句 + Resolver 骨架" },
      { tag: "输出", title: "ER 拓扑图", desc: "关联关系直观呈现" },
    ],
    caption: "复杂表关系梳理从 1 天缩短至 1 分钟。",
  },
  C13: {
    kind: "metrics",
    title: "即时通信开发收益",
    metrics: [
      { value: "-70%", label: "底层模块工期", hint: "网络通信核心开发提效" },
      { value: "内置", label: "心跳健康监测", hint: "连接活性自动探测" },
      { value: "内置", label: "断线自动重连", hint: "弱网环境不掉线" },
    ],
    caption: "多人白板、协同文档等实时场景的服务端 + 客户端代码一步到位。",
  },
  C14: {
    kind: "compare",
    title: "消息队列搭建提效对比",
    bars: [{ label: "高并发排队模块搭建", before: 1440, after: 5, beforeText: "3 天", afterText: "5 分钟" }],
    caption: "生产者 / 消费者 / 失败重试 / 死信机制一并生成。",
  },
  C15: {
    kind: "flow",
    title: "缓存方案设计链路",
    nodes: [
      { tag: "输入", title: "QPS 与更新策略", desc: "接口频次 + 数据时效" },
      { title: "缓存方案设计", desc: "Key 规范 / 过期时间" },
      { tag: "输出", title: "防穿透设计", desc: "数据库直连查询减少 80%" },
    ],
    caption: "直击高并发卡顿，直连查询减少 80%。",
  },
  C17: {
    kind: "compare",
    title: "SQL 编写提效对比",
    bars: [{ label: "多表联查 SQL 编写", before: 30, after: 0.08, beforeText: "半小时", afterText: "5 秒" }],
    caption: "输出优化后的 SQL，并提示应加索引的字段防慢查询。",
  },
  C18: {
    kind: "flow",
    title: "表结构设计流水线",
    nodes: [
      { tag: "输入", title: "实体属性描述", desc: "主键 / 标题 / 分类 / 库存" },
      { title: "DDL 生成", desc: "标准建表语句" },
      { title: "外键关系梳理", desc: "消除冗余字段" },
      { tag: "输出", title: "实体关系图", desc: "清晰可视化" },
    ],
    caption: "表结构梳理从半天降至 2 分钟。",
  },
  C19: {
    kind: "flow",
    title: "慢 SQL 诊断链路",
    nodes: [
      { tag: "输入", title: "慢查询日志 / EXPLAIN", desc: "粘贴执行结果" },
      { title: "瓶颈诊断", desc: "如：全表扫描定位" },
      { tag: "输出", title: "整改方案", desc: "建索引建议 + SQL 重写" },
    ],
    caption: "慢查询耗时平均降低 90% 以上，减轻服务器压力。",
  },
  C20: {
    kind: "compare",
    title: "数据库迁移提效对比",
    bars: [{ label: "跨库方言改写", before: 14400, after: 480, beforeText: "1 个月", afterText: "1 天" }],
    caption: "DDL 自动转换特殊函数与时间类型，完全兼容目标库。",
  },
  C21: {
    kind: "compare",
    title: "界面开发提效对比",
    bars: [{ label: "基础交互页面开发", before: 120, after: 0.5, beforeText: "2 小时", afterText: "30 秒" }],
    caption: "输出含响应式布局、状态绑定与单测用例的 React 源码。",
  },
  C22: {
    kind: "flow",
    title: "Vue 组件生成链路",
    nodes: [
      { tag: "输入", title: "界面需求描述", desc: "交互与数据结构" },
      { title: "组件代码生成", desc: "Vue3 组合式 API" },
      { tag: "输出", title: "可运行组件", desc: "含样式与事件绑定" },
    ],
    caption: "描述即代码，Vue3 组件一步生成。",
  },
  C23: {
    kind: "flow",
    title: "响应式适配链路",
    nodes: [
      { tag: "输入", title: "布局意图 / 基础样式", desc: "设计稿或现有排版" },
      { title: "断点自动计算", desc: "多端宽度策略" },
      { tag: "输出", title: "响应式 CSS", desc: "Tailwind 断点样式" },
    ],
    caption: "不用反复手工调宽度，自适应排版效率提升 10 倍以上。",
  },
  C24: {
    kind: "compare",
    title: "图表配置提效对比",
    bars: [{ label: "ECharts 调试配置", before: 240, after: 1, beforeText: "半天", afterText: "1 分钟" }],
    caption: "输出含渐变配色、自动缩放与提示框的图表配置源码。",
  },
  C25: {
    kind: "metrics",
    title: "监控大屏搭建收益",
    metrics: [
      { value: "5 分钟", label: "本组件搭建主体", hint: "网格排版 + 指标定义" },
      { value: "15 天", label: "传统人工周期", hint: "从零手写大屏工程" },
      { value: "内置", label: "轮询自动刷新", hint: "数据实时更新" },
    ],
    caption: "炫酷边框特效、自适应拉伸的大屏工程一键生成。",
  },
  C26: {
    kind: "metrics",
    title: "单元测试生成能力",
    metrics: [
      { value: ">80%", label: "测试覆盖率", hint: "边界 + 异常输入覆盖" },
      { value: "20 倍+", label: "用例编写效率", hint: "粘贴逻辑即出用例" },
      { value: "2 类", label: "用例维度", hint: "边界测试 / 异常模拟" },
    ],
    caption: "逻辑漏洞防微杜渐，测试代码一键补齐。",
  },
  C27: {
    kind: "flow",
    title: "接口测试生成链路",
    nodes: [
      { tag: "输入", title: "接口定义文档", desc: "Swagger / OpenAPI" },
      { title: "用例集合生成", desc: "正常 + 异常参数" },
      { title: "越权与超时检查", desc: "安全与性能兼顾" },
      { tag: "输出", title: "10 秒校验", desc: "免手工逐个配置" },
    ],
    caption: "接口文档进，全套测试用例出。",
  },
  C28: {
    kind: "flow",
    title: "压力测试执行链路",
    nodes: [
      { tag: "输入", title: "目标 URL + 并发数", desc: "设定最大模拟人数" },
      { title: "阶梯加压", desc: "人数递增模拟真实峰值" },
      { tag: "输出", title: "耗时分布图", desc: "并发极限一目了然" },
    ],
    caption: "提早测出并发瓶颈，避免大促上线服务器崩溃。",
  },
  C29: {
    kind: "flow",
    title: "代码体检链路",
    nodes: [
      { tag: "输入", title: "源码 / 扫描阈值", desc: "整段粘贴即可" },
      { title: "静态扫描", desc: "Bug / 安全 / 重复代码" },
      { tag: "输出", title: "体检大盘", desc: "问题个数 + 精确定位" },
    ],
    caption: "隐藏漏洞无处遁形，人工审查效率提升 5 倍。",
  },
  C30: {
    kind: "flow",
    title: "界面自动化回归链路",
    nodes: [
      { tag: "输入", title: "白话操作步骤", desc: "点按流程 + 预期显示" },
      { title: "脚本生成", desc: "Playwright / Cypress" },
      { title: "自动寻素点按", desc: "无需手写选择器" },
      { tag: "输出", title: "回归报告", desc: "2 分钟跑通全部路径" },
    ],
    caption: "新版本上线前免人工逐页点按，自动回归。",
  },
  C31: {
    kind: "flow",
    title: "容器化打包链路",
    nodes: [
      { tag: "输入", title: "语言 + 系统依赖", desc: "Node.js / Java 等" },
      { title: "Dockerfile 生成", desc: "标准规范配置" },
      { tag: "输出", title: "轻量镜像", desc: "多阶段构建命令" },
    ],
    caption: "根治「本机能跑、服务器跑不起来」的环境差异问题。",
  },
  C32: {
    kind: "flow",
    title: "集群调度配置链路",
    nodes: [
      { tag: "输入", title: "服务资源配置", desc: "期望副本 / 最小最大数" },
      { title: "YAML 生成", desc: "K8s 部署描述" },
      { tag: "输出", title: "自动伸缩规则", desc: "大流量秒级扩容" },
    ],
    caption: "运维不再半夜手动加机器，智能扩容自动应对。",
  },
  C33: {
    kind: "compare",
    title: "发布流水线提效对比",
    bars: [{ label: "单次发布操作", before: 60, after: 2, beforeText: "1 小时", afterText: "2 分钟" }],
    caption: "拉取代码 → 安全扫描 → 编译 → 自动上线，提交即发布。",
  },
  C34: {
    kind: "flow",
    title: "监控告警搭建链路",
    nodes: [
      { tag: "输入", title: "监控指标设定", desc: "如 CPU > 90%" },
      { title: "规则生成", desc: "Prometheus 告警规则" },
      { tag: "输出", title: "Grafana 看板", desc: "告警触达责任人" },
    ],
    caption: "提早 10 分钟发现崩溃预警，减少事故损失。",
  },
  C35: {
    kind: "flow",
    title: "日志大盘搭建链路",
    nodes: [
      { tag: "输入", title: "日志路径与格式", desc: "多服务器接入" },
      { title: "采集配置脚本", desc: "集中化收集" },
      { tag: "输出", title: "检索控制台", desc: "1 秒定位错误堆栈" },
    ],
    caption: "出错不再挨台机器捞日志，集中检索一步到位。",
  },
  C36: {
    kind: "flow",
    title: "SQL 注入防护链路",
    nodes: [
      { tag: "输入", title: "数据库查询代码", desc: "后台接口粘贴" },
      { title: "注入点定位", desc: "不安全拼接精确标记" },
      { title: "风险分级", desc: "漏洞等级标注" },
      { tag: "输出", title: "参数化修复", desc: "给出改写方案" },
    ],
    caption: "数据库敏感资产防黑防窃，修复时间缩短 5 倍。",
  },
  C37: {
    kind: "flow",
    title: "网页防篡改链路",
    nodes: [
      { tag: "输入", title: "HTML / 引入脚本", desc: "前端静态模板" },
      { title: "风险输入筛查", desc: "未转义输入框定位" },
      { tag: "输出", title: "CSP 防御规则", desc: "内容安全策略" },
    ],
    caption: "保障用户数据不被劫持，杜绝页面被插入非法广告。",
  },
  C38: {
    kind: "metrics",
    title: "依赖漏洞审计能力",
    metrics: [
      { value: "30 秒", label: "全量依赖诊断", hint: "原手工逐个查对" },
      { value: "CVE", label: "漏洞精确定位", hint: "对应官方编号" },
      { value: "安全版本", label: "升级建议", hint: "直接给出可升级目标" },
    ],
    caption: "上传 package.json / pom.xml，风险三方包一网打尽。",
  },
  C39: {
    kind: "compare",
    title: "等保自查提效对比",
    bars: [{ label: "等保 2.0 合规自查", before: 1440, after: 10, beforeText: "3 天", afterText: "10 分钟" }],
    caption: "73 项硬性指标逐条自查，标出不符合项并给出加固手段。",
  },
  C40: {
    kind: "flow",
    title: "敏感数据脱敏链路",
    nodes: [
      { tag: "输入", title: "脱敏规则选择", desc: "如手机号前三后四" },
      { title: "转换逻辑生成", desc: "后端 + 前端代码" },
      { tag: "输出", title: "防泄漏策略", desc: "密钥与输出管控" },
    ],
    caption: "泄露面收窄到零，测试与分析材料不含真实身份。",
  },
  C41: {
    kind: "timeline",
    title: "WBS 分解四步法",
    stages: [
      { phase: "第 1 步", title: "输入项目愿景", desc: "核心交付成果列表" },
      { phase: "第 2 步", title: "逐级任务分解", desc: "阶段 → 任务 → 子任务" },
      { phase: "第 3 步", title: "工期预估", desc: "每个任务的天数测算" },
      { phase: "第 4 步", title: "里程碑标记", desc: "关键卡点一目了然" },
    ],
    caption: "项目分解从手工半天到 1 分钟自动编排。",
  },
  C42: {
    kind: "timeline",
    title: "甘特图绘制流程",
    stages: [
      { phase: "第 1 步", title: "录入任务清单", desc: "含任务前后依赖" },
      { phase: "第 2 步", title: "依赖解析", desc: "自动排布先后顺序" },
      { phase: "第 3 步", title: "关键路径标记", desc: "里程碑与卡点提示" },
      { phase: "第 4 步", title: "甘特图输出", desc: "含资源饱和度展示" },
    ],
    caption: "繁琐的甘特图手工调节，缩短至 2 分钟自动绘制。",
  },
  C43: {
    kind: "flow",
    title: "风险预案推演链路",
    nodes: [
      { tag: "输入", title: "团队与工期输入", desc: "人员配置 + 交付天数" },
      { title: "风险推演", desc: "人员流动 / 系统延期等" },
      { tag: "输出", title: "防范预案", desc: "应急措施 + 备岗建议" },
    ],
    caption: "识别 12 项高发风险，从被动扑火升级为防患未然。",
  },
  C44: {
    kind: "metrics",
    title: "排班优化收益",
    metrics: [
      { value: "20%+", label: "闲置效率提升", hint: "饱和度科学评估" },
      { value: "曲线", label: "人员饱和度评估", hint: "忙闲一眼看清" },
      { value: "派单表", label: "优化排班输出", hint: "任务与工时匹配" },
    ],
    caption: "避免盲目加班与项目窝工，工时利用有据可依。",
  },
  C45: {
    kind: "compare",
    title: "结项报告提效对比",
    bars: [{ label: "结项材料汇总排版", before: 240, after: 2, beforeText: "半天", afterText: "2 分钟" }],
    caption: "自动汇总版本、测试与缺陷统计，生成含签字栏的 PDF 报告。",
  },
  C46: {
    kind: "flow",
    title: "接口文档生成链路",
    nodes: [
      { tag: "输入", title: "路由 / Swagger 批注", desc: "后端代码或映射定义" },
      { title: "接口解析", desc: "参数与返回结构识别" },
      { tag: "输出", title: "在线文档站", desc: "可点击调试 + 必填提示" },
    ],
    caption: "研发不再手写说明书，接口变更一键重新生成。",
  },
  C47: {
    kind: "metrics",
    title: "代码可读性收益",
    metrics: [
      { value: "20 倍", label: "阅读交接效率", hint: "读懂前人逻辑不再抓瞎" },
      { value: "逐行", label: "白话文批注", hint: "复杂逻辑通俗解释" },
      { value: "0 改动", label: "不影响原代码", hint: "纯注释增强" },
    ],
    caption: "多重嵌套的晦涩代码，自动补上「这里是防重复提交」式说明。",
  },
  C48: {
    kind: "flow",
    title: "知识检索链路",
    nodes: [
      { tag: "输入", title: "本地文档上传", desc: "PDF / Markdown 规范" },
      { title: "深度索引建立", desc: "全文分词与段落定位" },
      { tag: "输出", title: "关键词检索", desc: "直达具体段落行号" },
    ],
    caption: "告别逐个文件翻找，知识检索效率提升 10 倍以上。",
  },
  C49: {
    kind: "flow",
    title: "智能问答链路",
    nodes: [
      { tag: "输入", title: "技术 / 业务提问", desc: "如部署命令是什么" },
      { title: "本地知识库检索", desc: "不出内网、不泄密" },
      { tag: "输出", title: "精准答案", desc: "附命令行与注意事项" },
    ],
    caption: "研发专属客服 5 秒响应，答案只来自你的空间资料。",
  },
  C50: {
    kind: "flow",
    title: "代码审查链路",
    nodes: [
      { tag: "输入", title: "Diff / PR 记录", desc: "粘贴变更内容" },
      { title: "资深视角审查", desc: "漏洞 + 性能双维度" },
      { tag: "输出", title: "审查报告", desc: "评分 + 问题定位 + 参考写法" },
    ],
    caption: "资深架构师式的初步把关，审查速度提升 3 倍。",
  },
  C53: {
    kind: "flow",
    title: "避坑 SOP 提炼链路",
    nodes: [
      { tag: "输入", title: "历史缺陷与故障", desc: "处理单 / 故障文档" },
      { title: "归纳提炼", desc: "同类问题自动聚类" },
      { tag: "输出", title: "结构化规约", desc: "如：禁拼接 SQL、必开事务" },
    ],
    caption: "零散教训变系统规约，新成员不再重踩历史的坑。",
  },
  C54: {
    kind: "metrics",
    title: "效能分析输出",
    metrics: [
      { value: "90%", label: "人工评审时间节约", hint: "静态评审自动化" },
      { value: "偏离度", label: "代码契约偏离诊断", hint: "实现与契约逐条比对" },
      { value: "3 处", label: "质量风险点标注", hint: "精确到位置" },
    ],
    caption: "源码或架构文档进，结构化分析报告出。",
  },
  C55: {
    kind: "flow",
    title: "自动部署巡检链路",
    nodes: [
      { tag: "输入", title: "目标与环境配置", desc: "部署目标 + 环境变量" },
      { title: "流水线构建", desc: "自动执行构建动作" },
      { tag: "输出", title: "巡检日志看板", desc: "发布状态实时可视" },
    ],
    caption: "一键自动化环境巡检与发布，部署更稳。",
  },
  C56: {
    kind: "flow",
    title: "契约转码流水线",
    nodes: [
      { tag: "输入", title: "OpenAPI 契约", desc: "接口定义文件" },
      { title: "标准转写", desc: "按分层规范映射" },
      { tag: "输出", title: "骨架代码", desc: "Controller / Service / Model" },
    ],
    caption: "从契约直接生成代码，杜绝手动拷贝出错。",
  },
  C57: {
    kind: "flow",
    title: "安全审计链路",
    nodes: [
      { tag: "输入", title: "源码 / 依赖声明", desc: "项目文件上传" },
      { title: "安全诊断", desc: "明文密码 + 三方包漏洞" },
      { tag: "输出", title: "修复处方", desc: "逐项给出处置建议" },
    ],
    caption: "秒级排查代码泄密与安全漏洞。",
  },
};

async function main() {
  const comps = await prisma.componentcatalog.findMany({ orderBy: { id: "asc" } });
  let updated = 0;
  const skipped = [];

  for (const comp of comps) {
    const visual = VISUALS[comp.id];
    if (!visual) {
      skipped.push(comp.id);
      continue; // 未配置的可视化组件走前端通用兜底流程图
    }
    const existing = (comp.detail && typeof comp.detail === "object" ? comp.detail : {}) || {};
    const detail = { ...existing, visual };
    await prisma.componentcatalog.update({
      where: { id: comp.id },
      data: { detail },
    });
    updated++;
    console.log(`✔ ${comp.id} ${comp.name} 可视化图表已写入（${visual.kind}）`);
  }

  console.log(`\n--- 完成：更新 ${updated} 个组件；未配置（走通用兜底）：${skipped.join(", ") || "无"} ---`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
