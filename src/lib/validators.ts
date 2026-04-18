/**
 * 表单验证工具函数
 * 提供手机号、邮箱、用户名等验证规则
 */

// 验证规则常量
export const VALIDATION_RULES = {
  // 手机号：11 位，以 1 开头，第二位 3-9
  phone: /^1[3-9]\d{9}$/,
  
  // 邮箱：标准邮箱格式
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // 用户名：支持大小写字母、数字、@、下划线，3-20 位
  username: /^[a-zA-Z0-9_@]{3,20}$/,
  
  // 密码：至少 8 位，包含大小写字母、数字、特殊字符
  password: {
    minLength: 8,
    requiresUppercase: /[A-Z]/,
    requiresLowercase: /[a-z]/,
    requiresNumber: /[0-9]/,
    requiresSpecial: /[^a-zA-Z0-9]/,
  },
} as const;

// 验证提示语
export const VALIDATION_MESSAGES = {
  phone: {
    required: "请输入手机号",
    invalid: "手机号格式不正确，请输入 11 位以 1 开头的号码",
    format: "手机号必须为 11 位数字，以 1 开头",
  },
  email: {
    required: "请输入邮箱地址",
    invalid: "邮箱格式不正确",
    format: "请输入正确的邮箱格式，例如：example@domain.com",
  },
  username: {
    required: "请输入账号",
    invalid: "账号格式不正确",
    format: "账号只能包含字母、数字、@符号和下划线，长度为 3-20 位",
    tooShort: "账号长度不能少于 3 个字符",
    tooLong: "账号长度不能超过 20 个字符",
    invalidChar: "账号只能包含字母、数字、@符号和下划线",
  },
  password: {
    required: "请输入密码",
    tooShort: "密码长度不能少于 8 个字符",
    noUppercase: "密码必须包含大写字母",
    noLowercase: "密码必须包含小写字母",
    noNumber: "密码必须包含数字",
    noSpecial: "密码必须包含特殊字符",
  },
  smsCode: {
    required: "请输入验证码",
    invalid: "验证码格式不正确",
    format: "验证码为 6 位数字",
  },
} as const;

// 常用邮箱域名补全
export const COMMON_EMAIL_DOMAINS = [
  "qq.com",
  "163.com",
  "126.com",
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "sina.com",
  "sohu.com",
  "yahoo.com.cn",
  "icloud.com",
  "me.com",
  "foxmail.com",
] as const;

/**
 * 验证手机号
 */
export const validatePhone = (phone: string): { valid: boolean; message?: string } => {
  if (!phone || phone.trim() === "") {
    return { valid: false, message: VALIDATION_MESSAGES.phone.required };
  }
  
  const trimmed = phone.trim();
  
  if (!VALIDATION_RULES.phone.test(trimmed)) {
    return { valid: false, message: VALIDATION_MESSAGES.phone.invalid };
  }
  
  return { valid: true };
};

/**
 * 验证邮箱
 */
export const validateEmail = (email: string): { valid: boolean; message?: string } => {
  if (!email || email.trim() === "") {
    return { valid: false, message: VALIDATION_MESSAGES.email.required };
  }
  
  const trimmed = email.trim();
  
  if (!VALIDATION_RULES.email.test(trimmed)) {
    return { valid: false, message: VALIDATION_MESSAGES.email.invalid };
  }
  
  return { valid: true };
};

/**
 * 验证用户名/账号
 */
export const validateUsername = (username: string): { valid: boolean; message?: string } => {
  if (!username || username.trim() === "") {
    return { valid: false, message: VALIDATION_MESSAGES.username.required };
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < 3) {
    return { valid: false, message: VALIDATION_MESSAGES.username.tooShort };
  }
  
  if (trimmed.length > 20) {
    return { valid: false, message: VALIDATION_MESSAGES.username.tooLong };
  }
  
  if (!VALIDATION_RULES.username.test(trimmed)) {
    return { valid: false, message: VALIDATION_MESSAGES.username.invalidChar };
  }
  
  return { valid: true };
};

/**
 * 验证账号（支持手机号、邮箱、用户名）
 */
