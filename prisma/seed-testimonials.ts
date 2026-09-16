/**
 * 首页「用户评价」种子数据
 * ==================================================================
 * 生成 5 组 × 6 条（3 条个人用户 + 3 条企业客户），供「每周自动轮换」开箱即用。
 *
 * 运行：npx tsx prisma/seed-testimonials.ts
 *      npx tsx prisma/seed-testimonials.ts --force   # 覆盖已存在条目（会覆盖后台的编辑内容，慎用）
 *
 * 特性：
 *   - 按固定 id（t-g{组号}-{序号}）幂等写入；默认**跳过已存在条目**，不会覆盖管理员在后台的修改；
 *   - 同时初始化轮换配置（auto 模式 + 起始展示第 1 组 + 计时起点）。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedCategory = "personal" | "enterprise";

interface SeedItem {
  groupNo: number;
  category: SeedCategory;
  name: string;
  role: string;
  org?: string;
  rating: number;
  content: string;
  tags: string[];
  highlightLabel?: string;
  highlightValue?: string;
}

const DATA: SeedItem[] = [
  // ================= 第 1 组 =================
  { groupNo: 1, category: "personal", name: "林一帆", role: "全栈独立开发者", rating: 5, content: "以前从需求到上线要来回切换五六个工具，现在标书解析、PRD 和组件拼装都在同一个空间里完成，一个人也能顶小半个团队。", tags: ["PRD 生成", "组件拼装"], highlightLabel: "个人项目交付周期", highlightValue: "-45%" },
  { groupNo: 1, category: "personal", name: "陈默", role: "产品经理", rating: 5, content: "把零散的会议想法丢进去，能自动补齐业务边界并生成结构化 PRD，需求评审时少了很多来回扯皮。", tags: ["需求梳理", "边界补全"], highlightLabel: "需求评审轮次", highlightValue: "3 → 1" },
  { groupNo: 1, category: "personal", name: "张宁", role: "前端工程师", rating: 4, content: "组件库可以直接复用，UI 规范和接口契约能自动对齐，前后端联调的时间压缩了不少。", tags: ["原子组件库", "接口契约"] },
  { groupNo: 1, category: "enterprise", name: "王立群", role: "技术总监", org: "恒晟软件", rating: 5, content: "整套系统私有化部署在客户内网，研发资产不出内网，国密链路也顺利通过了甲方安全审查——这直接决定了我们能不能接政企项目。", tags: ["私有化部署", "合规审计"], highlightLabel: "客户安全审查", highlightValue: "一次通过" },
  { groupNo: 1, category: "enterprise", name: "李婧", role: "交付负责人", org: "云维信息", rating: 5, content: "交付质量标准化之后，新人也能按同一套组件与模板产出，实施阶段的返工明显下降，交付节奏更可控了。", tags: ["标准化交付", "团队协同"], highlightLabel: "实施返工率", highlightValue: "-60%" },
  { groupNo: 1, category: "enterprise", name: "赵鹏", role: "CTO", org: "智联数据", rating: 5, content: "算力点按需配给，成员独立额度与空间共享池划分得很清楚，成本可控，不用再为闲置资源买单。", tags: ["算力配给", "成本可控"], highlightLabel: "闲置资源支出", highlightValue: "显著下降" },

  // ================= 第 2 组 =================
  { groupNo: 2, category: "personal", name: "苏航", role: "独立全栈开发者", rating: 5, content: "一个人接项目最怕需求变来变去，现在变更能直接落到 PRD 和组件配置里，返工少了很多。", tags: ["需求变更", "PRD"], highlightLabel: "需求返工", highlightValue: "-40%" },
  { groupNo: 2, category: "personal", name: "何雨欣", role: "测试工程师", rating: 4, content: "评审记录和用例能跟着组件走，回归时不用再翻聊天记录找上下文。", tags: ["测试用例", "可追溯"] },
  { groupNo: 2, category: "personal", name: "周维", role: "后端工程师", rating: 5, content: "接口契约先生成好再写实现，前后端几乎不用来回对字段。", tags: ["接口契约", "联调提效"] },
  { groupNo: 2, category: "enterprise", name: "郑海涛", role: "研发总监", org: "中科智软", rating: 5, content: "把标准岗位和权限模板下发到各个项目组之后，人员流动时的交接成本低了很多。", tags: ["岗位体系", "权限模板"], highlightLabel: "交接耗时", highlightValue: "-50%" },
  { groupNo: 2, category: "enterprise", name: "吴敏", role: "项目经理", org: "天元信息", rating: 5, content: "项目从立项到验收的节点都能留痕，甲方临时要材料时随时能导出来。", tags: ["过程留痕", "交付材料"] },
  { groupNo: 2, category: "enterprise", name: "冯磊", role: "架构师", org: "星辰数据", rating: 4, content: "组件化拼装让架构评审变简单了，方案改动的影响面一眼就能看清。", tags: ["组件化", "架构评审"] },

  // ================= 第 3 组 =================
  { groupNo: 3, category: "personal", name: "罗嘉", role: "独立开发者", rating: 5, content: "算力点用多少扣多少，做小项目的时候成本心里有数，不怕月底突然超支。", tags: ["算力计量", "成本可控"] },
  { groupNo: 3, category: "personal", name: "曾琳", role: "UI 设计师", rating: 5, content: "设计规范直接落在组件里，交付给开发时不用再逐个标注间距和字号。", tags: ["设计规范", "组件交付"], highlightLabel: "标注工作量", highlightValue: "-70%" },
  { groupNo: 3, category: "personal", name: "蔡俊", role: "数据工程师", rating: 4, content: "资料丢进去能自动整理成结构化内容，回溯历史决策方便了很多。", tags: ["资料解析", "知识沉淀"] },
  { groupNo: 3, category: "enterprise", name: "谢文斌", role: "信息化负责人", org: "启明软件", rating: 5, content: "私有化部署加国密链路，顺利通过了集团的等保审查，这是能真正落地的关键。", tags: ["私有化部署", "等保合规"], highlightLabel: "集团安全审查", highlightValue: "一次通过" },
  { groupNo: 3, category: "enterprise", name: "唐雪", role: "交付经理", org: "博远科技", rating: 5, content: "同一套模板复用到不同客户的行业项目上，实施周期明显缩短。", tags: ["模板复用", "实施效率"], highlightLabel: "实施周期", highlightValue: "-35%" },
  { groupNo: 3, category: "enterprise", name: "马骁", role: "技术副总裁", org: "云图智能", rating: 5, content: "成员独立额度和共享池分开管理，费用能归集到人和项目，报销结算时清楚多了。", tags: ["额度管理", "成本归集"] },

  // ================= 第 4 组 =================
  { groupNo: 4, category: "personal", name: "韩野", role: "独立全栈开发者", rating: 5, content: "从标书到技术方案基本能自动串起来，接私活时的效率提升非常明显。", tags: ["标书解析", "方案生成"], highlightLabel: "方案产出效率", highlightValue: "×2" },
  { groupNo: 4, category: "personal", name: "沈佳", role: "前端工程师", rating: 5, content: "组件库开箱即用，新项目一起手就是规范的结构，不用再搭脚手架。", tags: ["开箱即用", "工程规范"] },
  { groupNo: 4, category: "personal", name: "邓子豪", role: "产品经理", rating: 4, content: "原型和 PRD 能同步生成，跟开发对齐需求时省了很多沟通成本。", tags: ["原型草图", "PRD"] },
  { groupNo: 4, category: "enterprise", name: "高翔", role: "CTO", org: "恒信软件", rating: 5, content: "把公司多年沉淀的交付方法论固化进组件之后，新人上手速度明显加快。", tags: ["知识固化", "团队建设"], highlightLabel: "新人上手周期", highlightValue: "-40%" },
  { groupNo: 4, category: "enterprise", name: "白露", role: "质量负责人", org: "联创信息", rating: 5, content: "交付质量有了统一标准可查，客户侧的投诉明显减少。", tags: ["质量标准", "客户满意"], highlightLabel: "交付类投诉", highlightValue: "-55%" },
  { groupNo: 4, category: "enterprise", name: "徐立", role: "运维负责人", org: "中天科技", rating: 5, content: "整个平台部署在内网，运维边界清晰，安全审计也更容易通过。", tags: ["内网部署", "安全审计"] },

  // ================= 第 5 组 =================
  { groupNo: 5, category: "personal", name: "潘毅", role: "独立开发者", rating: 5, content: "需求一改不用重写文档，改动能直接反映到最终交付物上，省心很多。", tags: ["文档同步", "交付一致"] },
  { groupNo: 5, category: "personal", name: "姚遥", role: "后端工程师", rating: 5, content: "权限和数据隔离开箱就有，不用再自己搭一套，节省了大量前期时间。", tags: ["权限隔离", "开箱即用"], highlightLabel: "基础设施搭建", highlightValue: "-80%" },
  { groupNo: 5, category: "personal", name: "邹凯", role: "算法工程师", rating: 4, content: "本地知识库结合算力点计费，做小规模效果验证的成本很低。", tags: ["本地知识库", "算力计费"] },
  { groupNo: 5, category: "enterprise", name: "梁思远", role: "技术总监", org: "智远软件", rating: 5, content: "跨部门协作时权限边界很清楚，谁能看什么一目了然，安全上很放心。", tags: ["权限边界", "跨部门协作"] },
  { groupNo: 5, category: "enterprise", name: "邱涵", role: "交付总监", org: "华云数据", rating: 5, content: "方案配置能一键下发到各个空间，多项目并行时管理成本下降很多。", tags: ["一键下发", "多项目管理"], highlightLabel: "并行管理成本", highlightValue: "-45%" },
  { groupNo: 5, category: "enterprise", name: "魏东", role: "CEO", org: "汇智科技", rating: 5, content: "把研发过程沉淀成可复用的资产，是我们能规模化交付的底气。", tags: ["资产沉淀", "规模交付"] },
];

/**
 * 写实职业头像分配（文件位于 public/uploads/testimonials/）
 * 女 → p01 p03 p05 p07 p09 p12 p14；男 → p02 p04 p06 p08 p10 p11 p13 p15
 */
