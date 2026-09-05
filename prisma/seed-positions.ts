/**
 * 岗位 seed：写入 10 大标准预置岗位定义。
 * 运行时岗位数据一律从数据库 position 表读取（/api/studio?action=preset-positions），
 * 本文件仅供初始化一次性写入，代码中不再硬编码岗位信息。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const POSITION_SEED: Array<{
  id: string;
  code: string;
  name: string;
  badge: string;
  icon: string;
  colorCls: string;
  description: string;
  editable: boolean;
  defaultAllowedComponentIds?: string[];
  sortOrder: number;
}> = [
  {
    id: "pos_owner",
    code: "OWNER",
    name: "空间所有者",
    badge: "最高管控",
    icon: "👑",
    colorCls: "bg-amber-50 text-amber-600 border-amber-200",
    description: "空间创建者，拥有全局最高管理权、敏感视窗查看权及全量组件调度特权",
    editable: false,
    sortOrder: 1,
  },
  {
    id: "pos_admin",
    code: "ADMIN",
    name: "空间管理员",
    badge: "团队管理",
    icon: "🛡️",
    colorCls: "bg-purple-50 text-[#805ad5] border-purple-200",
    description: "空间协管员，协助所有者管理空间资产、审计日志与成员分配",
    editable: false,
    sortOrder: 2,
  },
  {
    id: "pos_pm",
    code: "PROJECT_MANAGER",
    name: "项目经理",
    badge: "业务调度",
    icon: "💼",
    colorCls: "bg-blue-50 text-[#2b6cb0] border-blue-200",
    description: "项目进度、资源与工期排布负责人，具备核心业务与开发组件的调度全权限",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12"],
    sortOrder: 3,
  },
  {
    id: "pos_bid",
    code: "BID_SPECIALIST",
    name: "投标专家",
    badge: "商务打单",
    icon: "📄",
    colorCls: "bg-blue-50 text-[#3182ce] border-blue-200",
    description: "商机前期对接、招标文件解析、投标偏离比对与商务安全体检",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C03", "C04", "C07", "C11", "C12"],
    sortOrder: 4,
  },
  {
    id: "pos_prd",
    code: "PRODUCT_MANAGER",
    name: "产品经理",
    badge: "需求设计",
    icon: "🧩",
    colorCls: "bg-emerald-50 text-[#10b981] border-emerald-200",
    description: "产品原型设计、会议纪要生成 PRD、需求变更跟踪与生命周期规划",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C07", "C08", "C09", "C11", "C12"],
    sortOrder: 5,
  },
  {
    id: "pos_ui",
    code: "UI_DESIGNER",
    name: "UI/UX 视觉设计师",
    badge: "界面视觉",
    icon: "📐",
    colorCls: "bg-blue-50 text-[#63b3ed] border-blue-200",
    description: "大前端 UI 画布生成、视觉风格设计、交互规范与界面组件库维护",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C07", "C08", "C11"],
    sortOrder: 6,
  },
  {
    id: "pos_backend",
    code: "BACKEND_ENGINEER",
    name: "后端开发工程师",
    badge: "核心研发",
    icon: "💻",
    colorCls: "bg-indigo-50 text-[#5a67d8] border-indigo-200",
    description: "后端微服务接口开发、OpenAPI 契约生成、数据关联模型设计",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C03", "C04", "C07", "C10", "C11", "C12"],
    sortOrder: 7,
  },
  {
    id: "pos_dba",
    code: "DBA_ARCHITECT",
    name: "数据架构师",
    badge: "数据架构",
    icon: "🏗️",
    colorCls: "bg-amber-50 text-[#d97706] border-amber-200",
    description: "全域数据架构规划、数据仓库分层建模、数据标准与多租户数据隔离架构设计",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C04", "C11", "C12"],
    sortOrder: 8,
  },
  {
    id: "pos_qa",
    code: "QA_ENGINEER",
    name: "QA工程师",
    badge: "质量保证",
    icon: "✅",
    colorCls: "bg-emerald-50 text-emerald-600 border-emerald-200",
    description: "质量体系构建、代码质量度量、性能压测与上线发布质量门禁",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C07", "C11", "C12"],
    sortOrder: 9,
  },
  {
    id: "pos_devops",
    code: "DEVOPS_ENGINEER",
    name: "运维工程师",
    badge: "运维部署",
    icon: "🐳",
    colorCls: "bg-slate-100 text-slate-700 border-slate-200",
    description: "持续集成打包部署、容器化服务挂载、系统运行监控与高可用保障",
    editable: true,
    defaultAllowedComponentIds: ["C05"],
    sortOrder: 10,
  },
  {
    id: "pos_viewer",
    code: "VIEWER",
    name: "空间审计员",
    badge: "审计监督",
    icon: "👁️",
    colorCls: "bg-slate-100 text-slate-500 border-slate-200",
    description: "外部合规审计、专家评审视角，负责操作日志审计、数据合规审查与只读安全监管",
    editable: false,
    defaultAllowedComponentIds: [],
    sortOrder: 11,
  },
  {
    id: "pos_delivery",
    code: "DELIVERY_OWNER",
    name: "交付负责人",
    badge: "交付统筹",
    icon: "🚚",
    colorCls: "bg-blue-50 text-[#2b6cb0] border-blue-200",
    description: "项目交付全周期统筹与客户验收对接，负责交付风险与里程碑节点管控",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C07", "C11", "C12"],
    sortOrder: 12,
  },
  {
    id: "pos_business",
    code: "BUSINESS_SOLUTION",
    name: "商务方案师",
    badge: "商务方案",
    icon: "📝",
    colorCls: "bg-sky-50 text-[#3182ce] border-sky-200",
    description: "商务方案编制与报价策略设计，负责客户商务谈判支持与方案合规体检",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C03", "C04", "C07", "C11", "C12"],
    sortOrder: 13,
  },
  {
    id: "pos_database_admin",
    code: "DATABASE_ADMIN",
    name: "数据库管理员",
    badge: "数据库运维",
    icon: "🗄️",
    colorCls: "bg-amber-50 text-[#d97706] border-amber-200",
    description: "数据库实例部署运维、SQL 脚本与表结构优化、索引治理、备份恢复与性能调优",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C04", "C11", "C12"],
    sortOrder: 14,
  },
  {
    id: "pos_requirement_analyst",
    code: "REQUIREMENT_ANALYST",
    name: "需求分析师",
    badge: "需求分析",
    icon: "🔍",
    colorCls: "bg-emerald-50 text-[#10b981] border-emerald-200",
    description: "业务需求调研梳理、用户故事拆解、需求规格说明书编制与需求变更影响评估",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C07", "C08", "C09", "C11", "C12"],
    sortOrder: 15,
  },
  {
    id: "pos_test_engineer",
    code: "TEST_ENGINEER",
    name: "测试工程师",
    badge: "功能测试",
    icon: "🧪",
    colorCls: "bg-emerald-50 text-emerald-600 border-emerald-200",
    description: "测试用例设计与执行、缺陷跟踪回归验证、接口与端到端功能测试",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C07", "C11", "C12"],
    sortOrder: 16,
  },
];

async function main() {
  for (const p of POSITION_SEED) {
    await prisma.position.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        badge: p.badge,
        icon: p.icon,
        colorCls: p.colorCls,
        description: p.description,
        isPreset: true,
        editable: p.editable,
        status: "ACTIVE",
        defaultAllowedComponentIds: p.defaultAllowedComponentIds ?? undefined,
        sortOrder: p.sortOrder,
      },
      create: {
        id: p.id,
        code: p.code,
        name: p.name,
        badge: p.badge,
        icon: p.icon,
        colorCls: p.colorCls,
        description: p.description,
        isPreset: true,
        editable: p.editable,
        status: "ACTIVE",
        defaultAllowedComponentIds: p.defaultAllowedComponentIds ?? undefined,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`岗位数据初始化完成：共 ${POSITION_SEED.length} 个预置岗位`);
}

main()
  .catch((e) => {
    console.error("岗位 seed 失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
