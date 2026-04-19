/**
 * 工作空间验证工具
 */

/**
 * 验证工作空间名称
 * @param name 工作空间名称
 * @returns 验证结果
 */
export function validateWorkspaceName(
  name: string
): { valid: boolean; message?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, message: '工作空间名称不能为空' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, message: '工作空间名称至少 2 个字符' };
  }

  if (trimmed.length > 50) {
    return { valid: false, message: '工作空间名称最多 50 个字符' };
  }

  // 允许中文、英文、数字、空格和常见标点
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-\_\.\(\)]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      message: '工作空间名称只能包含中文、英文、数字和常见标点',
    };
  }

  return { valid: true };
}

/**
 * 验证团队规模
 * @param size 团队规模
 * @returns 验证结果
 */
export function validateTeamSize(
  size: string
): { valid: boolean; message?: string } {
  const validSizes = ['1-5', '6-20', '21-50', '51-100', '100+'];

  if (!size) {
    return { valid: false, message: '请选择团队规模' };
  }

  if (!validSizes.includes(size)) {
    return { valid: false, message: '请选择有效的团队规模' };
  }

  return { valid: true };
}
