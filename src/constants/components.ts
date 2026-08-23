/**
 * 组件库公共类型与权限规则
 * 注意：组件元数据（名称/描述/分类/图标/标签/计费/预览/输入方式）全部保存在数据库
 * （component_catalog / component_category 表），由 /api/studio?action=catalog 统一提供，
 * 代码中不再硬编码任何组件信息。
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
  // 以下字段与数据库 component_catalog 表一一对应
  inputMode?: ComponentInputMode; // text | file | both
  accept?: string; // 文件上传支持的格式
  hint?: string;   // 界面引导文案
  contract?: string;    // 数据流动契约描述（如 "标书 ➜ 偏离表"）
  keywords?: string[];  // 智能搜索关键词
  usageCount?: number;  // 全网累计调用次数
  isDefault?: boolean;  // 新空间默认装配标记
}

/**
 * 组件输入方式（与数据库 component_catalog.inputMode 字段对应）
 * - text: 仅支持直接输入/粘贴文字
 * - file: 仅支持上传文档，由系统从文件中解析文字内容
 * - both: 两者皆可（上传文件 或 输入文字）
 */
export type ComponentInputMode = "text" | "file" | "both";

export interface ComponentInputInfo {
  mode: ComponentInputMode;
  accept: string; // 文件上传支持的格式
  hint: string;   // 界面引导文案
}

export type ComponentCategory =
  | "BID_PREP"
  | "REQ_DESIGN"
  | "BACKEND_CORE"
  | "DATABASE_ENG"
  | "FRONTEND_DEV"
  | "TEST_QA"
  | "DEVOPS"
  | "SECURITY"
  | "PROJ_MGMT"
  | "KNOWLEDGE";

export interface CategoryDetails {
  name: string;
  color: string;
  range: string;
  sortOrder?: number; // 数据库 component_category.sortOrder（阶段分组顺序）
}
