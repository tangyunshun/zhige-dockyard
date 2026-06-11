/**
 * 组件库定义 (53 个核心组件)
 * 按 10 大软件工程阶段分组
 */

export interface ComponentPreviewData {
  inputMock: string;
  outputMock: string;
  roiText: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  icon: string;
  tags: string[];
  isPremium: boolean;
  estimatedTokens: number;
  previewData: ComponentPreviewData;
  businessTags?: string[];
}

export type ComponentCategory =
  | "BID_PREP" // C01-C06 商机捕获与售前打单
  | "REQ_DESIGN" // C07-C10 需求定义与产品设计
  | "BACKEND_CORE" // C11-C16 后端核心与 API
  | "DATABASE_ENG" // C17-C20 数据库工程
  | "FRONTEND_DEV" // C21-C25 大前端开发
  | "TEST_QA" // C26-C30 测试与质量保证
  | "DEVOPS" // C31-C35 运维与持续集成
  | "SECURITY" // C36-C40 安全合规
  | "PROJ_MGMT" // C41-C45 项目管理
  | "KNOWLEDGE"; // C46-C53 知识资产

export const COMPONENT_CATEGORIES: Record<ComponentCategory, string> = {
  BID_PREP: "商机捕获与售前打单",
  REQ_DESIGN: "需求定义与产品设计",
  BACKEND_CORE: "后端核心与 API",
  DATABASE_ENG: "数据库工程",
  FRONTEND_DEV: "大前端开发",
  TEST_QA: "测试与质量保证",
  DEVOPS: "运维与持续集成",
  SECURITY: "安全合规",
  PROJ_MGMT: "项目管理",
  KNOWLEDGE: "知识资产",
};

