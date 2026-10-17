/**
 * 组件可视化 v2 种子：
 * 1) 为全部组件配置 accent 主题色（按分类配色，存数据库，驱动图表配色，前端不硬编码）
 * 2) 代码生成 / DevOps 类组件升级为 console 终端执行模拟（输入 / 过程 / 输出取自组件真实文案）
 * 3) 链路类组件升级为 pipeline 管线流程图（复用既有 nodes 数据，呈现流动光效管线）
 *
 * 运行：node prisma/seed-component-visuals-v2.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 分类主题色（存数据库，前端按 visual.accent 渲染）
const CATEGORY_ACCENT = {
  BID_PREP: "#3182ce",
  REQ_DESIGN: "#6366f1",
  BACKEND_CORE: "#0ea5e9",
  DATABASE_ENG: "#8b5cf6",
  FRONTEND_DEV: "#ec4899",
  TEST_QA: "#f59e0b",
  DEVOPS: "#10b981",
  SECURITY: "#ef4444",
  PROJ_MGMT: "#d97706",
  KNOWLEDGE: "#4f46e5",
};
// 无分类组件的专属主题色
const ID_ACCENT = {
  C16: "#ef4444",
  C22: "#ec4899",
  C51: "#4f46e5",
  C52: "#8b5cf6",
  C58: "#6366f1",
  C59: "#f59e0b",
  C60: "#0ea5e9",
};

// 升级为 console 终端执行模拟的组件（输入 / 过程 / 输出全部取自组件真实文案）
const CONSOLE_UPGRADES = {
  C10: {
    title: "执行示例 · 批量生成测试数据",
    input: "行业模板：电商 ｜ 条数：10,000",
    steps: ["加载行业字段模板…", "应用脱敏规则…"],
    output: "已生成 10,000 条数据：随机姓名 + 打码手机号 + 逼真交易",
  },
  C11: {
    title: "执行示例 · 生成数据接口",
    input: "设计用户注册、手机验证码登录的 API",
    steps: ["解析接口契约…", "注入参数校验规则…", "套用统一错误码…"],
    output: "Node.js 接口已生成：字段校验 + 错误提示 + 说明书注解",
  },
  C17: {
    title: "执行示例 · SQL 生成",
    input: "查近 30 天订单总额前 10 的消费用户",
    steps: ["语义解析为 SQL 骨架…", "匹配索引建议…"],
    output: "SELECT … ORDER BY total DESC LIMIT 10 ｜ 建议索引：orders.user_id / created_at",
  },
  C21: {
    title: "执行示例 · React 组件生成",
    input: "关键词搜索、表格分页展示的数据列表页",
    steps: ["规划组件结构…", "绑定状态与请求逻辑…"],
    output: "React 源码已生成：响应式网格 + 分页状态 + 单测用例",
  },
  C22: {
    title: "执行示例 · Vue3 组件生成",
    input: "用户管理列表：筛选 + 分页 + 批量删除",
    steps: ["设计组合式 API…", "生成模板与样式…"],
    output: "Vue3 组件已生成：setup 语法 + 响应式绑定",
  },
  C24: {
    title: "执行示例 · 图表配置生成",
    input: "销售排行数据 → 炫酷柱状图",
    steps: ["匹配图表类型…", "注入渐变配色…"],
    output: "ECharts option 已生成：渐变 + tooltip + 自适应",
  },
  C31: {
    title: "执行示例 · Docker 打包",
    input: "语言：Node.js ｜ 依赖：Python3 编译环境",
    steps: ["生成多阶段构建…", "精简运行层…"],
    output: "Dockerfile 已生成（多阶段）+ 标准构建命令",
  },
  C33: {
    title: "执行示例 · 发布流水线",
    input: "仓库：GitHub ｜ 环境：生产",
    steps: ["① 拉取代码", "② 安全扫描", "③ 编译构建", "④ 自动上线"],
    output: "流水线配置已生成：提交代码即自动发布",
  },
  C35: {
    title: "执行示例 · 日志大盘接入",
    input: "日志路径：/var/app/*.log ｜ 格式：nginx",
    steps: ["下发采集配置…", "建立集中索引…"],
    output: "日志大盘就绪：1 秒检索全集群错误堆栈",
  },
  C55: {
    title: "执行示例 · 自动部署",
    input: "目标：生产环境 ｜ APP_ENV=prod",
    steps: ["执行构建流水线…", "采集巡检日志…"],
    output: "部署完成，巡检看板已更新",
  },
  C56: {
    title: "执行示例 · 契约转码",
    input: "上传 openapi.yaml（12 个接口）",
    steps: ["解析契约结构…", "映射分层模板…"],
    output: "Controller / Service / Model 骨架已生成（12 组文件）",
  },
  C60: {
    title: "执行示例 · 生产级接口",
    input: "核心接口：下单（要求幂等 + 限流）",
    steps: ["套用生产级模板…", "注入幂等与限流要点…"],
    output: "生产级接口骨架已生成：校验 + 错误码 + 幂等 + 限流",
  },
};

// 升级为 pipeline 管线流程图的组件（复用既有 nodes 数据，只换类型与呈现）
const PIPELINE_UPGRADES = ["C12", "C18", "C20", "C27", "C28", "C30", "C46", "C48", "C49", "C53"];

// 从未配置过图表类型的组件：补基础流程图，保证 60 个组件全部有专属可视化
const FLOW_FALLBACKS = {
  C51: {
    title: "设计模式推荐链路",
    nodes: [
      { tag: "输入", title: "业务场景描述", desc: "如订单状态频繁变更" },
      { title: "模式匹配", desc: "状态机 / 策略 / 观察者等" },
      { tag: "输出", title: "模式建议 + 规约条款", desc: "附适用边界与反模式警示" },
    ],
  },
  C52: {
    title: "技术选型对比链路",
    nodes: [
      { tag: "输入", title: "业务规模与约束", desc: "订单量 / 并发 / 团队技术栈" },
      { title: "候选方案对比", desc: "数据库 / 缓存 / 消息队列" },
      { tag: "输出", title: "选型结论", desc: "附适用边界与迁移成本" },
    ],
  },
  C58: {
    title: "需求解析链路",
    nodes: [
      { tag: "输入", title: "PRD / 需求描述", desc: "文档上传或直接粘贴" },
      { title: "功能点提取", desc: "验收标准与隐含依赖" },
      { tag: "输出", title: "疑点与清单", desc: "模糊冲突条目标记" },
    ],
  },
  C59: {
    title: "测试脚手架生成链路",
    nodes: [
      { tag: "输入", title: "测试范围选择", desc: "单元 / 接口 / UI" },
      { title: "脚手架生成", desc: "用例组织 + 断言库 + Mock" },
      { tag: "输出", title: "报告模板", desc: "CI 集成说明同步输出" },
    ],
  },
};

async function main() {
  const comps = await prisma.componentcatalog.findMany({ orderBy: { id: "asc" } });
  let updated = 0;

  for (const comp of comps) {
    const detail = (comp.detail && typeof comp.detail === "object" ? { ...comp.detail } : {}) || {};
    const visual = { ...(detail.visual && typeof detail.visual === "object" ? detail.visual : {}) };

    // 主题色：分类色优先，无分类组件用专属色
    const accent = CATEGORY_ACCENT[comp.category] || ID_ACCENT[comp.id] || "#3182ce";
    visual.accent = accent;

    // console 终端执行模拟升级
    const consoleUp = CONSOLE_UPGRADES[comp.id];
    if (consoleUp) {
      visual.kind = "console";
      visual.consoleSpec = consoleUp;
      if (!visual.title) visual.title = consoleUp.title;
    }

    // pipeline 管线流程图升级（需已有 nodes 数据）
    if (PIPELINE_UPGRADES.includes(comp.id) && Array.isArray(visual.nodes) && visual.nodes.length >= 2) {
      visual.kind = "pipeline";
    }

    // 从未配置过图表类型的组件补基础流程图
    if (!visual.kind && FLOW_FALLBACKS[comp.id]) {
      const fb = FLOW_FALLBACKS[comp.id];
      visual.kind = "flow";
      visual.title = fb.title;
      visual.nodes = fb.nodes;
    }

    detail.visual = visual;
    await prisma.componentcatalog.update({ where: { id: comp.id }, data: { detail } });
    updated++;
    console.log(`✔ ${comp.id} ${comp.name} → ${visual.kind} / 主题色 ${accent}`);
  }

  console.log(`\n--- 完成：更新 ${updated} 个组件的主题色与图表类型 ---`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
