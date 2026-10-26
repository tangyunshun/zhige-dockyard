/**
 * 【管理员专用】《以后新增组件的标准操作手册》默认内容
 *
 * 存储位置：systemconfig 表，key = admin_component_manual（MediumText，JSON）。
 * 访问入口：GET /api/admin/components/manual（需 component:read 权限；首次访问自动落库）。
 * 展示位置：管理后台 → 组件管理 → 工具栏「操作手册」按钮弹窗。
 * 刻意不放入文档中心（systemdocument）：文档中心面向全平台用户，本手册仅系统管理员可见。
 */

export interface ManualBlock {
  /** text=普通段落 warn=红色警示 tip=蓝色提示 */
  type: "text" | "warn" | "tip";
  text: string;
}

export interface ManualStep {
  step: number;
  title: string;
  blocks: ManualBlock[];
}

export interface AdminComponentManual {
  title: string;
  subtitle: string;
  version: string;
  steps: ManualStep[];
}

export const MANUAL_CONFIG_KEY = "admin_component_manual";

export const DEFAULT_ADMIN_COMPONENT_MANUAL: AdminComponentManual = {
  title: "以后新增组件的标准操作手册",
  subtitle: "组件 = 数据库合同（Prompt 模板为核心）。按这五步走，每一步都有校验兜底。",
  version: "v1.0（2026-10-25）",
  steps: [
    {
      step: 1,
      title: "建目录，填成本",
      blocks: [
        { type: "text", text: "入口：管理后台 → 组件管理 → 右上「新增组件」。" },
        { type: "text", text: "名称、描述、所属阶段（领域分类）、图标、标签照实填写。描述要写清楚两件事：这个组件是干什么的、它期待什么样的输入材料。空间管理员装配组件时主要看这里。" },
        { type: "warn", text: "「每次执行扣点数」必须填真实数字（1 算力点 = 0.01 元，这是用户每次执行实际扣的点）。留空虽然能保存，但会弹出警告并要求二次确认——警告的意思就是：不填这个数，组件执行时会提示「算力成本未配置」，一单都跑不起来。" },
        { type: "tip", text: "顺手核对三处联动配置：预估输入/输出 Token（供成本底线测算）、目录允许格式（accept，如 .pdf, .docx）、输入方式（文本/文件）。第 2 步合同里的允许格式要与这里一致，否则用户可能无法上传文件。" },
        { type: "text", text: "检查点：组件列表里能看到新组件，状态为「未上架」。" },
      ],
    },
    {
      step: 2,
      title: "写合同，模板必须含章节",
      blocks: [
        { type: "text", text: "入口：管理后台 → 组件合同 → 选中该组件 → 新建草稿版本（首个版本号用 1.0.0）。" },
        { type: "text", text: "合同要配置四块：输入（文本/文件、最小长度等约束）、执行计划（Prompt 模板 + 输入映射）、输出（类型、产物格式）、质量门禁（必填章节、最小输出长度）。" },
        { type: "warn", text: "核心规则：把「必填章节」里写的每个章节名原样写进 Prompt 模板。比如必填章节有「测试结论」，模板里就必须出现『测试结论』这几个字，并明确指示模型照着输出。少写一个，保存直接被拦，红字会告诉您缺哪个。" },
        { type: "tip", text: "为什么这么严：必填章节是执行期输出质量门禁。模板缺章节 → 模型输出缺章节 → 输出校验全败 → 任务全部失败全额退款（C07 v1.1.0 七连败事故）。这道拦截就是防它重演的。" },
        { type: "text", text: "注意：已发布版本永久锁定不可修改。要改内容，另起新版本号的新草稿。" },
      ],
    },
    {
      step: 3,
      title: "校验 → 发布 → 激活",
      blocks: [
        { type: "text", text: "保存草稿后，先点「本地校验」确认 100% 通过；有红字就回去改，别硬发布。" },
        { type: "text", text: "点「发布」：发布后该版本永久锁定，同时组件正式具备执行资格。" },
        { type: "text", text: "多版本并存时，用「激活」切换当前生效版本。激活同样会先过必填章节校验，拦得住绕过前端直调接口的情况。" },
      ],
    },
    {
      step: 4,
      title: "试跑两单——一单成功、一单失败",
      blocks: [
        { type: "text", text: "到组件运行面板真实执行一单：输入材料 → 执行 → 应该 SUCCESS，并且点数流水里扣掉了预期点数（到算力流水明细里核对扣点数字）。" },
        { type: "text", text: "再故意制造一次失败：比如把输入缩短到不满足最小长度 → 应该 FAILED，且刚才扣的点全额退回（流水里出现 REFUND，本次净额为 0）。" },
        { type: "warn", text: "两单都符合，说明计费与退款链路是通的。任何一单不符合，停下来排查，禁止上架。" },
        { type: "tip", text: "真实执行会消耗真实模型费用，试跑请控制输入输出长度，单组件验证成本控制在几厘到几分钱即可。" },
      ],
    },
    {
      step: 5,
      title: "转正式",
      blocks: [
        { type: "text", text: "把组件名称和描述里的「测试」字样改掉，确认组件处于「已上架」状态，即可正式投入各空间装配使用。" },
        { type: "text", text: "以后迭代功能：改草稿 → 新版本号 → 重新走第 2-4 步。永远不要动已发布的老版本——历史快照不可变，线上出问题时可随时回退激活旧版本。" },
      ],
    },
  ],
};
