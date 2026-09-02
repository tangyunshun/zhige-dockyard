export interface ComponentCatalogLike {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  contract?: any;
  previewData?: any;
  inputMode?: string | null;
}

export interface ComponentResultOutput {
  [key: string]: unknown;
  summary: string;
  conclusions: string[];
  deviations: Array<{ item: string; rfp?: string; actual?: string; risk: string }>;
  risks: string[];
  advices: string[];
}

// 简单停用词表（仅用于统计关键词频次，不影响业务语义）
const CN_STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这",
]);
const EN_STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under", "and", "but", "or", "yet", "so", "if", "because", "although", "though", "while", "where", "when", "that", "which", "who", "whom", "whose", "what", "this", "these", "those", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their",
]);

function extractTopKeywords(text: string, isChinese: boolean, topN = 8): string[] {
  if (!text) return [];
  const freq: Record<string, number> = {};
  if (isChinese) {
    const tokens = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    tokens.forEach((t) => {
      if (!CN_STOP_WORDS.has(t)) {
        freq[t] = (freq[t] || 0) + 1;
      }
    });
  } else {
    const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || [];
    tokens.forEach((t) => {
      if (!EN_STOP_WORDS.has(t)) {
        freq[t] = (freq[t] || 0) + 1;
      }
    });
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => `${word}(${count})`);
}

