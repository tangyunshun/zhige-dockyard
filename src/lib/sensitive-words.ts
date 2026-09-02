/**
 * 舟坊·全系统敏感词检测与脱敏引擎模块
 * 负责扫描用户输入的文本或上传解密后的文件材料，识别敏感词汇与隐私信息，
 * 提供星号打码脱敏 (Sanitization) 与用户友好合规提醒。
 */

// 预定义敏感词词库（按合规场景分组，覆盖涉密、政治敏感、违禁、攻击、辱骂、隐私口令等典型关键词）
export const DEFAULT_SENSITIVE_WORDS = [
  // 涉密 / 保密类
  "机密文件", "绝密", "内部秘密", "商业机密", "国家机密", "涉密",
  "保密文件", "内部资料", "未公开",
  // 政治敏感类（示例性通用词，用于内容合规兜底）
  "颠覆国家", "分裂国家", "煽动颠覆",
  // 违禁 / 违法类
  "洗钱", "非法集资", "传销", "走私", "贩毒", "毒品", "枪支", "弹药",
  "网暴", "人肉搜索", "侵犯隐私", "伪造证件", "假证",
  // 攻击 / 安全威胁类
  "SQL注入", "拖库", "脱库", "撞库", "DDoS", "拒绝服务攻击",
  "木马病毒", "勒索病毒", "钓鱼网站", "后门程序", "提权",
  // 辱骂 / 不良信息类
  "傻逼", "废物", "垃圾(指代辱骂)", "脑残", "贱人",
  // 隐私口令类（弱口令 / 默认口令，均带上下文前缀以避免误命中普通数字串）
  "密码123456", "root123456", "admin123456", "password123",
  // 外挂 / 灰产类
  "外挂", "作弊器", "刷单", "薅羊毛", "黄牛",
];

/**
 * 隐私信息正则识别（与敏感词并列做脱敏，避免身份证/手机号等明文落入产出物）
 * label 用于在提示中告知用户具体是哪一类隐私被识别。
 */
// 注意顺序：更长的数字串（身份证号）需先于手机号检测，
// 否则手机号正则会在 18 位身份证内部匹配到 11 位子串并提前打码，导致身份证无法完整识别。
export const PII_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "身份证号", regex: /\d{17}[\dXx]/g },
  { label: "电子邮箱", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "手机号", regex: /1[3-9]\d{9}/g },
];

export interface SensitivityCheckResult {
  hasSensitive: boolean;
  foundWords: string[];
  sanitizedText: string;
}

/**
 * 扫描指定文本，检查是否存在敏感词或隐私信息，并生成脱敏替换后的文本
 * @param input 原始文本
 * @param customDict 可选扩展敏感词列表（默认使用全量预置词库）
 */
export function scanSensitiveWords(
  input: string,
  customDict: string[] = DEFAULT_SENSITIVE_WORDS
): SensitivityCheckResult {
  if (!input || typeof input !== "string") {
    return { hasSensitive: false, foundWords: [], sanitizedText: input || "" };
  }

  const foundSet = new Set<string>();
  let sanitized = input;

  // 1) 遍历敏感词字典进行全词替换打码
  for (const word of customDict) {
    if (!word || word.trim().length === 0) continue;

    // 转义正则特殊字符，避免字典词中包含 . * + 等导致正则异常
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedWord, "gi");

    if (regex.test(sanitized)) {
      foundSet.add(word);
      // 将敏感词替换为相同长度的 * 号（如：机密 -> **，绝密文件 -> ****）
      const mask = "*".repeat(word.length);
      sanitized = sanitized.replace(regex, mask);
    }
  }

  // 2) 隐私信息正则识别（手机号 / 身份证号 / 邮箱等），统一打码为 ***
  for (const { label, regex } of PII_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(sanitized)) {
      foundSet.add(label);
      sanitized = sanitized.replace(regex, "***");
    }
  }

  const foundWords = Array.from(foundSet);

  return {
    hasSensitive: foundWords.length > 0,
    foundWords,
    sanitizedText: sanitized,
  };
}