export const validateAccount = (account: string): { valid: boolean; message?: string; type?: "phone" | "email" | "username" } => {
  if (!account || account.trim() === "") {
    return { valid: false, message: VALIDATION_MESSAGES.username.required };
  }
  
  const trimmed = account.trim();
  
  // 检查是否为手机号
  if (/^1\d{10}$/.test(trimmed)) {
    if (VALIDATION_RULES.phone.test(trimmed)) {
      return { valid: true, type: "phone" };
    }
    return { valid: false, message: VALIDATION_MESSAGES.phone.invalid, type: "phone" };
  }
  
  // 检查是否为邮箱
  if (trimmed.includes("@")) {
    if (VALIDATION_RULES.email.test(trimmed)) {
      return { valid: true, type: "email" };
    }
    return { valid: false, message: VALIDATION_MESSAGES.email.invalid, type: "email" };
  }
  
  // 默认为用户名
  if (trimmed.length < 3) {
    return { valid: false, message: VALIDATION_MESSAGES.username.tooShort, type: "username" };
  }
  
  if (trimmed.length > 20) {
    return { valid: false, message: VALIDATION_MESSAGES.username.tooLong, type: "username" };
  }
  
  if (!VALIDATION_RULES.username.test(trimmed)) {
    return { valid: false, message: VALIDATION_MESSAGES.username.invalidChar, type: "username" };
  }
  
  return { valid: true, type: "username" };
};

/**
 * 验证密码强度
 */
export const validatePasswordStrength = (password: string): {
  valid: boolean;
  score: number;
  messages: string[];
  requirements: string[];
} => {
  const messages: string[] = [];
  const requirements: string[] = [];
  let score = 0;
  
  const { minLength, requiresUppercase, requiresLowercase, requiresNumber, requiresSpecial } = VALIDATION_RULES.password;
  
  // 长度检查
  if (password.length >= minLength) {
    score++;
  } else {
    requirements.push(`至少 ${minLength} 个字符`);
    messages.push(VALIDATION_MESSAGES.password.tooShort);
  }
  
  // 大写字母检查
  if (requiresUppercase.test(password)) {
    score++;
  } else {
    requirements.push("包含大写字母");
    messages.push(VALIDATION_MESSAGES.password.noUppercase);
  }
  
  // 小写字母检查
  if (requiresLowercase.test(password)) {
    score++;
  } else {
    requirements.push("包含小写字母");
    messages.push(VALIDATION_MESSAGES.password.noLowercase);
  }
  
  // 数字检查
  if (requiresNumber.test(password)) {
    score++;
  } else {
    requirements.push("包含数字");
    messages.push(VALIDATION_MESSAGES.password.noNumber);
  }
  
  // 特殊字符检查
  if (requiresSpecial.test(password)) {
    score++;
  } else {
    requirements.push("包含特殊字符");
    messages.push(VALIDATION_MESSAGES.password.noSpecial);
  }
  
  return {
    valid: score === 5,
    score,
    messages,
    requirements,
  };
};

/**
 * 验证短信验证码
 */
export const validateSmsCode = (code: string): { valid: boolean; message?: string } => {
  if (!code || code.trim() === "") {
    return { valid: false, message: VALIDATION_MESSAGES.smsCode.required };
  }
  
  const trimmed = code.trim();
  
  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, message: VALIDATION_MESSAGES.smsCode.format };
  }
  
  return { valid: true };
};

/**
 * 获取邮箱域名补全建议
 */
export const getEmailSuggestions = (partialEmail: string): string[] => {
  if (!partialEmail || !partialEmail.includes("@")) {
    return [];
  }
  
  const [prefix, domainStart] = partialEmail.split("@");
  if (!prefix) return [];
  
  // 如果已经有完整域名，返回空
  if (domainStart && domainStart.includes(".")) {
    return [];
  }
  
  // 匹配域名前缀
  const matchedDomains = COMMON_EMAIL_DOMAINS.filter((domain) => 
    domainStart ? domain.startsWith(domainStart) : true
  ).slice(0, 5);
  
  return matchedDomains.map((domain) => `${prefix}@${domain}`);
};

/**
 * 判断账号类型
 */
export const getAccountType = (account: string): "phone" | "email" | "username" | "unknown" => {
  if (!account) return "unknown";
  
  const trimmed = account.trim();
  
  if (VALIDATION_RULES.phone.test(trimmed)) {
    return "phone";
  }
  
  if (VALIDATION_RULES.email.test(trimmed)) {
    return "email";
  }
  
  if (VALIDATION_RULES.username.test(trimmed)) {
    return "username";
  }
  
  return "unknown";
};
