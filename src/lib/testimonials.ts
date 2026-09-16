/**
 * 用户评价（口碑）数据源
 * ==================================================================
 * 架构说明：
 *   - 数据层（本文件）与展示层（components/TestimonialsSection.tsx）分离，
 *     组件只消费类型化的 Testimonial，不关心数据从哪来。
 *   - 当前内容为「精选/策划的用户评价文案」，属**营销展示内容**，
 *     统一在此维护，避免散落在 JSX 中。
 *   - 后续如需接入真实数据（数据库 review 表 / 开放接口），
 *     只需把下方 TESTIMONIALS 改为异步获取（如 fetchTestimonials()），
 *     组件层无需改动。
 */

export type TestimonialCategory = "personal" | "enterprise";

export interface Testimonial {
  id: string;
  /** 归属人群：个人用户 / 企业客户 */
  category: TestimonialCategory;
  /** 评价者姓名/称呼 */
  name: string;
  /** 身份或岗位 */
  role: string;
  /** 企业客户为所属单位；个人用户留空 */
  org?: string;
  /** 头像图片 URL（数据库驱动时由管理员上传/填写；为空则回退为 avatarText 首字） */
  avatar?: string;
  /** 头像文字（取姓名首字，避免外链图片与额外请求） */
  avatarText: string;
  /** 评分 1-5 星 */
  rating: number;
  /** 评价正文 */
  content: string;
  /** 能力标签，与产品功能项对应 */
  tags: string[];
  /** 可选：一条可量化的成效指标 */
  highlight?: { label: string; value: string };
}

export const TESTIMONIAL_CATEGORY_LABEL: Record<TestimonialCategory, string> = {
  personal: "个人用户",
  enterprise: "企业客户",
};

export const TESTIMONIALS: Testimonial[] = [
  // ---------------- 个人用户 ----------------
  {
    id: "t-personal-1",
    category: "personal",
    name: "林一帆",
    role: "全栈独立开发者",
    avatarText: "林",
    rating: 5,
    content:
      "以前从需求到上线要来回切换五六个工具，现在标书解析、PRD 和组件拼装都在同一个空间里完成，一个人也能顶小半个团队。",
    tags: ["PRD 生成", "组件拼装"],
    highlight: { label: "个人项目交付周期", value: "-45%" },
  },
  {
    id: "t-personal-2",
    category: "personal",
    name: "陈默",
    role: "产品经理",
    avatarText: "陈",
    rating: 5,
    content:
      "把零散的会议想法丢进去，能自动补齐业务边界并生成结构化 PRD，需求评审时少了很多来回扯皮。",
    tags: ["需求梳理", "边界补全"],
    highlight: { label: "需求评审轮次", value: "3 → 1" },
  },
  {
    id: "t-personal-3",
    category: "personal",
    name: "张宁",
    role: "前端工程师",
    avatarText: "张",
    rating: 4,
    content:
      "组件库可以直接复用，UI 规范和接口契约能自动对齐，前后端联调的时间压缩了不少。",
    tags: ["原子组件库", "接口契约"],
  },

  // ---------------- 企业客户 ----------------
  {
    id: "t-enterprise-1",
    category: "enterprise",
    name: "王立群",
    role: "技术总监",
    org: "恒晟软件",
    avatarText: "王",
    rating: 5,
    content:
      "整套系统私有化部署在客户内网，研发资产不出内网，国密链路也顺利通过了甲方安全审查——这直接决定了我们能不能接政企项目。",
    tags: ["私有化部署", "合规审计"],
    highlight: { label: "客户安全审查", value: "一次通过" },
  },
  {
    id: "t-enterprise-2",
    category: "enterprise",
    name: "李婧",
    role: "交付负责人",
    org: "云维信息",
    avatarText: "李",
    rating: 5,
    content:
      "交付质量标准化之后，新人也能按同一套组件与模板产出，实施阶段的返工明显下降，交付节奏更可控了。",
    tags: ["标准化交付", "团队协同"],
    highlight: { label: "实施返工率", value: "-60%" },
  },
  {
    id: "t-enterprise-3",
    category: "enterprise",
    name: "赵鹏",
    role: "CTO",
    org: "智联数据",
    avatarText: "赵",
    rating: 5,
    content:
      "算力点按需配给，成员独立额度与空间共享池划分得很清楚，成本可控，不用再为闲置资源买单。",
    tags: ["算力配给", "成本可控"],
    highlight: { label: "闲置资源支出", value: "显著下降" },
  },
];

/** 口碑汇总指标（展示于评价区顶部） */
export interface TestimonialStat {
  value: string;
  /** 单位/后缀，如 "/ 5.0" */
  sub?: string;
  label: string;
}

export const TESTIMONIAL_STATS: TestimonialStat[] = [
  { value: "4.9", sub: "/ 5.0", label: "综合满意度评分" },
  { value: "98%", label: "用户愿意推荐给同事" },
  { value: "3,600+", label: "覆盖研发团队与个人开发者" },
];

/** 按人群筛选评价 */
export function getTestimonialsByCategory(category: TestimonialCategory): Testimonial[] {
  return TESTIMONIALS.filter((t) => t.category === category);
}
