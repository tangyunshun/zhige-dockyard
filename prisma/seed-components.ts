import { PrismaClient } from "@prisma/client";
import { COMPONENT_CATALOG_SEED, COMPONENT_CATEGORY_SEED } from "./component-catalog-data";

const prisma = new PrismaClient();

/**
 * 新空间默认装配的 5 套件组件 ID（对应 component_catalog.isDefault 标记）
 * 运行时一律从数据库 component_catalog.isDefault 读取，本常量仅供 seed 初始化一次性写入。
 */
const DEFAULT_COMPONENT_IDS = ["C01", "C02", "C07", "C11", "C12"];

/**
 * 组件扩展数据（数据流动契约 + 智能搜索关键词）
 * 运行时一律从数据库 component_catalog 读取，本文件仅供 seed 初始化一次性写入。
 */
const COMPONENT_EXTRA_SEED: Record<
  string,
  { contract: string; keywords: string[] }
> = {
  C01: { contract: "标书 ➜ 偏离表", keywords: ["标书", "招标", "rfp", "投标", "偏离表"] },
  C02: { contract: "方案 ➜ 合规报告", keywords: ["合规", "安全体检", "等保", "密码安全"] },
  C03: { contract: "竞品资料 ➜ 对比表", keywords: ["竞品", "对比", "优势", "劣势"] },
  C04: { contract: "技术方案 ➜ 白话汇报", keywords: ["汇报", "白话文", "翻译", "沟通"] },
  C05: { contract: "模块清单 ➜ 成本测算", keywords: ["工时", "成本", "估算", "报价"] },
  C06: { contract: "投入产出 ➜ ROI报告", keywords: ["投资回报", "roi", "收益", "回收周期"] },
  C07: { contract: "会议纪要 ➜ PRD", keywords: ["prd", "需求", "会议纪要", "脑图", "会议"] },
  C08: { contract: "主流程 ➜ 异常清单", keywords: ["异常", "边界", "场景补全", "断网", "支付失败"] },
  C09: { contract: "差评 ➜ 缺陷单", keywords: ["差评", "聚类", "缺陷单", "投诉", "bug"] },
  C10: { contract: "规则 ➜ 模拟数据", keywords: ["测试数据", "模拟", "虚拟", "脱敏"] },
  C11: { contract: "需求 ➜ Rest API", keywords: ["api", "接口", "后端", "rest", "crud"] },
  C12: { contract: "表关系 ➜ DDL/ER图", keywords: ["表关系", "er图", "ddl", "关联", "建表"] },
  C13: { contract: "通信需求 ➜ WS代码", keywords: ["websocket", "即时通信", "聊天", "实时"] },
  C14: { contract: "业务 ➜ 队列代码", keywords: ["rabbitmq", "kafka", "消息队列", "高并发"] },
  C15: { contract: "QPS ➜ Redis方案", keywords: ["redis", "缓存", "内存提速", "穿透"] },
  C16: { contract: "角色 ➜ 鉴权代码", keywords: ["登录", "jwt", "oauth", "权限", "鉴权"] },
  C17: { contract: "白话 ➜ SQL", keywords: ["sql", "查询", "数据库", "联查"] },
  C18: { contract: "实体 ➜ ER图", keywords: ["建表", "er图", "表结构", "ddl"] },
  C19: { contract: "慢查询日志 ➜ 整改方案", keywords: ["慢sql", "慢查询", "索引", "优化", "explain"] },
  C20: { contract: "DDL ➜ 目标库DDL", keywords: ["数据库迁移", "oracle", "mysql", "平移", "语法转换"] },
  C21: { contract: "需求 ➜ React代码", keywords: ["react", "网页", "前端", "组件", "tsx"] },
  C22: { contract: "需求 ➜ Vue代码", keywords: ["vue", "网页", "前端", "组件", "vue3"] },
  C23: { contract: "布局 ➜ 响应式CSS", keywords: ["响应式", "自适应", "手机", "屏幕", "断点"] },
  C24: { contract: "数据 ➜ ECharts", keywords: ["图表", "echarts", "数据可视化", "折线", "饼图"] },
  C25: { contract: "指标 ➜ 监控大屏", keywords: ["大屏", "监控", "可视化看板", "轮询"] },
  C26: { contract: "源码 ➜ 单测", keywords: ["单元测试", "jest", "单测", "vitest"] },
  C27: { contract: "接口定义 ➜ 测试用例", keywords: ["接口测试", "swagger", "openapi", "调试"] },
  C28: { contract: "URL ➜ 压测脚本", keywords: ["压测", "压力测试", "jmeter", "并发"] },
  C29: { contract: "源码 ➜ 体检报告", keywords: ["代码扫描", "质量", "垃圾代码", "重复"] },
  C30: { contract: "操作流 ➜ 自动化脚本", keywords: ["ui测试", "playwright", "cypress", "自动化"] },
  C31: { contract: "配置 ➜ Docker", keywords: ["docker", "容器", "打包", "dockerfile"] },
  C32: { contract: "配置 ➜ K8s YAML", keywords: ["k8s", "kubernetes", "扩容", "集群", "调度"] },
  C33: { contract: "仓库 ➜ 流水线", keywords: ["cicd", "流水线", "发布", "部署"] },
  C34: { contract: "指标 ➜ 告警规则", keywords: ["监控", "告警", "prometheus", "grafana"] },
  C35: { contract: "日志 ➜ 日志大盘", keywords: ["日志", "log", "排查", "收集"] },
  C36: { contract: "代码 ➜ 修复项", keywords: ["防注入", "sql注入", "数据库安全", "黑客"] },
  C37: { contract: "网页 ➜ CSP规则", keywords: ["木马", "csp", "网页安全", "广告植入"] },
  C38: { contract: "依赖清单 ➜ 漏洞报告", keywords: ["漏洞", "cve", "三方包", "依赖"] },
  C39: { contract: "架构 ➜ 自查报告", keywords: ["等保", "合规", "自查", "安全"] },
  C40: { contract: "敏感数据 ➜ 脱敏代码", keywords: ["脱敏", "打码", "隐私", "身份证"] },
  C41: { contract: "目标 ➜ WBS", keywords: ["wbs", "任务分解", "排期", "里程碑"] },
  C42: { contract: "任务清单 ➜ 甘特图", keywords: ["甘特图", "进度", "排期", "依赖"] },
  C43: { contract: "项目 ➜ 风险预案", keywords: ["风险", "预案", "防亏损", "防范"] },
  C44: { contract: "工时 ➜ 排班表", keywords: ["排班", "资源", "饱和度", "闲置"] },
  C45: { contract: "交付物 ➜ 结项报告", keywords: ["结项", "报告", "交付", "收尾"] },
  C46: { contract: "Swagger ➜ API", keywords: ["接口文档", "说明书", "swagger", "联调"] },
  C47: { contract: "代码 ➜ 中文批注", keywords: ["代码翻译", "注释", "批注", "白话"] },
  C48: { contract: "文档 ➜ 全文索引", keywords: ["全文搜索", "检索", "索引", "资料"] },
  C49: { contract: "知识库 ➜ 智能问答", keywords: ["问答", "客服", "知识库", "答疑"] },
  C50: { contract: "Diff ➜ 审查报告", keywords: ["代码审查", "review", "pr", "整改"] },
  C51: { contract: "瓶颈 ➜ 架构方案", keywords: ["架构", "设计模式", "规约", "演进"] },
  C52: { contract: "需求 ➜ 选型方案", keywords: ["技术选型", "架构", "框架", "建议"] },
  C53: { contract: "历史故障 ➜ SOP", keywords: ["sop", "避坑", "经验", "教训"] },
  C54: { contract: "源码 ➜ 偏离度诊断", keywords: ["智能分析", "效能引擎", "静态评审", "偏离度"] },
  C55: { contract: "配置 ➜ 巡检大盘", keywords: ["部署", "cicd", "环境巡检", "流水线"] },
  C56: { contract: "契约 ➜ 骨架代码", keywords: ["代码生成", "骨架代码", "openapi", "转写"] },
  C57: { contract: "项目 ➜ 漏洞预警", keywords: ["安全审计", "漏洞扫描", "凭据防泄露", "审计"] },
  C58: { contract: "PRD ➜ 测试用例", keywords: ["文档解析", "需求分析", "sop规约", "用例"] },
  C59: { contract: "模块 ➜ 覆盖率报告", keywords: ["自动化测试", "回归套件", "覆盖率", "断言"] },
  C60: { contract: "功能 ➜ RESTful API", keywords: ["后端", "api", "restful", "核心接口"] },
};

