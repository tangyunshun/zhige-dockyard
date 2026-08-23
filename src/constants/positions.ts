/**
 * 《知阁·舟坊》产研协同专业岗位模型
 * 说明：10 大标准预置岗位定义已全部入库（position 表，seed 初始化），
 * 运行时由 /api/studio?action=catalog 的 presetPositions 字段经 AppContext 提供，
 * 代码中不再硬编码任何岗位数据，本文件仅保留 TypeScript 类型定义。
 */

export interface PositionDefinition {
  id: string;
  code: string;
  name: string;
  badge: string;
  icon: string;
  colorCls: string;
  description: string;
  isPreset: boolean;
  editable: boolean;
  status?: "ACTIVE" | "DISABLED"; // 岗位启用 / 禁用状态
  defaultAllowedComponentIds?: string[]; // 默认允许的组件 ID 集合，若为 undefined 则表示根据矩阵或全量控制
}
