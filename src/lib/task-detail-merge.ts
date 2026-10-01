/**
 * 任务详情合并纯函数（前端列表项 -> 详情安全 DTO 覆盖）
 *
 * 红线：
 * - 详情 DTO（task_detail 返回）是唯一真源；
 * - 详情返回 null 或子字段为 null 时，必须覆盖（清空）旧列表对象的对应字段，
 *   严禁回退未认证顶层字段（provider / model / usage）或旧列表对象本身；
 * - 不引入 any；纯函数、可在 node:test 中直接断言。
 */

export interface TaskDetailMergeSource {
  outputData?: string | Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  contractVersion?: string | null;
  refundStatus?:
    | "NO_CHARGE"
    | "REFUNDED"
    | "REFUND_PENDING"
    | "RECONCILIATION_REQUIRED"
    | "UNKNOWN"
    | null;
  refundedPoints?: number | null;
  chargeAttempted?: boolean | null;
  artifacts?: Array<Record<string, unknown>> | null;
  artifact?: Record<string, unknown> | null;
  hasArtifact?: boolean | null;
  contractView?: Record<string, unknown> | null;
  execution?: Record<string, unknown> | null;
}

/**
 * 将详情安全 DTO 合并进列表项。
 * @param prev  列表摘要对象（仅取其不被详情覆盖的安全字段）
 * @param detail 详情接口返回的安全 DTO；传 null 表示详情不可用，全部安全字段清空。
 */
export function mergeTaskDetailIntoListItem<T extends { id: string }>(
  prev: T,
  detail: TaskDetailMergeSource | null,
): T {
  if (detail === null) {
    return {
      ...prev,
      outputData: null,
      errorCode: null,
      errorMessage: null,
      contractVersion: null,
      refundStatus: null,
      refundedPoints: null,
      chargeAttempted: null,
      artifacts: [],
      artifact: null,
      hasArtifact: false,
      contractView: null,
      execution: null,
    } as T;
  }

  return {
    ...prev,
    outputData: detail.outputData ?? null,
    errorCode: detail.errorCode ?? null,
    errorMessage: detail.errorMessage ?? null,
    contractVersion: detail.contractVersion ?? null,
    refundStatus: detail.refundStatus ?? null,
    refundedPoints: detail.refundedPoints ?? null,
    chargeAttempted: detail.chargeAttempted ?? null,
    artifacts: Array.isArray(detail.artifacts) ? detail.artifacts : [],
    artifact: detail.artifact ?? null,
    hasArtifact: detail.hasArtifact === true,
    contractView: detail.contractView ?? null,
    execution: detail.execution ?? null,
  } as T;
}