async function main() {
  console.log("开始初始化组件目录（component_catalog）...");

  // 清理历史上非规范的英文 ID
  await prisma.componentcatalog.deleteMany({
    where: {
      id: {
        in: ["AI_ENGINE", "DEV_OPS", "CODE_GEN", "SECURITY", "DOC_PARSER", "TEST_RUNNER", "BACKEND_CORE"],
      },
    },
  });

  // 1. 分类初始化
  let catCreated = 0;
  for (const cat of COMPONENT_CATEGORY_SEED) {
    try {
      await prisma.componentcategory.upsert({
        where: { key: cat.key },
        update: {
          name: cat.name,
          color: cat.color,
          range: cat.range,
          sortOrder: cat.sortOrder,
        },
        create: {
          key: cat.key,
          name: cat.name,
          color: cat.color,
          range: cat.range,
          sortOrder: cat.sortOrder,
        },
      });
      catCreated++;
    } catch (error) {
      console.error(`Failed to upsert category ${cat.key}:`, error);
    }
  }

  // 2. 组件目录初始化
  let created = 0;
  for (const component of COMPONENT_CATALOG_SEED) {
    try {
      await prisma.componentcatalog.upsert({
        where: { id: component.id },
        update: {
          name: component.name,
          description: component.description,
          category: component.category,
          icon: component.icon,
          tags: component.tags,
          isPremium: component.isPremium,
          estimatedTokens: component.estimatedTokens,
          previewData: component.previewData,
          businessTags: component.businessTags,
          inputMode: component.inputMode,
          accept: component.accept ?? null,
          hint: component.hint ?? null,
          detail: (component as any).detail ?? null,
          isDefault: DEFAULT_COMPONENT_IDS.includes(component.id),
          contract: COMPONENT_EXTRA_SEED[component.id]?.contract ?? null,
          keywords: COMPONENT_EXTRA_SEED[component.id]?.keywords ?? null,
          sortOrder: component.sortOrder,
          isPublished: component.isPublished ?? true,
          usageCount: component.usageCount,
        },
        create: {
          id: component.id,
          name: component.name,
          description: component.description,
          category: component.category,
          icon: component.icon,
          tags: component.tags,
          isPremium: component.isPremium,
          estimatedTokens: component.estimatedTokens,
          previewData: component.previewData,
          businessTags: component.businessTags,
          inputMode: component.inputMode,
          accept: component.accept ?? null,
          hint: component.hint ?? null,
          detail: (component as any).detail ?? null,
          isDefault: DEFAULT_COMPONENT_IDS.includes(component.id),
          contract: COMPONENT_EXTRA_SEED[component.id]?.contract ?? null,
          keywords: COMPONENT_EXTRA_SEED[component.id]?.keywords ?? null,
          sortOrder: component.sortOrder,
          isPublished: component.isPublished ?? true,
          usageCount: component.usageCount,
        },
      });
      created++;
      console.log(`✓ 组件 ${component.id} - ${component.name} 已就绪`);
    } catch (error) {
      console.error(`Failed to upsert component ${component.id}:`, error);
    }
  }

  console.log(`\n组件目录初始化完成！`);
  console.log(`分类：${catCreated} / ${COMPONENT_CATEGORY_SEED.length}`);
  console.log(`组件：${created} / ${COMPONENT_CATALOG_SEED.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
