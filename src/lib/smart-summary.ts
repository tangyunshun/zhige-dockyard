/**
 * 智能总结（本地启发式，零外部依赖）
 *
 * 设计目标：在没有任何大模型 API Key 的环境下，也能对任意资料原文产出
 * 结构化的智能摘要，供列表与预览直接展示。
 *
 * 算法流程：
 *  1. 预处理：识别内容形态（图片 dataURL / 纯代码 / 普通文本），分类处理
 *  2. 结构化：切分为段落与句子，识别标题行
 *  3. 打分：对每句计算综合得分
 *     - 位置分：首尾段落、段首句权重更高（文章常把结论放在开头/结尾）
 *     - 关键词分：命中高频实词越多分越高
 *     - 线索分：含「总之/因此/结论/要求/目标/注意」等总结性提示词的句子加权
 *     - 长度分：过短无信息量、过长冗余，取中间最优区间
 *     - 数字分：含具体数据的句子通常是关键指标
 *  4. 组装：概述（最高分句润色）+ 要点列表（Top N 去重排序）
 *
 * 全程纯本地计算，不联网、不依赖任何环境变量。
 */

/** 中文/英文停用词，用于过滤无信息量的高频词 */
const STOP_WORDS = new Set([
  "的", "了", "和", "是", "在", "有", "与", "及", "或", "等", "对", "为", "以", "将",
  "并", "也", "都", "而", "其", "之", "于", "中", "个", "这", "那", "不", "被", "把",
  "从", "到", "由", "该", "此", "即", "如", "若", "则", "可", "会", "能", "所", "更",
  "the", "a", "an", "and", "or", "the", "to", "of", "in", "on", "for", "with", "is",
  "are", "be", "as", "at", "by", "it", "that", "this", "we", "you", "they",
]);

/** 总结性/结论性线索词，命中则加权 */
const CLUE_WORDS = [
  "总之", "综上", "因此", "所以", "结论", "总结", "概述", "摘要", "目标", "目的",
  "要求", "必须", "应当", "注意", "关键", "重点", "核心", "主要", "最终", "结果",
  "建议", "方案", "措施", "计划", "问题", "风险", "优势", "特点", "功能", "说明",
];

export interface SmartSummary {
  /** 一句话概述 */
  overview: string;
  /** 要点列表（3~6 条） */
  highlights: string[];
  /** 统计信息 */
  stats: {
    charCount: number;
    lineCount: number;
    paragraphCount: number;
  };
}

/** 判断是否为图片 base64 内容 */
function isImageContent(content: string): boolean {
  return /^data:image\//i.test(content.trim());
}

