/**
 * 组件目录对外响应脱敏（能看≠能带走）。
 *
 * component_catalog 行内含平台内部定价/成本字段（成本底线、内部选型部署、成本预估 Token、
 * 定价复杂度），这些属于商业敏感数据，绝不下发给任何调用方（含游客与普通用户）；
 * 大厅/详情展示所需的名称、描述、合同就绪态、真实调用统计、estimatedModelTokens
 * （前端"预估约"提示用）等字段保留。
 */

/** 必须从对外响应中剔除的内部字段 */
const INTERNAL_FIELDS = [
  "costFloorPoints",
  "costModelDeploymentId",
  "estimatedInputTokens",
  "estimatedOutputTokens",
  "pricingComplexity",
  "costBaselineStatus",
] as const;

export function stripCatalogInternals<T extends Record<string, unknown>>(comp: T): T {
  const clone = { ...comp };
  for (const key of INTERNAL_FIELDS) {
    delete clone[key];
  }
  return clone;
}
