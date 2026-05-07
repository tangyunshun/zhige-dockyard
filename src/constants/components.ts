/**
 * 组件库定义 (53 个核心组件)
 * 按 10 大软件工程阶段分组
 */

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  icon: string;
}

export type ComponentCategory =
  | 'BID_PREP'           // C01-C06 商机捕获与售前打单
  | 'REQ_DESIGN'         // C07-C10 需求定义与产品设计
  | 'BACKEND_CORE'       // C11-C16 后端核心与 API
  | 'DATABASE_ENG'       // C17-C20 数据库工程
  | 'FRONTEND_DEV'       // C21-C25 大前端开发
  | 'TEST_QA'            // C26-C30 测试与质量保证
  | 'DEVOPS'             // C31-C35 运维与持续集成
  | 'SECURITY'           // C36-C40 安全合规
  | 'PROJ_MGMT'          // C41-C45 项目管理
  | 'KNOWLEDGE'          // C46-C53 知识资产

export const COMPONENT_CATEGORIES: Record<ComponentCategory, {
  name: string;
  range: string;
  color: string;
}> = {
  BID_PREP: { name: '商机捕获与售前打单', range: 'C01-C06', color: '#3182ce' },
  REQ_DESIGN: { name: '需求定义与产品设计', range: 'C07-C10', color: '#805ad5' },
  BACKEND_CORE: { name: '后端核心与 API', range: 'C11-C16', color: '#38a169' },
  DATABASE_ENG: { name: '数据库工程', range: 'C17-C20', color: '#dd6b20' },
  FRONTEND_DEV: { name: '大前端开发', range: 'C21-C25', color: '#e53e3e' },
  TEST_QA: { name: '测试与质量保证', range: 'C26-C30', color: '#d69e2e' },
  DEVOPS: { name: '运维与持续集成', range: 'C31-C35', color: '#319795' },
  SECURITY: { name: '安全合规', range: 'C36-C40', color: '#b83280' },
  PROJ_MGMT: { name: '项目管理', range: 'C41-C45', color: '#285e61' },
  KNOWLEDGE: { name: '知识资产', range: 'C46-C53', color: '#702459' },
};

