import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const stages = [
  { id: "stage_01", name: "第一阶段：商机捕获与售前打单", description: "商机发现、需求初步分析、售前方案制作", sortOrder: 1 },
  { id: "stage_02", name: "第二阶段：需求定义与产品设计", description: "需求文档撰写、产品原型设计、用户故事定义", sortOrder: 2 },
  { id: "stage_03", name: "第三阶段：大前端与交互", description: "前端界面开发、交互设计、用户体验优化", sortOrder: 3 },
  { id: "stage_04", name: "第四阶段：架构设计与 DBA", description: "系统架构设计、数据库设计、数据治理", sortOrder: 4 },
  { id: "stage_05", name: "第五阶段：后端研发与 API", description: "后端服务开发、API 设计、接口文档", sortOrder: 5 },
  { id: "stage_06", name: "第六阶段：质量保证 QA", description: "测试用例设计、自动化测试、质量监控", sortOrder: 6 },
  { id: "stage_07", name: "第七阶段：DevOps 与运维", description: "持续集成、持续部署、运维监控", sortOrder: 7 },
  { id: "stage_08", name: "第八阶段：交付实施与协同", description: "项目交付、客户培训、文档编写", sortOrder: 8 },
  { id: "stage_09", name: "第九阶段：系统扩展底座", description: "系统扩展、平台化建设、技术底座", sortOrder: 9 },
  { id: "stage_10", name: "第十阶段：交付与可视化", description: "成果展示、数据可视化、汇报演示", sortOrder: 10 },
];