const AVATAR_BY_NAME: Record<string, string> = {
  林一帆: "p11", 陈默: "p01", 张宁: "p02", 王立群: "p08", 李婧: "p07", 赵鹏: "p04",
  苏航: "p06", 何雨欣: "p14", 周维: "p15", 郑海涛: "p10", 吴敏: "p12", 冯磊: "p13",
  罗嘉: "p02", 曾琳: "p03", 蔡俊: "p11", 谢文斌: "p10", 唐雪: "p05", 马骁: "p04",
  韩野: "p15", 沈佳: "p09", 邓子豪: "p06", 高翔: "p08", 白露: "p14", 徐立: "p13",
  潘毅: "p02", 姚遥: "p07", 邹凯: "p11", 梁思远: "p13", 邱涵: "p12", 魏东: "p04",
};

const CONFIG_KEYS = {
  mode: "testimonial_rotation_mode",
  activeGroup: "testimonial_active_group",
  lastRotatedAt: "testimonial_last_rotated_at",
};

async function initRotationConfig() {
  const existing = await prisma.systemconfig.findUnique({ where: { key: CONFIG_KEYS.mode } });
  if (existing) {
    console.log("[seed-testimonials] 轮换配置已存在，保持不变");
    return;
  }
  const now = new Date().toISOString();
  await prisma.systemconfig.createMany({
    data: [
      { key: CONFIG_KEYS.mode, value: "auto" },
      { key: CONFIG_KEYS.activeGroup, value: "1" },
      { key: CONFIG_KEYS.lastRotatedAt, value: now },
    ],
  });
  console.log("[seed-testimonials] 轮换配置已初始化：auto 模式，起始展示第 1 组");
}

