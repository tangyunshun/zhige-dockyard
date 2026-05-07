/**
 * 工作空间验证工具函数
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

  // 只允许中文、英文、数字、空格、连字符、下划线、点、括号
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-\_\.\(\)]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      message: '工作空间名称只能包含中文、英文、数字、空格、连字符、下划线、点、括号',
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
    return { valid: false, message: '团队规模选项无效' };
  }

  return { valid: true };
}

/**
 * 验证工作空间描述
 * @param description 工作空间描述
 * @returns 验证结果
 */
export function validateWorkspaceDescription(
  description?: string
): { valid: boolean; message?: string } {
  if (!description) {
    return { valid: true }; // 描述是可选的
  }

  if (description.length > 500) {
    return { valid: false, message: '工作空间描述最多 500 个字符' };
  }

  return { valid: true };
}

/**
 * 验证工作空间 Logo
 * @param logo Logo URL
 * @returns 验证结果
 */
export function validateWorkspaceLogo(
  logo?: string
): { valid: boolean; message?: string } {
  if (!logo) {
    return { valid: true }; // Logo 是可选的
  }

  try {
    new URL(logo);
    return { valid: true };
  } catch {
    return { valid: false, message: 'Logo URL 格式无效' };
  }
}