function extractContractFields(contract: any): string[] {
  if (!contract) return [];
  if (Array.isArray(contract.requiredFields)) {
    return contract.requiredFields.filter((f: any) => typeof f === "string" && f.trim());
  }
  if (Array.isArray(contract.fields)) {
    return contract.fields
      .map((f: any) => (typeof f === "string" ? f : f?.name || f?.key))
      .filter(Boolean);
  }
  if (typeof contract === "string" && contract.trim()) {
    return contract
      .split(/[,，;；|\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 统一组件执行结果生成器（真实数据版）
 *
 * 所有指标均基于输入材料与组件契约进行实际计算，不再使用任何硬编码、随机或占位数值。
 * 当前阶段未接入 LLM，因此分析维度以可验证的文本统计、关键词提取、契约字段覆盖为主。
 */
export function buildComponentResult(
  component: ComponentCatalogLike,
  inputMaterial?: string | null
): ComponentResultOutput {
  const compName = component.name || "效能组件";
  const category = (component.category || "GENERAL").toUpperCase();
  const inputMode = component.inputMode || "text";

  const text = (inputMaterial || "").toString().trim();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const cnChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const isChinese = chars > 0 && cnChars / chars > 0.3;
  const hasInput = chars > 0;

  const urls = [...text.matchAll(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi)].map((m) => m[0]);
  const emails = [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map((m) => m[0]);

  // 阅读时长：中文按 400 字/分钟，英文按 200 词/分钟估算
  const readingMinutes = isChinese
    ? Math.max(1, Math.ceil(chars / 400))
    : Math.max(1, Math.ceil(words / 200));

  const topKeywords = hasInput ? extractTopKeywords(text, isChinese) : [];
  const contractFields = extractContractFields(component.contract);
  const lowerText = text.toLowerCase();
  const missingFields = contractFields.filter(
    (f) => !lowerText.includes(f.toLowerCase())
  );
  const coveredFields = contractFields.filter((f) =>
    lowerText.includes(f.toLowerCase())
  );

  // 按组件分类决定表述风格
  const isDev =
    category.includes("DEV") ||
    category.includes("BACKEND") ||
    category.includes("CODE") ||
    category.includes("研发") ||
    category.includes("API");
  const isDoc =
    category.includes("DOC") ||
    category.includes("KNOWLEDGE") ||
    category.includes("REQUIREMENT") ||
    category.includes("文档") ||
    category.includes("招标") ||
    category.includes("需求");
  const isSecurity =
    category.includes("TEST") ||
    category.includes("QUALITY") ||
    category.includes("SECURITY") ||
    category.includes("安全");

  // ---------- 1. summary（真实摘要） ----------
  let summary = "";
  if (!hasInput) {
    summary = `「${compName}」已完成执行，但未检测到有效输入材料。本次未产出基于内容的分析结论，建议补充文本后再执行。`;
  } else if (isDev) {
    summary = `「${compName}」对输入材料进行了结构扫描。输入共 ${chars} 字符、${lines.length} 个有效行，识别语言类型为「${
      isChinese ? "中文" : "英文"
    }」，预计阅读时长约 ${readingMinutes} 分钟。`;
  } else if (isSecurity) {
    summary = `「${compName}」已完成质量安全基线扫描。输入材料 ${chars} 字符、${lines.length} 个有效行；语言「${
      isChinese ? "中文" : "英文"
    }」，预计阅读时长约 ${readingMinutes} 分钟。`;
  } else {
    summary = `「${compName}」已完成输入材料拆解与审查。输入共 ${chars} 字符、${lines.length} 个有效行，语言「${
      isChinese ? "中文" : "英文"
    }」，预计阅读时长约 ${readingMinutes} 分钟。`;
  }

  // ---------- 2. conclusions（真实结论） ----------
  const conclusions: string[] = [];
  if (hasInput) {
    conclusions.push(`输入材料总长度为 ${chars} 字符，有效行数为 ${lines.length}。`);
    conclusions.push(`检测到的语言类型为「${isChinese ? "中文" : "英文"}」，输入模式为「${inputMode}」。`);
    if (topKeywords.length > 0) {
      conclusions.push(`高频关键词（按出现次数排序）：${topKeywords.join("、")}。`);
    } else {
      conclusions.push(`输入材料中可提取的有效关键词较少，可能影响分析深度。`);
    }
    if (emails.length > 0 || urls.length > 0) {
      conclusions.push(
        `识别到联系信息：${emails.length} 个邮箱地址、${urls.length} 个 URL 链接。`
      );
    } else {
      conclusions.push(`未在输入材料中识别到邮箱地址或 URL 链接。`);
    }
    if (contractFields.length > 0) {
      conclusions.push(
        `组件契约共要求 ${contractFields.length} 个字段，已覆盖 ${coveredFields.length} 个（${
          coveredFields.join("、") || "无"
        }），缺失 ${missingFields.length} 个（${missingFields.join("、") || "无"}）。`
      );
    }
  } else {
    conclusions.push("本次执行未接收到有效输入材料，无法生成基于内容的结论。");
  }

  // ---------- 3. deviations（基于契约字段缺失的真实偏离） ----------
  const deviations: Array<{ item: string; rfp?: string; actual?: string; risk: string }> = [];
  missingFields.forEach((field) => {
    deviations.push({
      item: field,
      rfp: "应在输入材料中明确体现",
      actual: "未提及",
      risk: `缺少「${field}」可能导致后续交付标准不清晰或验收口径不一致`,
    });
  });
  if (hasInput && chars < 50) {
    deviations.push({
      item: "输入材料长度",
      rfp: "建议提供足够上下文的文本材料",
      actual: `仅 ${chars} 字符`,
      risk: "输入过短，分析结论的置信度与可核验性均较低",
    });
  }

  // ---------- 4. risks（真实风险点） ----------
  const risks: string[] = [];
  if (!hasInput) {
    risks.push("未提供输入材料，本次执行结果不具备业务参考价值。");
  } else {
    if (chars < 50) risks.push("输入材料过短，关键信息密度不足，可能导致分析遗漏。");
    if (missingFields.length > 0) {
      risks.push(`组件契约要求的 ${missingFields.join("、")} 未在材料中体现，存在交付偏差风险。`);
    }
    if (isDev && urls.length === 0 && emails.length === 0) {
      risks.push("未识别到接口文档链接或技术联系人邮箱，不利于后续协同排错。");
    }
    if (isDoc && lines.length < 3) {
      risks.push("文档型输入的有效行数较少，条款与交付边界可能未充分展开。");
    }
    if (isSecurity && missingFields.includes("SLA") || missingFields.includes("安全等级")) {
      risks.push("安全/质量相关材料缺少 SLA 或安全等级约定，建议补充明确基线。");
    }
  }

  // ---------- 5. advices（基于真实分析的建议） ----------
  const advices: string[] = [];
  if (!hasInput) {
    advices.push("请在执行组件任务前粘贴或上传有效的纯文本材料。");
  } else {
    if (missingFields.length > 0) {
      advices.push(`建议在材料中补充缺失字段：${missingFields.join("、")}，以完整覆盖组件契约要求。`);
    }
    if (chars < 100) {
      advices.push("当前输入偏短，建议扩展背景信息、上下文与具体约束条件后再执行。");
    }
    if (topKeywords.length === 0) {
      advices.push("输入材料中可提取关键词较少，建议使用更结构化、术语更明确的表达方式。");
    }
    if (emails.length === 0 && urls.length === 0) {
      advices.push("如适用，可在材料中补充相关负责人邮箱或参考文档链接，便于结果沉淀与协同。");
    }
    advices.push("可将运行产出的分析成果沉淀为工作空间资产，供后续审计与复用。");
  }

  return {
    summary,
    conclusions,
    deviations,
    risks,
    advices,
  };
}