/** 判断是否为代码类内容 */
function isCodeContent(content: string): boolean {
  const codeMarkers = [
    /^\s*(import|export|from)\s+[\w'"{}]/m,
    /^\s*(function|const|let|var|class|def|public|private|interface|type)\s/m,
    /^\s*[{};]\s*$/m,
    /=>\s*[{(\[]/,
  ];
  let hits = 0;
  for (const re of codeMarkers) {
    if (re.test(content)) hits += 1;
  }
  return hits >= 2;
}

/** 切分句子：支持中英文标点 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；!?;\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 抽取中文词组（2~4 字）与英文单词，用于词频统计 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 英文单词与数字
  const enWords = text.match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) || [];
  for (const w of enWords) {
    const lower = w.toLowerCase();
    if (lower.length >= 2 && !STOP_WORDS.has(lower)) tokens.push(lower);
  }
  // 中文：按 2-gram 滑窗取词，捕捉「需求」「接口」等双字词
  const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const seg of chinese) {
    if (seg.length < 2) continue;
    for (let i = 0; i + 2 <= seg.length; i += 1) {
      const bi = seg.slice(i, i + 2);
      if (!STOP_WORDS.has(bi)) tokens.push(bi);
    }
  }
  return tokens;
}

/** 统计词频，返回 Top N 关键词 */
function topKeywords(text: string, topN = 12): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokenize(text)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return new Map(
    [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)
  );
}

/**
 * 生成智能总结。
 * @param content 资料原文
 * @param title   资料标题（作为兜底与主题补充）
 */
export function generateSmartSummary(
  content?: string | null,
  title?: string | null
): SmartSummary {
  const fallbackTitle = (title || "").trim();

  // 空内容
  if (!content || !content.trim()) {
    return {
      overview: fallbackTitle
        ? `《${fallbackTitle}》当前暂无可解析的正文内容。`
        : "当前资料暂无可解析的正文内容。",
      highlights: [],
      stats: { charCount: 0, lineCount: 0, paragraphCount: 0 },
    };
  }

  const raw = content.trim();
  const stats = {
    charCount: raw.length,
    lineCount: raw.split("\n").length,
    paragraphCount: raw.split(/\n\s*\n/).filter((p) => p.trim()).length || 1,
  };

  // 1. 图片类：无法从 base64 提取语义，按图像资产给出结构化说明
  if (isImageContent(raw)) {
    const sizeKb = Math.max(1, Math.round(raw.length / 1024));
    return {
      overview: `《${fallbackTitle || "未命名图像"}》为图片类资料，原文以图像形式存储（约 ${sizeKb} KB），已完整保留原始图像数据。`,
      highlights: [
        "内容形态：图片（Base64 原图全量存储，100% 保真不压缩）",
        `图像数据体积：约 ${sizeKb} KB`,
        "可直接在预览中查看高清原图",
      ],
      stats,
    };
  }

  // 2. 代码类
  if (isCodeContent(raw)) {
    const lines = raw.split("\n");
    const codeLines = lines.filter((l) => l.trim()).length;
    const funcs = raw.match(/(function\s+\w+|const\s+\w+\s*=\s*(\(|async)|def\s+\w+|class\s+\w+|interface\s+\w+)/g) || [];
    const imports = raw.match(/^\s*(import|require|from)\b.*$/gm) || [];
    return {
      overview: `《${fallbackTitle || "未命名源码"}》为源代码文件，共 ${lines.length} 行（有效代码 ${codeLines} 行），包含约 ${funcs.length} 个函数/类定义。`,
      highlights: [
        `代码规模：${lines.length} 行，有效代码 ${codeLines} 行`,
        `定义数量：约 ${funcs.length} 个函数 / 类 / 接口`,
        imports.length > 0
          ? `依赖引入：${imports.length} 处 import / require`
          : "依赖引入：未检测到显式外部依赖",
        funcNamesHint(funcs),
      ].filter(Boolean) as string[],
      stats,
    };
  }

  // 3. 普通文本
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const flatText = paragraphs.join("\n");
  const sentences = splitSentences(flatText);
  const keywords = topKeywords(flatText, 15);

  if (sentences.length === 0) {
    return {
      overview: `《${fallbackTitle || "未命名资料"}》正文共 ${stats.charCount} 字符，未检出完整句读。`,
      highlights: [],
      stats,
    };
  }

  // 为每个句子打分
  const paraCount = paragraphs.length;
  const scored = sentences.map((sentence, index) => {
    let score = 0;

    // 位置分：首段与尾段权重高
    const paraIndex = getParagraphIndex(sentence, paragraphs);
    if (paraIndex === 0) score += 3;
    if (paraIndex === paraCount - 1 && paraCount > 1) score += 2;
    // 全文前三句加权
    if (index < 3) score += 3 - index;

    // 关键词分
    const sentTokens = tokenize(sentence);
    for (const t of sentTokens) {
      if (keywords.has(t)) score += 1;
    }
    // 去重后按命中种类数计分，避免长句靠重复词刷分
    const uniqueHits = new Set(sentTokens.filter((t) => keywords.has(t))).size;
    score += uniqueHits * 2;

    // 线索分
    for (const clue of CLUE_WORDS) {
      if (sentence.includes(clue)) score += 2;
    }

    // 数字分：含数据的句子往往是关键指标
    if (/\d+(\.\d+)?\s*(%|％|个|项|条|次|元|万|亿|KB|MB|GB|天|年|月|日)/.test(sentence)) {
      score += 2;
    }

    // 长度分：10~120 字为最优区间
    const len = sentence.replace(/\s/g, "").length;
    if (len < 8) score -= 4;
    else if (len > 200) score -= 3;
    else if (len >= 15 && len <= 120) score += 2;

    return { sentence, score, index };
  });

  // 取 Top 句，按原文顺序重排，保证语义连贯
  const topN = Math.min(5, Math.max(3, Math.ceil(sentences.length / 12)));
  const topSentences = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  // 概述：取分数最高的一句，截断至合理长度
  const best = scored.slice().sort((a, b) => b.score - a.score)[0];
  const overviewRaw = best ? best.sentence : paragraphs[0];
  const overview = truncate(overviewRaw, 120);

  // 要点：去重 + 清洗标题符号
  const highlights = dedupe(topSentences)
    .map((s) => truncate(cleanSentence(s), 90))
    .filter((s) => s.length >= 6);

  // 补充统计要点
  const statLine = `篇幅：全文 ${stats.charCount} 字符 / ${stats.paragraphCount} 个段落 / ${stats.lineCount} 行`;
  const keywordList = [...keywords.keys()].slice(0, 6);
  const keywordLine =
    keywordList.length > 0 ? `核心主题词：${keywordList.join("、")}` : "";

  return {
    overview: `《${fallbackTitle || "未命名资料"}》${overview}`,
    highlights: [statLine, ...(keywordLine ? [keywordLine] : []), ...highlights].slice(0, 7),
    stats,
  };
}

/** 找出句子所属的段落序号 */
function getParagraphIndex(sentence: string, paragraphs: string[]): number {
  for (let i = 0; i < paragraphs.length; i += 1) {
    if (paragraphs[i].includes(sentence.slice(0, Math.min(12, sentence.length)))) {
      return i;
    }
  }
  return -1;
}

/** 清洗句子：去掉 Markdown 标题符、列表符等噪音 */
function cleanSentence(s: string): string {
  return s
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*+]\s*/, "")
    .replace(/^\d+[.、)]\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 智能截断，保留完整语义 */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

/** 简单去重（含包含关系） */
function dedupe(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    const c = cleanSentence(item);
    if (!c) continue;
    const isDup = result.some(
      (r) => r === c || r.includes(c.slice(0, 20)) || c.includes(r.slice(0, 20))
    );
    if (!isDup) result.push(c);
  }
  return result;
}

/** 从函数定义中提取名称做提示 */
function funcNamesHint(funcs: string[]): string {
  if (funcs.length === 0) return "";
  const names = funcs
    .map((f) => {
      const m = f.match(/(?:function\s+|const\s+|def\s+|class\s+|interface\s+)(\w+)/);
      return m ? m[1] : "";
    })
    .filter(Boolean)
    .slice(0, 5);
  return names.length > 0 ? `主要定义：${names.join("、")}` : "";
}
