/**
 * 账号状态机（PRD I-05）
 *
 * 允许流转：
 *   ACTIVE <-> TEMP_BANNED -> PERM_BANNED（单向）
 *   ACTIVE -> LOGIN_DISABLED（单向）
 *   ACTIVE <-> PASSWORD_EXPIRED（循环）
 *
 * 兼容层：本仓库 DB 原 UserStatus 枚举为 active/inactive/banned/deleted/deleting。
 * 为避免破坏既有数据，这里以「语义常量 + 映射函数」承载 PRD 五态，
 * DB 中仍存储原枚举值，但业务判断统一走此处。
 */

export type AccountStatus =
  | "ACTIVE"
  | "LOGIN_DISABLED"
  | "TEMP_BANNED"
  | "PERM_BANNED"
  | "PASSWORD_EXPIRED";

/** DB 枚举值 -> PRD 语义态 */
export function toAccountStatus(dbStatus: string | null | undefined): AccountStatus {
  switch (dbStatus) {
    case "inactive":
      return "LOGIN_DISABLED";
    case "banned":
      return "PERM_BANNED"; // 由调用方结合 bannedUntil 区分临时/永久
    case "deleted":
    case "deleting":
      return "ACTIVE"; // 注销走独立字段 deletionRequestedAt，不纳入状态机
    case "active":
    default:
      return "ACTIVE";
  }
}

/** PRD 语义态 -> DB 枚举值（写入用） */
export function fromAccountStatus(status: AccountStatus): string {
  switch (status) {
    case "LOGIN_DISABLED":
      return "inactive";
    case "PERM_BANNED":
    case "TEMP_BANNED":
      return "banned";
    case "PASSWORD_EXPIRED":
      return "active"; // 密码过期不单独占枚举，靠 passwordExpireDate 判定
    case "ACTIVE":
    default:
      return "active";
  }
}

/**
 * 校验状态流转是否合法（I-05）。返回 true 表示允许。
 */
export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  if (from === to) return true;

  // ACTIVE 可单向进入各禁用态 / 密码过期态
  if (from === "ACTIVE") {
    return ["LOGIN_DISABLED", "TEMP_BANNED", "PERM_BANNED", "PASSWORD_EXPIRED"].includes(to);
  }

  // TEMP_BANNED 可恢复 ACTIVE，或单向升级 PERM_BANNED
  if (from === "TEMP_BANNED") {
    return to === "ACTIVE" || to === "PERM_BANNED";
  }

  // PASSWORD_EXPIRED 可循环回 ACTIVE
  if (from === "PASSWORD_EXPIRED") {
    return to === "ACTIVE";
  }

  // LOGIN_DISABLED / PERM_BANNED 为终态或仅可恢复（管理员解禁走 LOGIN_DISABLED->ACTIVE 单向允许，便于解封）
  if (from === "LOGIN_DISABLED") {
    return to === "ACTIVE";
  }

  // PERM_BANNED 不可逆
  if (from === "PERM_BANNED") {
    return false;
  }

  return false;
}

/** 该状态是否禁止登录/刷新/访问任何接口（C-02 PERM_BANNED 全禁；LOGIN_DISABLED 仅禁登录+刷新） */
export function isLoginBlocked(status: AccountStatus): boolean {
  return status === "PERM_BANNED" || status === "LOGIN_DISABLED";
}

/** 是否彻底禁止一切接口访问（C-02） */
export function isFullyBlocked(status: AccountStatus): boolean {
  return status === "PERM_BANNED";
}