const components = [
  { id: "C01", name: "标书智能解析", description: "提取标书关键条款，自动对比产品能力生成偏离表", type: "第一阶段：商机捕获与售前打单", icon: "FileText", tags: "标书，解析，分析", sortOrder: 1, usageCount: 3421 },
  { id: "C02", name: "方案合规审查", description: "离线扫描技术方案，检查等保、国密等合规风险", type: "第一阶段：商机捕获与售前打单", icon: "ShieldCheck", tags: "合规，审查，安全", sortOrder: 2, usageCount: 2156 },
  { id: "C03", name: "竞品对比分析", description: "提取竞品文档核心数据，生成多维度对比矩阵", type: "第一阶段：商机捕获与售前打单", icon: "TrendingUp", tags: "竞品，对比，分析", sortOrder: 3, usageCount: 1876 },
  { id: "C04", name: "汇报话术转换", description: "根据汇报对象（高管/技术），自动调整技术方案的表达深度", type: "第一阶段：商机捕获与售前打单", icon: "Languages", tags: "汇报，话术，转换", sortOrder: 4, usageCount: 2543 },
  { id: "C05", name: "项目成本测算", description: "结合历史数据推算项目隐性成本与预估毛利", type: "第一阶段：商机捕获与售前打单", icon: "Calculator", tags: "成本，测算，财务", sortOrder: 5, usageCount: 1234 },
  { id: "C06", name: "商业价值评估", description: "量化功能收益与开发成本，生成投入产出比报告", type: "第一阶段：商机捕获与售前打单", icon: "Lightbulb", tags: "商业，价值，评估", sortOrder: 6, usageCount: 987 },
  { id: "C07", name: "需求转 PRD", description: "将会议纪要或聊天记录，整理为结构化需求文档", type: "第二阶段：需求定义与产品设计", icon: "MessageSquare", tags: "需求，PRD，文档", sortOrder: 7, usageCount: 4521 },
  { id: "C08", name: "异常场景补全", description: "根据主流程自动补充边界、并发等异常场景的处理建议", type: "第二阶段：需求定义与产品设计", icon: "AlertTriangle", tags: "异常，场景，补全", sortOrder: 8, usageCount: 3245 },
  { id: "C09", name: "客诉归因分析", description: "聚类分析多渠道客诉数据，自动生成研发缺陷单", type: "第二阶段：需求定义与产品设计", icon: "Heart", tags: "客诉，归因，分析", sortOrder: 9, usageCount: 2876 },
  { id: "C10", name: "仿真数据生成", description: "依据真实行业规则，批量生成高逼真的业务测试数据", type: "第二阶段：需求定义与产品设计", icon: "Database", tags: "仿真，数据，生成", sortOrder: 10, usageCount: 5432 },
  { id: "C11", name: "CSS 样式重构", description: "分析旧项目冗余样式，精简代码并提取设计规范 Token", type: "第三阶段：大前端与交互", icon: "Palette", tags: "CSS，样式，重构", sortOrder: 11, usageCount: 2134 },
  { id: "C12", name: "国际化词条校验", description: "检查多语言配置的完整性，智能翻译并预警 UI 文本截断", type: "第三阶段：大前端与交互", icon: "Languages", tags: "国际化，多语言，校验", sortOrder: 12, usageCount: 1765 },
  { id: "C13", name: "页面合规检测", description: "扫描前端代码结构，输出无障碍访问及 SEO 优化建议", type: "第三阶段：大前端与交互", icon: "Accessibility", tags: "合规，检测，SEO", sortOrder: 13, usageCount: 1432 },
  { id: "C14", name: "SVG 组件转换", description: "压缩图标体积，一键转换为可复用的前端代码组件", type: "第三阶段：大前端与交互", icon: "Image", tags: "SVG，图标，转换", sortOrder: 14, usageCount: 2987 },
  { id: "C15", name: "设计稿转代码", description: "识别设计图布局，生成基础的 HTML5 与 CSS 结构", type: "第三阶段：大前端与交互", icon: "LayoutTemplate", tags: "设计稿，代码，生成", sortOrder: 15, usageCount: 3654 },
  { id: "C16", name: "数据库逆向解析", description: "扫描老旧数据库，自动生成 ER 关系图与数据字典", type: "第四阶段：架构设计与 DBA", icon: "Database", tags: "数据库，逆向，ER 图", sortOrder: 16, usageCount: 4123 },
  { id: "C17", name: "慢 SQL 优化", description: "分析数据库执行计划，提供索引建立与查询重写建议", type: "第四阶段：架构设计与 DBA", icon: "Activity", tags: "SQL，优化，性能", sortOrder: 17, usageCount: 3567 },
  { id: "C18", name: "微服务拆分建议", description: "基于表关联度与访问频率，自动推荐服务拆分边界", type: "第四阶段：架构设计与 DBA", icon: "Scissors", tags: "微服务，拆分，架构", sortOrder: 18, usageCount: 2345 },
  { id: "C19", name: "数据迁移脚本", description: "跨数据库类型映射，生成数据清洗与迁移脚本", type: "第四阶段：架构设计与 DBA", icon: "FileSpreadsheet", tags: "数据，迁移，脚本", sortOrder: 19, usageCount: 1876 },
  { id: "C20", name: "国产库语法转换", description: "将 Oracle 等传统 SQL 自动转换为达梦或人大金仓语法", type: "第四阶段：架构设计与 DBA", icon: "BookOpen", tags: "国产库，语法，转换", sortOrder: 20, usageCount: 1234 },
  { id: "C21", name: "架构图代码生成", description: "根据自然语言描述，直接生成 Mermaid 架构和时序图代码", type: "第四阶段：架构设计与 DBA", icon: "GitMerge", tags: "架构图，Mermaid，生成", sortOrder: 21, usageCount: 2987 },
  { id: "C22", name: "生产数据脱敏", description: "对导出的生产数据进行掩码处理，保障测试环境隐私安全", type: "第五阶段：后端研发与 API", icon: "Key", tags: "数据，脱敏，安全", sortOrder: 22, usageCount: 3421 },
  { id: "C23", name: "接口文档逆向", description: "扫描后端源码，反向生成标准 OpenAPI/Swagger 文档", type: "第五阶段：后端研发与 API", icon: "FileCode", tags: "接口，文档，逆向", sortOrder: 23, usageCount: 2654 },
  { id: "C24", name: "JSON 转实体类", description: "粘贴 JSON 报文，一键生成 Java/Go/TS 等强类型实体代码", type: "第五阶段：后端研发与 API", icon: "Braces", tags: "JSON，实体类，转换", sortOrder: 24, usageCount: 4532 },
  { id: "C25", name: "接口参数映射", description: "推理无文档 API 的参数含义，生成字段映射表与测试脚本", type: "第五阶段：后端研发与 API", icon: "Plug", tags: "接口，参数，映射", sortOrder: 25, usageCount: 1987 },
  { id: "C26", name: "正则表达式解析", description: "将复杂正则翻译为自然语言和图表，检测回溯性能风险", type: "第五阶段：后端研发与 API", icon: "SearchCheck", tags: "正则，解析，分析", sortOrder: 26, usageCount: 1543 },
  { id: "C27", name: "硬件错误码诊断", description: "匹配设备厂商错误码库，直接给出硬件或 SDK 报错原因", type: "第五阶段：后端研发与 API", icon: "Bug", tags: "硬件，错误码，诊断", sortOrder: 27, usageCount: 2876 },
  { id: "C28", name: "测试用例生成", description: "解析需求文档，自动生成涵盖正逆向与边界的用例表", type: "第六阶段：质量保证 QA", icon: "TestTube2", tags: "测试，用例，生成", sortOrder: 28, usageCount: 3765 },
  { id: "C29", name: "漏洞 Payload 构造", description: "批量生成用于安全测试的注入、越权及超长脏数据", type: "第六阶段：质量保证 QA", icon: "Wind", tags: "漏洞，安全，测试", sortOrder: 29, usageCount: 2134 },
  { id: "C30", name: "缺陷单自动完善", description: "识别报错截图，自动补全复现步骤与环境前置条件", type: "第六阶段：质量保证 QA", icon: "ImageMinus", tags: "缺陷，截图，完善", sortOrder: 30, usageCount: 2987 },
  { id: "C31", name: "压测脚本与分析", description: "根据性能指标生成 JMeter 脚本，并解析测试报告瓶颈", type: "第六阶段：质量保证 QA", icon: "Activity", tags: "压测，性能，分析", sortOrder: 31, usageCount: 1876 },
  { id: "C32", name: "UI 自动化修复", description: "对比前端 DOM 变更，批量修复失效的测试选择器", type: "第六阶段：质量保证 QA", icon: "Wrench", tags: "UI，自动化，修复", sortOrder: 32, usageCount: 2345 },
  { id: "C33", name: "报错日志根因分析", description: "过滤海量日志，聚合报错堆栈并定位故障根本原因", type: "第七阶段：DevOps 与运维", icon: "Activity", tags: "日志，分析，根因", sortOrder: 33, usageCount: 4321 },
  { id: "C34", name: "云资源降本优化", description: "识别闲置云资源，一键生成资源释放或降配脚本", type: "第七阶段：DevOps 与运维", icon: "Cloud", tags: "云资源，降本，优化", sortOrder: 34, usageCount: 1654 },
  { id: "C35", name: "开源合规审计", description: "扫描代码依赖树，预警 GPL 等传染性开源协议风险", type: "第七阶段：DevOps 与运维", icon: "Scale", tags: "开源，合规，审计", sortOrder: 35, usageCount: 2123 },
  { id: "C36", name: "漏扫报告转化", description: "将第三方安全扫描报告，转化为开发可直接执行的代码修复单", type: "第七阶段：DevOps 与运维", icon: "FileWarning", tags: "漏扫，安全，修复", sortOrder: 36, usageCount: 2876 },
  { id: "C37", name: "配置文件检查", description: "校验 Nginx/K8s 配置的逻辑冲突，预防发布事故", type: "第七阶段：DevOps 与运维", icon: "Settings", tags: "配置，检查，K8s", sortOrder: 37, usageCount: 1987 },
  { id: "C38", name: "容器镜像瘦身", description: "优化 Dockerfile 构建步骤，清理冗余依赖以压缩镜像体积", type: "第七阶段：DevOps 与运维", icon: "Package", tags: "容器，镜像，优化", sortOrder: 38, usageCount: 3245 },
  { id: "C39", name: "项目汇报美化", description: "润色项目延期或技术阻碍等敏感汇报的语言表达", type: "第八阶段：交付实施与协同", icon: "Shirt", tags: "汇报，美化，表达", sortOrder: 39, usageCount: 2654 },
  { id: "C40", name: "硬件日志诊断", description: "解析非标准设备日志，辅助软硬件联调排障", type: "第八阶段：交付实施与协同", icon: "Phone", tags: "硬件，日志，诊断", sortOrder: 40, usageCount: 1876 },
  { id: "C41", name: "验收单据生成", description: "提取往来邮件记录，批量生成符合甲方规范的验收确认单", type: "第八阶段：交付实施与协同", icon: "Signature", tags: "验收，单据，生成", sortOrder: 41, usageCount: 1234 },
  { id: "C42", name: "操作手册生成", description: "识别系统截图交互点，自动生成图文并茂的用户使用手册", type: "第八阶段：交付实施与协同", icon: "FileText", tags: "手册，文档，生成", sortOrder: 42, usageCount: 3421 },
  { id: "C43", name: "敏捷回顾总结", description: "过滤情绪化发言，从会议记录中提炼具体的改进任务", type: "第八阶段：交付实施与协同", icon: "Smile", tags: "敏捷，回顾，总结", sortOrder: 43, usageCount: 2134 },
  { id: "C44", name: "研发效能分析", description: "结合代码提交与工单数据，客观评估团队成员技术贡献度", type: "第八阶段：交付实施与协同", icon: "Users", tags: "效能，分析，评估", sortOrder: 44, usageCount: 1543 },
  { id: "C45", name: "团队知识库问答", description: "索引本地多格式文档，构建团队内部安全的知识问答助手", type: "第八阶段：交付实施与协同", icon: "Network", tags: "知识库，问答，AI", sortOrder: 45, usageCount: 2987 },
  { id: "C46", name: "多模型路由网关", description: "统一调度云端与本地大模型 API，实现负载均衡与计费控制", type: "第九阶段：系统扩展底座", icon: "Server", tags: "模型，路由，网关", sortOrder: 46, usageCount: 5432 },
  { id: "C47", name: "全局视觉内核", description: "统管平台设计规范，提供标准化前端 UI 组件库", type: "第九阶段：系统扩展底座", icon: "Palette", tags: "视觉，设计，组件库", sortOrder: 47, usageCount: 4321 },
  { id: "C48", name: "工作流编排器", description: "可视化拖拽编排工具，支持多组件串联的复杂任务流", type: "第九阶段：系统扩展底座", icon: "Settings", tags: "工作流，编排，可视化", sortOrder: 48, usageCount: 3654 },
  { id: "C49", name: "脚本 UI 化工具", description: "将命令行脚本一键封装为带交互界面的可执行桌面程序", type: "第九阶段：系统扩展底座", icon: "Terminal", tags: "脚本，UI，工具", sortOrder: 49, usageCount: 2876 },
  { id: "C50", name: "本地向量数据库", description: "提供轻量级本地向量存储与检索，支持断网环境运作", type: "第九阶段：系统扩展底座", icon: "Database", tags: "向量，数据库，本地", sortOrder: 50, usageCount: 2134 },
  { id: "C51", name: "授权与计费中心", description: "管理组件调用配额，提供机器码绑定的本地防破解验证", type: "第九阶段：系统扩展底座", icon: "CreditCard", tags: "授权，计费，安全", sortOrder: 51, usageCount: 1765 },
  { id: "C52", name: "沙箱隔离环境", description: "限制模型对本地文件的读写权限，确保数据处理绝对安全", type: "第九阶段：系统扩展底座", icon: "FolderLock", tags: "沙箱，隔离，安全", sortOrder: 52, usageCount: 2345 },
  { id: "C53", name: "架构可视化渲染", description: "将底层代码/文本，无缝渲染为标准交互式系统架构图与脑图", type: "第十阶段：交付与可视化", icon: "MonitorPlay", tags: "可视化，架构图，渲染", sortOrder: 53, usageCount: 3987 },
];