async function main() {
  const force = process.argv.includes("--force");
  let created = 0;
  let skipped = 0;
  let overwritten = 0;
  const sortCounter = new Map<number, number>();

  for (const item of DATA) {
    const nextSort = sortCounter.get(item.groupNo) ?? 0;
    sortCounter.set(item.groupNo, nextSort + 1);

    const id = `t-g${item.groupNo}-${String(nextSort + 1).padStart(2, "0")}`;
    const payload = {
      groupNo: item.groupNo,
      category: item.category,
      name: item.name,
      role: item.role,
      org: item.org ?? null,
      avatar: AVATAR_BY_NAME[item.name]
        ? `/uploads/testimonials/${AVATAR_BY_NAME[item.name]}.jpeg`
        : null,
      rating: item.rating,
      content: item.content,
      tags: item.tags,
      highlightLabel: item.highlightLabel ?? null,
      highlightValue: item.highlightValue ?? null,
      sortOrder: nextSort,
      status: "active",
    };

    const exists = await prisma.testimonial.findUnique({ where: { id } });
    if (exists) {
      if (force) {
        await prisma.testimonial.update({ where: { id }, data: payload });
        overwritten++;
      } else {
        skipped++;
      }
      continue;
    }

    await prisma.testimonial.create({ data: { id, ...payload } });
    created++;
  }

  await initRotationConfig();

  const total = await prisma.testimonial.count();
  console.log(
    `[seed-testimonials] 完成：新增 ${created}，跳过 ${skipped}，覆盖 ${overwritten}，当前总计 ${total} 条`
  );
}

main()
  .catch((e) => {
    console.error("[seed-testimonials] 失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
