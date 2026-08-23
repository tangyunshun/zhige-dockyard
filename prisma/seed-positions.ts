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
    name: "项目经理 / 交付负责人",
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
    name: "投标专家 / 商务方案师",
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
    name: "产品经理 / 需求分析师",
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
    name: "数据库 / 数据架构师",
    badge: "数据工程",
    icon: "🗄️",
    colorCls: "bg-amber-50 text-[#d97706] border-amber-200",
    description: "数据库 SQL 脚本自动生成、表结构优化、索引分析与多租户隔离架构",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C04", "C11", "C12"],
    sortOrder: 8,
  },
  {
    id: "pos_qa",
    code: "QA_ENGINEER",
    name: "QA 测试与质量工程师",
    badge: "质量保证",
    icon: "✅",
    colorCls: "bg-emerald-50 text-emerald-600 border-emerald-200",
    description: "自动化接口合规测试、代码扫描、质量合规排错与性能压力测试",
    editable: true,
    defaultAllowedComponentIds: ["C01", "C02", "C07", "C11", "C12"],
    sortOrder: 9,
  },
  {
    id: "pos_devops",
    code: "DEVOPS_ENGINEER",
    name: "DevOps 运维 / 安全工程师",
    badge: "运维安全",
    icon: "🐳",
    colorCls: "bg-slate-100 text-slate-700 border-slate-200",
    description: "持续集成打包部署、容器化服务挂载、网络安全防护与黑客防御拦截",
    editable: true,
    defaultAllowedComponentIds: ["C05"],
    sortOrder: 10,
  },
  {
    id: "pos_viewer",
    code: "VIEWER",
    name: "只读观察员 / 审计员",
    badge: "审计查看",
    icon: "👁️",
    colorCls: "bg-slate-100 text-slate-500 border-slate-200",
    description: "外部合规审计、专家评审视角，仅具备只读查看权限，100% 禁止调度任何组件",
    editable: false,
    defaultAllowedComponentIds: [],
    sortOrder: 11,
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