async function main() {
  console.log("🌱 开始插入阶段和组件数据...\n");

  try {
    console.log("📦 正在插入 10 个阶段配置...");
    for (const stage of stages) {
      await prisma.componenttask.upsert({
        where: { id: stage.id },
        update: { name: stage.name, description: stage.description, type: stage.name, sortOrder: stage.sortOrder, isPublished: true, status: "published", config: { isStageConfig: true, isActive: true, description: stage.description } },
        create: { id: stage.id, name: stage.name, description: stage.description, type: stage.name, sortOrder: stage.sortOrder, isPublished: true, status: "published", config: { isStageConfig: true, isActive: true, description: stage.description } },
      });
      console.log(`  ✓ 阶段已插入：${stage.name}`);
    }

    console.log("\n🧩 正在插入 53 个组件配置...");
    for (const component of components) {
      await prisma.componenttask.upsert({
        where: { id: component.id },
        update: { name: component.name, description: component.description, type: component.type, icon: component.icon, tags: component.tags, sortOrder: component.sortOrder, usageCount: component.usageCount, isPublished: true, status: "published" },
        create: { id: component.id, name: component.name, description: component.description, type: component.type, icon: component.icon, tags: component.tags, sortOrder: component.sortOrder, usageCount: component.usageCount, isPublished: true, status: "published" },
      });
      console.log(`  ✓ 组件已插入：${component.id} - ${component.name}`);
    }

    console.log("\n✅ 所有数据插入完成！");
    console.log(`\n📊 统计:`);
    console.log(`   - 阶段数量：${stages.length}`);
    console.log(`   - 组件数量：${components.length}`);
  } catch (error) {
    console.error("❌ 插入数据失败:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(() => { console.log("\n✨ 种子脚本执行完成！"); process.exit(0); }).catch((e) => { console.error("\n💥 脚本执行失败:", e); process.exit(1); });