export const COMPONENTS: ComponentDefinition[] = [
  // C01-C06: 商机捕获与售前打单
  { id: 'C01', name: 'RFP 标书解析', description: '提取标书关键条款，自动对比产品能力生成偏离表', category: 'BID_PREP', icon: '📄' },
  { id: 'C02', name: '方案合规审查', description: '离线扫描技术方案，检查等保、国密等合规风险', category: 'BID_PREP', icon: '🛡️' },
  { id: 'C03', name: '竞品对比分析', description: '提取竞品文档核心数据，生成多维度对比矩阵', category: 'BID_PREP', icon: '📊' },
  { id: 'C04', name: '汇报话术转换', description: '根据汇报对象（高管/技术），自动调整技术方案的表达深度', category: 'BID_PREP', icon: '🗣️' },
  { id: 'C05', name: '项目成本测算', description: '结合历史数据推算项目隐性成本与预估毛利', category: 'BID_PREP', icon: '🧮' },
  { id: 'C06', name: '商业价值评估 (PPT 报告)', description: '量化功能收益与开发成本，生成投入产出比报告', category: 'BID_PREP', icon: '📈' },

  // C07-C10: 需求定义与产品设计
  { id: 'C07', name: '需求转 PRD', description: '将会议纪要或聊天记录，整理为结构化需求文档', category: 'REQ_DESIGN', icon: '🧩' },
  { id: 'C08', name: '异常场景补全', description: '根据主流程自动补充边界、并发等异常场景的处理建议', category: 'REQ_DESIGN', icon: '🕸️' },
  { id: 'C09', name: '客诉归因分析', description: '聚类分析多渠道客诉数据，自动生成研发缺陷单', category: 'REQ_DESIGN', icon: '🎭' },
  { id: 'C10', name: '仿真数据生成', description: '依据真实行业规则，批量生成高逼真的业务测试数据', category: 'REQ_DESIGN', icon: '💉' },

  // C11-C16: 后端核心与 API
  { id: 'C11', name: 'RESTful API 生成', description: '根据业务需求自动生成 RESTful API 接口', category: 'BACKEND_CORE', icon: '🔌' },
  { id: 'C12', name: 'GraphQL Schema 设计', description: '设计 GraphQL Schema 与 Resolver', category: 'BACKEND_CORE', icon: '🔌' },
  { id: 'C13', name: '实时通信 WebSocket', description: '实现双向实时通信的 WebSocket 服务', category: 'BACKEND_CORE', icon: '📡' },
  { id: 'C14', name: '消息队列集成', description: '集成 Kafka/RabbitMQ 等消息队列服务', category: 'BACKEND_CORE', icon: '📨' },
  { id: 'C15', name: 'Redis 缓存设计', description: '设计 Redis 缓存策略与数据结构', category: 'BACKEND_CORE', icon: '🗄️' },
  { id: 'C16', name: '认证授权中间件', description: '实现 JWT/OAuth2 等认证授权机制', category: 'BACKEND_CORE', icon: '🔐' },

  // C17-C20: 数据库工程
  { id: 'C17', name: 'SQL 代码生成', description: '根据业务需求自动生成 SQL 查询语句', category: 'DATABASE_ENG', icon: '💾' },
  { id: 'C18', name: '数据库建模与 ER 图', description: '设计数据库表结构并生成 ER 图', category: 'DATABASE_ENG', icon: '🗺️' },
  { id: 'C19', name: '数据库性能优化', description: '分析慢查询并提供索引优化建议', category: 'DATABASE_ENG', icon: '⚡' },
  { id: 'C20', name: '数据库迁移工具', description: '支持 Oracle 等数据库的 SQL 转换与迁移', category: 'DATABASE_ENG', icon: '🔄' },

  // C21-C25: 大前端开发
  { id: 'C21', name: 'React 组件生成', description: '根据需求自动生成 React 组件代码', category: 'FRONTEND_DEV', icon: '⚛️' },
  { id: 'C22', name: 'Vue 组件生成', description: '根据需求自动生成 Vue 组件代码', category: 'FRONTEND_DEV', icon: '💚' },
  { id: 'C23', name: '响应式布局生成', description: '自动生成 PC/移动端适配的响应式布局', category: 'FRONTEND_DEV', icon: '📱' },
  { id: 'C24', name: '图表可视化生成', description: '根据数据自动生成 ECharts/D3 图表', category: 'FRONTEND_DEV', icon: '📊' },
  { id: 'C25', name: '数据大屏设计', description: '自动生成数据可视化大屏界面', category: 'FRONTEND_DEV', icon: '🖥️' },

  // C26-C30: 测试与质量保证
  { id: 'C26', name: '单元测试生成', description: '自动生成 Jest/Vitest 单元测试代码', category: 'TEST_QA', icon: '✅' },
  { id: 'C27', name: 'API 接口测试', description: '使用 Postman/ApiFox 进行 API 测试', category: 'TEST_QA', icon: '🔬' },
  { id: 'C28', name: '性能压力测试', description: '使用 JMeter/k6 进行性能压力测试', category: 'TEST_QA', icon: '🏋️' },
  { id: 'C29', name: '代码质量扫描', description: '使用 SonarQube 进行代码质量扫描', category: 'TEST_QA', icon: '🔍' },
  { id: 'C30', name: 'UI 自动化测试', description: '使用 Selenium/Cypress 进行 UI 自动化测试', category: 'TEST_QA', icon: '🤖' },

  // C31-C35: 运维与持续集成
  { id: 'C31', name: 'Docker 镜像构建', description: '编写 Dockerfile 构建应用镜像', category: 'DEVOPS', icon: '🐳' },
  { id: 'C32', name: 'K8s 部署配置', description: '编写 Kubernetes 部署 YAML 与 Helm Chart', category: 'DEVOPS', icon: '☸️' },
  { id: 'C33', name: 'CI/CD 流水线', description: '配置 GitHub Actions/GitLab CI 流水线', category: 'DEVOPS', icon: '🔄' },
  { id: 'C34', name: '监控告警系统', description: '搭建 Prometheus+Grafana 监控告警系统', category: 'DEVOPS', icon: '📊' },
  { id: 'C35', name: '日志收集与分析', description: '搭建 ELK/Loki 日志收集与分析系统', category: 'DEVOPS', icon: '📝' },

  // C36-C40: 安全合规
  { id: 'C36', name: 'SQL 注入检测', description: '检测并修复 SQL 注入漏洞', category: 'SECURITY', icon: '🛡️' },
  { id: 'C37', name: 'XSS 跨站脚本防护', description: '检测和修复 XSS 跨站脚本攻击漏洞', category: 'SECURITY', icon: '🔒' },
  { id: 'C38', name: '依赖漏洞扫描', description: '扫描 npm/maven 依赖漏洞并升级', category: 'SECURITY', icon: '🔍' },
  { id: 'C39', name: '等保 2.0 合规检查', description: '检查系统是否符合等保 2.0 要求', category: 'SECURITY', icon: '📋' },
  { id: 'C40', name: '数据脱敏处理', description: '对敏感数据进行脱敏处理', category: 'SECURITY', icon: '🔐' },

  // C41-C45: 项目管理
  { id: 'C41', name: 'WBS 工作分解', description: '自动生成 WBS 工作分解结构', category: 'PROJ_MGMT', icon: '📋' },
  { id: 'C42', name: '项目进度甘特图', description: '自动生成项目进度甘特图', category: 'PROJ_MGMT', icon: '📅' },
  { id: 'C43', name: '风险评估矩阵', description: '生成项目风险评估矩阵', category: 'PROJ_MGMT', icon: '⚠️' },
  { id: 'C44', name: '资源分配优化', description: '优化项目资源分配', category: 'PROJ_MGMT', icon: '👥' },
  { id: 'C45', name: '项目文档生成', description: '自动生成项目相关文档', category: 'PROJ_MGMT', icon: '📄' },

  // C46-C53: 知识资产
  { id: 'C46', name: 'API 文档生成', description: '自动生成 API 接口文档', category: 'KNOWLEDGE', icon: '📖' },
  { id: 'C47', name: '代码注释生成', description: '自动生成代码注释', category: 'KNOWLEDGE', icon: '💬' },
  { id: 'C48', name: '知识库管理', description: '管理项目知识库', category: 'KNOWLEDGE', icon: '📚' },
  { id: 'C49', name: '智能问答机器人', description: '基于项目知识的智能问答', category: 'KNOWLEDGE', icon: '🤖' },
  { id: 'C50', name: '代码审查报告', description: '生成代码审查报告', category: 'KNOWLEDGE', icon: '📝' },
  { id: 'C51', name: '最佳实践推荐', description: '推荐行业最佳实践', category: 'KNOWLEDGE', icon: '💡' },
  { id: 'C52', name: '技术栈推荐', description: '根据项目需求推荐技术栈', category: 'KNOWLEDGE', icon: '🛠️' },
  { id: 'C53', name: '项目总结报告 (PPT)', description: '自动生成项目总结报告 PPT', category: 'KNOWLEDGE', icon: '📊' },
];

/**
 * 组件权限 Token 定义
 * 用于权限检查
 */
export const COMPONENT_PERMISSION_TOKENS = COMPONENTS.reduce((acc, comp) => {
  acc[comp.id] = `component:${comp.id}:${comp.category}`;
  return acc;
}, {} as Record<string, string>);

/**
 * 获取组件分类名称
 */
export function getComponentCategoryName(category: ComponentCategory): string {
  return COMPONENT_CATEGORIES[category].name;
}

/**
 * 根据 ID 获取组件
 */
export function getComponentById(id: string): ComponentDefinition | undefined {
  return COMPONENTS.find(c => c.id === id);
}

/**
 * 获取指定分类的所有组件
 */
export function getComponentsByCategory(category: ComponentCategory): ComponentDefinition[] {
  return COMPONENTS.filter(c => c.category === category);
}

/**
 * 验证组件 ID 是否有效
 */
export function isValidComponentId(id: string): boolean {
  return COMPONENTS.some(c => c.id === id);
}