export const COMPONENTS: ComponentDefinition[] = [
  {
    id: "C01",
    name: "RFP 标书解析",
    description: "提取标书关键条款，自动对比产品能力生成偏离表",
    category: "BID_PREP",
    icon: "document",
    tags: ["标书解析", "RFP", "偏离表"],
    isPremium: false,
    estimatedTokens: 50,
    businessTags: ["#提升中标率", "#降本增效"],
    previewData: {
      inputMock: "上传一份政府招标 PDF 标书文档",
      outputMock:
        "输出结构化偏离表：含 5 项完全满足、2 项部分满足、1 项不满足，推荐替代方案",
      roiText: "人工逐条核对需 3 小时，自动解析仅需 30 秒",
    },
  },
  {
    id: "C02",
    name: "方案合规审查",
    description: "离线扫描技术方案，检查等保、国密等合规风险",
    category: "BID_PREP",
    icon: "shield",
    tags: ["合规审查", "等保", "国密"],
    isPremium: false,
    estimatedTokens: 80,
    businessTags: ["#防坑排雷", "#拒绝背锅"],
    previewData: {
      inputMock: "上传技术方案文档与等保要求清单",
      outputMock: "标注 3 处不合规风险点，提供整改建议与引用条款",
      roiText: "人工审查需 2 天，自动扫描仅需 2 分钟",
    },
  },
  {
    id: "C03",
    name: "竞品对比分析",
    description: "提取竞品文档核心数据，生成多维度对比矩阵",
    category: "BID_PREP",
    icon: "bar-chart",
    tags: ["竞品分析", "对比矩阵"],
    isPremium: true,
    estimatedTokens: 120,
    businessTags: ["#提升中标率", "#降本增效"],
    previewData: {
      inputMock: "上传竞品产品文档与本方能力清单",
      outputMock: "生成多维度对比矩阵，标注 8 项优势、3 项劣势、5 项持平",
      roiText: "人工整理需 1 天，自动生成仅需 1 分钟",
    },
  },
  {
    id: "C04",
    name: "汇报话术转换",
    description: "根据汇报对象（高管/技术），自动调整技术方案的表达深度",
    category: "BID_PREP",
    icon: "message-square",
    tags: ["汇报", "文档转换"],
    isPremium: false,
    estimatedTokens: 60,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "选择汇报对象类型，输入原始技术方案",
      outputMock: "高管版聚焦 ROI 与商业价值，技术版详述架构细节",
      roiText: "无需手动编写多版本汇报材料，一键适配受众",
    },
  },
  {
    id: "C05",
    name: "项目成本测算",
    description: "结合历史数据推算项目隐性成本与预估毛利",
    category: "BID_PREP",
    icon: "calculator",
    tags: ["成本测算", "项目预估"],
    isPremium: true,
    estimatedTokens: 150,
    businessTags: ["#降本增效", "#防坑排雷"],
    previewData: {
      inputMock: "输入项目功能清单与团队规模",
      outputMock:
        "输出成本明细：人力 45 万、服务器 12 万、第三方服务 8 万，预估毛利 35%",
      roiText: "人工测算需半天，自动生成仅需 2 分钟",
    },
  },
  {
    id: "C06",
    name: "商业价值评估",
    description: "量化功能收益与开发成本，生成投入产出比报告",
    category: "BID_PREP",
    icon: "trending-up",
    tags: ["价值评估", "ROI"],
    isPremium: true,
    estimatedTokens: 200,
    businessTags: ["#提升中标率", "#降本增效"],
    previewData: {
      inputMock: "输入功能收益预估与开发成本数据",
      outputMock: "生成 ROI 报告：投资回报周期 6 个月，净现值 120 万",
      roiText: "量化项目商业价值，辅助投资决策",
    },
  },

  {
    id: "C07",
    name: "需求转 PRD",
    description: "将会议纪要或聊天记录，整理为结构化需求文档",
    category: "REQ_DESIGN",
    icon: "clipboard-list",
    tags: ["PRD", "需求分析"],
    isPremium: false,
    estimatedTokens: 100,
    businessTags: ["#降本增效", "#拒绝背锅"],
    previewData: {
      inputMock: "粘贴会议纪要或聊天记录",
      outputMock: "生成结构化 PRD：含背景、用户故事、功能清单、验收标准",
      roiText: "传统编写需半天，自动转换仅需 1 分钟",
    },
  },
  {
    id: "C08",
    name: "异常场景补全",
    description: "根据主流程自动补充边界、并发等异常场景的处理建议",
    category: "REQ_DESIGN",
    icon: "network",
    tags: ["异常处理", "边界场景"],
    isPremium: true,
    estimatedTokens: 150,
    businessTags: ["#拒绝背锅", "#防坑排雷"],
    previewData: {
      inputMock: "输入主流程描述（如：用户下单支付）",
      outputMock:
        "自动补全 12 种异常：网络中断、余额不足、库存变更、并发冲突等处理建议",
      roiText: "减少 60% 线上故障因边界场景遗漏导致",
    },
  },
  {
    id: "C09",
    name: "客诉归因分析",
    description: "聚类分析多渠道客诉数据，自动生成研发缺陷单",
    category: "REQ_DESIGN",
    icon: "users",
    tags: ["客诉分析", "缺陷管理"],
    isPremium: true,
    estimatedTokens: 180,
    businessTags: ["#降本增效", "#防坑排雷"],
    previewData: {
      inputMock: "上传多渠道客诉数据（客服工单、应用商店评论）",
      outputMock: "聚类识别 Top 3 问题类型，自动生成研发缺陷单并分配优先级",
      roiText: "人工分类需 4 小时，自动分析仅需 30 秒",
    },
  },
  {
    id: "C10",
    name: "仿真数据生成",
    description: "依据真实行业规则，批量生成高逼真的业务测试数据",
    category: "REQ_DESIGN",
    icon: "database",
    tags: ["测试数据", "数据生成"],
    isPremium: true,
    estimatedTokens: 250,
    businessTags: ["#防坑排雷", "#降本增效"],
    previewData: {
      inputMock: "选择行业模板（电商/金融/医疗）与数据量级",
      outputMock: "生成 10000 条高逼真测试数据，含姓名、地址、交易记录等",
      roiText: "避免使用生产数据测试的合规风险，数据生成仅需 30 秒",
    },
  },

  {
    id: "C11",
    name: "RESTful API 生成",
    description: "根据业务需求自动生成 RESTful API 接口",
    category: "BACKEND_CORE",
    icon: "plug",
    tags: ["API", "RESTful"],
    isPremium: false,
    estimatedTokens: 80,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "描述业务需求（如：用户注册、登录、订单管理）",
      outputMock:
        "生成 RESTful API 代码：路由定义、参数校验、错误处理、Swagger 注解",
      roiText: "手写 API 需 2 小时/接口，自动生成仅需 10 秒",
    },
  },
  {
    id: "C12",
    name: "GraphQL Schema 设计",
    description: "设计 GraphQL Schema 与 Resolver",
    category: "BACKEND_CORE",
    icon: "plug",
    tags: ["GraphQL", "API 设计"],
    isPremium: true,
    estimatedTokens: 120,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "输入业务实体关系描述",
      outputMock: "生成 GraphQL Schema 定义、Query/Mutation、Resolver 骨架代码",
      roiText: "Schema 设计从 1 天缩短至 1 分钟",
    },
  },
  {
    id: "C13",
    name: "实时通信 WebSocket",
    description: "实现双向实时通信的 WebSocket 服务",
    category: "BACKEND_CORE",
    icon: "radio",
    tags: ["WebSocket", "实时通信"],
    isPremium: true,
    estimatedTokens: 150,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "描述实时通信场景（如：聊天、协作编辑）",
      outputMock: "生成 WebSocket 服务端代码：连接管理、心跳检测、房间机制",
      roiText: "实时通信功能开发周期缩短 70%",
    },
  },
  {
    id: "C14",
    name: "消息队列集成",
    description: "集成 Kafka/RabbitMQ 等消息队列服务",
    category: "BACKEND_CORE",
    icon: "mail",
    tags: ["消息队列", "Kafka", "RabbitMQ"],
    isPremium: true,
    estimatedTokens: 200,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "选择消息队列类型与业务场景",
      outputMock: "生成生产者/消费者代码、死信队列配置、消息重试机制",
      roiText: "消息队列集成从 3 天缩短至 5 分钟",
    },
  },
  {
    id: "C15",
    name: "Redis 缓存设计",
    description: "设计 Redis 缓存策略与数据结构",
    category: "BACKEND_CORE",
    icon: "hard-drive",
    tags: ["Redis", "缓存"],
    isPremium: true,
    estimatedTokens: 100,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "输入接口 QPS、数据更新频率",
      outputMock: "输出缓存策略：键设计、过期时间、穿透/击穿防护方案",
      roiText: "接口响应速度提升 10 倍，数据库压力降低 80%",
    },
  },
  {
    id: "C16",
    name: "认证授权中间件",
    description: "实现 JWT/OAuth2 等认证授权机制",
    category: "BACKEND_CORE",
    icon: "lock",
    tags: ["认证", "授权", "JWT"],
    isPremium: false,
    estimatedTokens: 100,
    businessTags: ["#防坑排雷"],
    previewData: {
      inputMock: "选择认证方式与用户角色体系",
      outputMock: "生成认证中间件代码、Token 刷新逻辑、RBAC 权限校验",
      roiText: "认证系统搭建从 5 天缩短至 10 分钟",
    },
  },

  {
    id: "C17",
    name: "SQL 代码生成",
    description: "根据业务需求自动生成 SQL 查询语句",
    category: "DATABASE_ENG",
    icon: "database",
    tags: ["SQL", "数据库"],
    isPremium: false,
    estimatedTokens: 60,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "描述查询需求（如：查询近30天订单金额Top10用户）",
      outputMock: "生成优化后的 SQL：含索引建议、分页、JOIN 优化",
      roiText: "复杂 SQL 手写需 30 分钟，自动生成仅需 5 秒",
    },
  },
  {
    id: "C18",
    name: "数据库建模与 ER 图",
    description: "设计数据库表结构并生成 ER 图",
    category: "DATABASE_ENG",
    icon: "map",
    tags: ["数据库设计", "ER 图"],
    isPremium: false,
    estimatedTokens: 120,
    businessTags: ["#拒绝背锅", "#降本增效"],
    previewData: {
      inputMock: "描述业务实体与关系",
      outputMock: "生成 DDL 建表语句、ER 关系图、字段注释",
      roiText: "数据库建模从半天缩短至 2 分钟",
    },
  },
  {
    id: "C19",
    name: "数据库性能优化",
    description: "分析慢查询并提供索引优化建议",
    category: "DATABASE_ENG",
    icon: "zap",
    tags: ["性能优化", "SQL 优化"],
    isPremium: true,
    estimatedTokens: 150,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "粘贴 EXPLAIN 结果或慢查询 SQL",
      outputMock: "输出优化方案：建议索引、查询重写、表结构优化",
      roiText: "慢查询时间平均降低 90%，节省数据库资源",
    },
  },
  {
    id: "C20",
    name: "数据库迁移工具",
    description: "支持 Oracle 等数据库的 SQL 转换与迁移",
    category: "DATABASE_ENG",
    icon: "refresh-cw",
    tags: ["数据库迁移", "数据转换"],
    isPremium: true,
    estimatedTokens: 200,
    businessTags: ["#降本增效", "#防坑排雷"],
    previewData: {
      inputMock: "上传 Oracle DDL 或选择源数据库类型",
      outputMock: "输出兼容目标数据库的 DDL：函数转换、类型映射、存储过程改写",
      roiText: "数据库迁移从 1 个月缩短至 1 天",
    },
  },

  {
    id: "C21",
    name: "React 组件生成",
    description: "根据需求自动生成 React 组件代码",
    category: "FRONTEND_DEV",
    icon: "layout",
    tags: ["React", "前端"],
    isPremium: false,
    estimatedTokens: 80,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "描述组件需求（如：带搜索和分页的数据表格）",
      outputMock:
        "生成 React 组件：含 TypeScript 类型、状态管理、样式、单元测试",
      roiText: "组件编写从 2 小时缩短至 30 秒",
    },
  },
  {
    id: "C22",
    name: "Vue 组件生成",
    description: "根据需求自动生成 Vue 组件代码",
    category: "FRONTEND_DEV",
    icon: "layout",
    tags: ["Vue", "前端"],
    isPremium: false,
    estimatedTokens: 80,
    businessTags: ["#降本增效"],
    previewData: {
      inputMock: "描述组件需求（如：文件上传带进度条）",
      outputMock: "生成 Vue 3 组件：Composition API、Props/Emits、样式隔离",
      roiText: "组件编写从 2 小时缩短至 30 秒",
    },
  },
  {
    id: "C23",
    name: "响应式布局生成",
    description: "自动生成 PC/移动端适配的响应式布局",
    category: "FRONTEND_DEV",
    icon: "smartphone",
    tags: ["响应式", "布局"],
    isPremium: false,
    estimatedTokens: 100,
    businessTags: ["#降本增效", "#拒绝背锅"],
    previewData: {
      inputMock: "上传设计稿或描述布局需求",
      outputMock: "生成响应式布局代码：PC 三栏、平板两栏、手机单栏，含断点配置",
      roiText: "响应式适配从 1 天缩短至 2 分钟",
    },
  },
  {
    id: "C24",
    name: "图表可视化生成",
    description: "根据数据自动生成 ECharts/D3 图表",
    category: "FRONTEND_DEV",
    icon: "bar-chart",
    tags: ["可视化", "图表"],
    isPremium: true,
    estimatedTokens: 150,
    previewData: {
      inputMock: "上传数据（CSV/JSON）或描述图表需求",
      outputMock: "生成交ECharts 配置代码：折线图、柱状图、饼图、热力图等",
      roiText: "图表开发从半天缩短至 1 分钟",
    },
  },
  {
    id: "C25",
    name: "数据大屏设计",
    description: "自动生成数据可视化大屏界面",
    category: "FRONTEND_DEV",
    icon: "monitor",
    tags: ["数据大屏", "可视化"],
    isPremium: true,
    estimatedTokens: 300,
    previewData: {
      inputMock: "描述数据维度与展示需求",
      outputMock: "生成大屏完整代码：布局网格、数据图表、实时刷新、主题配色",
      roiText: "数据大屏开发从 2 周缩短至 5 分钟",
    },
  },

  {
    id: "C26",
    name: "单元测试生成",
    description: "自动生成 Jest/Vitest 单元测试代码",
    category: "TEST_QA",
    icon: "check-circle",
    tags: ["单元测试", "Jest", "Vitest"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "粘贴源代码函数或组件",
      outputMock: "生成测试用例：正常路径、边界条件、异常输入，覆盖率 > 80%",
      roiText: "测试编写从 1 小时/函数缩短至 10 秒",
    },
  },
  {
    id: "C27",
    name: "API 接口测试",
    description: "使用 Postman/ApiFox 进行 API 测试",
    category: "TEST_QA",
    icon: "flask-conical",
    tags: ["API 测试", "Postman"],
    isPremium: false,
    estimatedTokens: 100,
    previewData: {
      inputMock: "粘贴 API 接口定义（Swagger/OpenAPI）",
      outputMock: "生成测试集合：正常请求、参数校验、鉴权测试、错误码覆盖",
      roiText: "API 测试用例编写效率提升 10 倍",
    },
  },
  {
    id: "C28",
    name: "性能压力测试",
    description: "使用 JMeter/k6 进行性能压力测试",
    category: "TEST_QA",
    icon: "weight",
    tags: ["性能测试", "JMeter", "k6"],
    isPremium: true,
    estimatedTokens: 200,
    previewData: {
      inputMock: "输入目标 URL 与并发场景描述",
      outputMock: "生成压测脚本：阶梯加压、断言配置、报告模板",
      roiText: "压测准备从 1 天缩短至 3 分钟",
    },
  },
  {
    id: "C29",
    name: "代码质量扫描",
    description: "使用 SonarQube 进行代码质量扫描",
    category: "TEST_QA",
    icon: "search",
    tags: ["代码质量", "SonarQube"],
    isPremium: false,
    estimatedTokens: 120,
    previewData: {
      inputMock: "配置扫描规则与质量门禁阈值",
      outputMock: "生成扫描报告：Bug 数、漏洞、代码异味、技术债务评估",
      roiText: "代码质量问题的发现效率提升 5 倍",
    },
  },
  {
    id: "C30",
    name: "UI 自动化测试",
    description: "使用 Selenium/Cypress 进行 UI 自动化测试",
    category: "TEST_QA",
    icon: "mouse-pointer",
    tags: ["UI 测试", "Selenium", "Cypress"],
    isPremium: true,
    estimatedTokens: 180,
    previewData: {
      inputMock: "描述 UI 操作流程（如：登录-搜索-下单）",
      outputMock: "生成 Cypress 测试脚本：页面导航、元素定位、断言、截图",
      roiText: "UI 自动化脚本编写从 3 小时缩短至 2 分钟",
    },
  },

  {
    id: "C31",
    name: "Docker 镜像构建",
    description: "编写 Dockerfile 构建应用镜像",
    category: "DEVOPS",
    icon: "container",
    tags: ["Docker", "容器化"],
    isPremium: false,
    estimatedTokens: 60,
    previewData: {
      inputMock: "选择技术栈（Node.js/Java/Python）与依赖清单",
      outputMock: "生成多阶段 Dockerfile、.dockerignore、docker-compose 配置",
      roiText: "容器化配置从半天缩短至 1 分钟",
    },
  },
  {
    id: "C32",
    name: "K8s 部署配置",
    description: "编写 Kubernetes 部署 YAML 与 Helm Chart",
    category: "DEVOPS",
    icon: "network",
    tags: ["Kubernetes", "K8s", "Helm"],
    isPremium: true,
    estimatedTokens: 200,
    previewData: {
      inputMock: "描述服务架构（副本数、资源需求、服务暴露方式）",
      outputMock: "生成 K8s YAML：Deployment、Service、Ingress、ConfigMap、HPA",
      roiText: "K8s 部署配置从 2 天缩短至 5 分钟",
    },
  },
  {
    id: "C33",
    name: "CI/CD 流水线",
    description: "配置 GitHub Actions/GitLab CI 流水线",
    category: "DEVOPS",
    icon: "refresh-cw",
    tags: ["CI/CD", "自动化"],
    isPremium: false,
    estimatedTokens: 100,
    previewData: {
      inputMock: "选择 CI/CD 平台与部署目标",
      outputMock: "生成流水线配置：代码检查、测试、构建、部署、通知",
      roiText: "CI/CD 配置从半天缩短至 2 分钟",
    },
  },
  {
    id: "C34",
    name: "监控告警系统",
    description: "搭建 Prometheus+Grafana 监控告警系统",
    category: "DEVOPS",
    icon: "activity",
    tags: ["监控", "告警", "Prometheus"],
    isPremium: true,
    estimatedTokens: 250,
    previewData: {
      inputMock: "描述监控指标需求与告警规则",
      outputMock: "生成 Prometheus 配置、Grafana 仪表盘 JSON、告警规则 YAML",
      roiText: "监控系统搭建从 3 天缩短至 10 分钟",
    },
  },
  {
    id: "C35",
    name: "日志收集与分析",
    description: "搭建 ELK/Loki 日志收集与分析系统",
    category: "DEVOPS",
    icon: "file-text",
    tags: ["日志", "ELK", "Loki"],
    isPremium: true,
    estimatedTokens: 200,
    previewData: {
      inputMock: "选择日志平台与采集需求",
      outputMock: "生成日志采集配置、索引模板、常用查询仪表盘",
      roiText: "日志系统搭建从 2 天缩短至 5 分钟",
    },
  },

  {
    id: "C36",
    name: "SQL 注入检测",
    description: "检测并修复 SQL 注入漏洞",
    category: "SECURITY",
    icon: "shield",
    tags: ["安全", "SQL 注入"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "粘贴 SQL 查询代码或接口 URL",
      outputMock: "标注注入风险点、危险等级、修复建议代码",
      roiText: "安全漏洞修复效率提升 5 倍",
    },
  },
  {
    id: "C37",
    name: "XSS 跨站脚本防护",
    description: "检测和修复 XSS 跨站脚本攻击漏洞",
    category: "SECURITY",
    icon: "lock",
    tags: ["安全", "XSS"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "粘贴前端代码或输入输出处理逻辑",
      outputMock: "标注 XSS 风险点、提供输出编码/内容安全策略修复方案",
      roiText: "安全漏洞修复效率提升 5 倍",
    },
  },
  {
    id: "C38",
    name: "依赖漏洞扫描",
    description: "扫描 npm/maven 依赖漏洞并升级",
    category: "SECURITY",
    icon: "search",
    tags: ["安全", "依赖扫描"],
    isPremium: true,
    estimatedTokens: 150,
    previewData: {
      inputMock: "上传 package.json 或 pom.xml",
      outputMock: "输出漏洞报告：CVE 编号、严重等级、建议升级版本、兼容性分析",
      roiText: "依赖安全审计从半天缩短至 30 秒",
    },
  },
  {
    id: "C39",
    name: "等保 2.0 合规检查",
    description: "检查系统是否符合等保 2.0 要求",
    category: "SECURITY",
    icon: "clipboard-check",
    tags: ["安全合规", "等保"],
    isPremium: true,
    estimatedTokens: 300,
    previewData: {
      inputMock: "输入系统架构描述与部署环境",
      outputMock: "生成合规检查清单：73 项指标逐条对照、不合规项整改建议",
      roiText: "等保自查从 3 天缩短至 10 分钟",
    },
  },
  {
    id: "C40",
    name: "数据脱敏处理",
    description: "对敏感数据进行脱敏处理",
    category: "SECURITY",
    icon: "lock",
    tags: ["数据安全", "脱敏"],
    isPremium: true,
    estimatedTokens: 120,
    previewData: {
      inputMock: "选择脱敏规则（手机号/身份证/银行卡）",
      outputMock: "生成脱敏策略代码：保留格式、可逆加密、不可逆哈希",
      roiText: "数据脱敏让非生产环境安全可用",
    },
  },

  {
    id: "C41",
    name: "WBS 工作分解",
    description: "自动生成 WBS 工作分解结构",
    category: "PROJ_MGMT",
    icon: "list",
    tags: ["项目管理", "WBS"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "描述项目目标与交付物清单",
      outputMock: "生成树形 WBS：阶段、工作包、任务、责任人、工期估算",
      roiText: "WBS 编制从半天缩短至 1 分钟",
    },
  },
  {
    id: "C42",
    name: "项目进度甘特图",
    description: "自动生成项目进度甘特图",
    category: "PROJ_MGMT",
    icon: "calendar",
    tags: ["项目管理", "甘特图"],
    isPremium: false,
    estimatedTokens: 100,
    previewData: {
      inputMock: "输入任务列表与依赖关系",
      outputMock: "生成甘特图数据：任务条、里程碑标记、关键路径高亮",
      roiText: "进度计划编制从 2 小时缩短至 2 分钟",
    },
  },
  {
    id: "C43",
    name: "风险评估矩阵",
    description: "生成项目风险评估清单",
    category: "PROJ_MGMT",
    icon: "alert-triangle",
    tags: ["风险管理"],
    isPremium: true,
    estimatedTokens: 120,
    previewData: {
      inputMock: "描述项目类型与团队经验",
      outputMock: "输出风险矩阵：12 项潜在风险、发生概率、影响等级、应对预案",
      roiText: "风险管理从被动应对转为主动预防",
    },
  },
  {
    id: "C44",
    name: "资源分配优化",
    description: "优化项目资源分配方案",
    category: "PROJ_MGMT",
    icon: "users",
    tags: ["资源管理"],
    isPremium: true,
    estimatedTokens: 150,
    previewData: {
      inputMock: "输入团队成员角色与可用工时",
      outputMock: "输出优化后的排期方案：资源利用率提升 20%，关键路径缩短",
      roiText: "资源规划效率提升 3 倍",
    },
  },
  {
    id: "C45",
    name: "项目文档生成",
    description: "自动生成项目验收文档",
    category: "PROJ_MGMT",
    icon: "file-text",
    tags: ["项目文档"],
    isPremium: false,
    estimatedTokens: 120,
    previewData: {
      inputMock: "输入项目基本信息与交付物",
      outputMock: "生成验收报告：交付清单、测试报告摘要、遗留问题跟踪",
      roiText: "验收文档编写从半天缩短至 2 分钟",
    },
  },

  {
    id: "C46",
    name: "API 文档生成",
    description: "自动生成 API 接口文档",
    category: "KNOWLEDGE",
    icon: "book-open",
    tags: ["API 文档", "文档生成"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "粘贴 API 路由代码或 Swagger 注解",
      outputMock: "生成在线文档：接口说明、参数表格、响应示例、错误码",
      roiText: "API 文档编写从 1 天缩短至 30 秒",
    },
  },
  {
    id: "C47",
    name: "代码注释生成",
    description: "自动生成代码注释与文档",
    category: "KNOWLEDGE",
    icon: "message-circle",
    tags: ["代码注释"],
    isPremium: false,
    estimatedTokens: 60,
    previewData: {
      inputMock: "粘贴源代码文件",
      outputMock: "生成标准注释：函数说明、参数类型、返回值、使用示例",
      roiText: "代码注释补全效率提升 20 倍",
    },
  },
  {
    id: "C48",
    name: "知识库管理",
    description: "管理项目知识库与文档检索",
    category: "KNOWLEDGE",
    icon: "library",
    tags: ["知识库"],
    isPremium: false,
    estimatedTokens: 50,
    previewData: {
      inputMock: "上传项目文档（PDF/Word/Markdown）",
      outputMock: "构建可搜索知识库：文档索引、关键词提取、关联推荐",
      roiText: "项目知识检索效率提升 10 倍",
    },
  },
  {
    id: "C49",
    name: "智能问答",
    description: "基于项目知识的问答服务",
    category: "KNOWLEDGE",
    icon: "help-circle",
    tags: ["问答", "知识检索"],
    isPremium: false,
    estimatedTokens: 50,
    previewData: {
      inputMock: "输入技术问题（如：如何配置 Redis 集群）",
      outputMock: "基于项目知识库精准回答：含代码示例、配置模板、注意事项",
      roiText: "技术问题解决效率提升 5 倍",
    },
  },
  {
    id: "C50",
    name: "代码审查报告",
    description: "生成代码审查报告",
    category: "KNOWLEDGE",
    icon: "file-check",
    tags: ["代码审查"],
    isPremium: true,
    estimatedTokens: 200,
    previewData: {
      inputMock: "粘贴 Pull Request 代码变更",
      outputMock:
        "生成审查报告：代码质量评分、潜在 Bug、性能优化建议、最佳实践对照",
      roiText: "代码审查效率提升 3 倍",
    },
  },
  {
    id: "C51",
    name: "最佳实践推荐",
    description: "推荐行业最佳实践与优化建议",
    category: "KNOWLEDGE",
    icon: "lightbulb",
    tags: ["最佳实践"],
    isPremium: true,
    estimatedTokens: 150,
    previewData: {
      inputMock: "描述当前技术栈与架构方案",
      outputMock: "生成优化建议：架构改进、性能调优、安全加固、监控完善",
      roiText: "系统优化方向一键获取，节省调研时间",
    },
  },
  {
    id: "C52",
    name: "技术栈推荐",
    description: "根据项目需求推荐技术栈",
    category: "KNOWLEDGE",
    icon: "wrench",
    tags: ["技术栈", "推荐"],
    isPremium: false,
    estimatedTokens: 80,
    previewData: {
      inputMock: "描述项目需求（类型、规模、性能要求）",
      outputMock: "推荐技术栈组合：前端+后端+数据库+部署，含优劣对比",
      roiText: "技术选型从 1 周缩短至 2 分钟",
    },
  },
  {
    id: "C53",
    name: "项目总结报告",
    description: "自动生成项目结项总结报告",
    category: "KNOWLEDGE",
    icon: "presentation",
    tags: ["项目总结", "报告"],
    isPremium: false,
    estimatedTokens: 150,
    previewData: {
      inputMock: "输入项目关键指标与里程碑",
      outputMock: "生成总结报告：目标达成率、交付统计、经验教训、后续建议",
      roiText: "结项报告编写从半天缩短至 2 分钟",
    },
  },
];

export const COMPONENT_PERMISSION_TOKENS = COMPONENTS.reduce(
  (acc, comp) => {
    acc[comp.id] = `component:${comp.id}:${comp.category}`;
    return acc;
  },
  {} as Record<string, string>,
);

export function getComponentCategoryName(category: ComponentCategory): string {
  return COMPONENT_CATEGORIES[category];
}

export function getComponentById(id: string): ComponentDefinition | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

export function getComponentsByCategory(
  category: ComponentCategory,
): ComponentDefinition[] {
  return COMPONENTS.filter((c) => c.category === category);
}
