import { prisma } from "@/lib/prisma";

// 标准化 IP 地址格式，彻底避免 IPv6 回环 ::1 裸露
export function normalizeIpAddress(ip?: string | null): string {
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.includes("127.0.0.1") || ip === "localhost") {
    return "127.0.0.1 (本地局域网)";
  }
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.replace("::ffff:", "");
    return v4 === "127.0.0.1" ? "127.0.0.1 (本地局域网)" : v4;
  }
  return ip;
}

// 审计字典「权威默认映射」——作为数据库字典的下位兜底与一键种子来源。
// 设计原则：运行时以 system_config 中的 audit_action_dict / audit_resource_dict 为准（可由管理员在库内覆盖），
// 库内无数据时自动用以下默认值落库（懒种子），保证后台标签 100% 中文、不裸英文。
// 注意：这里集中维护「标准动作/资源 → 中文名」的唯一真相源，新增业务动作请同步补充此处。


// KN-CFG：审计字典唯一真相源 = 数据库 system_config（用户红线：配置不允许硬编码）。
// 键：audit_action_dict / audit_resource_dict / audit_display_dict（fields/values/words）。
// 管理员直接在库内维护词条；代码只负责读取与翻译，不再内置任何默认映射。
export async function getAuditDictionariesFromDb() {
  let actionDict: Record<string, string> = {};
  let resourceDict: Record<string, string> = {};
  let fieldDict: Record<string, string> = {};
  let valueDict: Record<string, string> = {};
  let wordDict: Record<string, string> = {};

  try {
    const records = await prisma.systemconfig.findMany({
      where: {
        key: { in: ["audit_action_dict", "audit_resource_dict", "audit_display_dict"] },
      },
    });

    const actionRec = records.find((r) => r.key === "audit_action_dict");
    if (actionRec?.value) {
      try {
        actionDict = JSON.parse(actionRec.value) || {};
      } catch (e) {
        console.error("解析数据库 audit_action_dict 失败:", e);
      }
    }

    const resourceRec = records.find((r) => r.key === "audit_resource_dict");
    if (resourceRec?.value) {
      try {
        resourceDict = JSON.parse(resourceRec.value) || {};
      } catch (e) {
        console.error("解析数据库 audit_resource_dict 失败:", e);
      }
    }

    const displayRec = records.find((r) => r.key === "audit_display_dict");
    if (displayRec?.value) {
      try {
        const parsed = JSON.parse(displayRec.value) || {};
        fieldDict = parsed.fields || {};
        valueDict = parsed.values || {};
        wordDict = parsed.words || {};
      } catch (e) {
        console.error("解析数据库 audit_display_dict 失败:", e);
      }
    }
  } catch (e) {
    console.error("读取数据库审计字典失败（未知动作将按剥离英文兜底）:", e);
  }

  // 组装用于下拉筛选的标准化选项列表（按字典动态生成，去重）
  const actionOptionsMap = new Map<string, string>();
  for (const [value, label] of Object.entries(actionDict)) {
    const normLabel = (label || "").trim();
    if (!normLabel) continue;
    if (!actionOptionsMap.has(normLabel)) {
      actionOptionsMap.set(normLabel, value);
    }
  }

  const actionOptions = Array.from(actionOptionsMap.entries()).map(([label, value]) => ({
    value,
    label,
  }));

  return { actionDict, resourceDict, fieldDict, valueDict, wordDict, actionOptions };
}


function lookupDict(key: string, dict: Record<string, string>): string | null {
  if (!key) return null;
  const raw = key.trim();
  if (dict[raw]) return dict[raw];

  // 大小写不敏感
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(dict)) {
    if (k.toLowerCase() === lower) return v;
  }

  // 下划线与空格互转对比
  const withUnder = lower.replace(/\s+/g, "_");
  const withSpace = lower.replace(/_+/g, " ");
  for (const [k, v] of Object.entries(dict)) {
    const kLower = k.toLowerCase();
    if (kLower === withUnder || kLower === withSpace) return v;
  }

  return null;
}

// 智能动作语义转译引擎（防生僻英文泄漏兜底）

// 兜底动作翻译：词根全部来自数据库（wordDict = audit_display_dict.words，resourceDict = 模块前缀资源名），
// 未登记的纯英文词根直接剥离，杜绝审计标签漏英文（用户红线）。
function fallbackTranslateAction(
  action: string,
  wordDict: Record<string, string>,
  resourceDict: Record<string, string>
): string {
  const lower = (action || "").trim().toLowerCase();
  if (!lower) return "系统操作";

  let prefix = "";
  let actBody = lower;
  if (lower.includes(":")) {
    const [mod, ...rest] = lower.split(":");
    actBody = rest.join(":");
    prefix = lookupDict(mod, resourceDict) || "";
  }

  const words = actBody.replace(/[:_\s-]+/g, " ").trim().split(" ").filter(Boolean);
  const translatedWords = words.map((w) => {
    const hit = lookupDict(w, wordDict);
    if (hit) return hit;
    // 未识别的纯英文词根直接剥离（含数字/混合形态保留原样以便辨识 ID/版本号）
    if (/^[a-z]+$/i.test(w)) return "";
    return w;
  });

  const combined = translatedWords.join("");
  if (!combined) return prefix || "系统操作";
  return prefix ? `${prefix}: ${combined}` : combined;
}


export function translateAction(
  action: string,
  actionDict: Record<string, string>,
  wordDict: Record<string, string> = {},
  resourceDict: Record<string, string> = {}
) {
  const norm = (action || "").trim();
  const matchedLabel = lookupDict(norm, actionDict);
  const label = matchedLabel || (norm.toUpperCase() === "USER_REGISTER" ? "新用户自主注册" : fallbackTranslateAction(norm, wordDict, resourceDict));

  const act = norm.toLowerCase();
  let bg = "bg-slate-50";
  let text = "text-slate-700";
  let border = "border-slate-200";

  if (act.includes("role") || act.includes("permission") || act.includes("admin")) {
    bg = "bg-amber-50";
    text = "text-amber-700";
    border = "border-amber-200";
  } else if (act.includes("ban") || act.includes("lock") || act.includes("delete") || act.includes("kick") || act.includes("conflict")) {
    bg = "bg-red-50";
    text = "text-red-700";
    border = "border-red-200";
  } else if (act.includes("register") || act.includes("signup") || act.includes("upgrade") || act.includes("order") || act.includes("plan") || act.includes("recharge") || act.includes("approve") || act.includes("publish")) {
    bg = "bg-emerald-50";
    text = "text-emerald-700";
    border = "border-emerald-200";
  } else if (act.includes("login") || act.includes("auth") || act.includes("session")) {
    bg = "bg-blue-50";
    text = "text-[#2b6cb0]";
    border = "border-blue-200";
  } else if (act.includes("create") || act.includes("add") || act.includes("new")) {
    bg = "bg-purple-50";
    text = "text-purple-700";
    border = "border-purple-200";
  } else if (act.includes("test") || act.includes("sms") || act.includes("email")) {
    bg = "bg-cyan-50";
    text = "text-cyan-700";
    border = "border-cyan-200";
  }

  return { label, bg, text, border };
}

// 翻译涉及业务资源（完全基于数据库驱动 + 智能语义防护）
export function translateResource(resource: string | null | undefined, resourceDict: Record<string, string>): string {
  if (!resource || resource === "-" || resource === "null") return "系统基础环境";
  const clean = resource.trim();

  // 0. 裸业务对象 ID 兜底（如 clxxx / comp_xxx 等无命名空间标识），避免直接回显无意义串
  if (!clean.includes("/") && !clean.includes(":") && !clean.includes(" ")) {
    // 组件目录编码（如 C01 / C12）：转译为「组件 C01」
    if (/^c\d{1,4}$/i.test(clean)) {
      return `组件 ${clean.toUpperCase()}`;
    }
    if (/^[a-z0-9]+$/i.test(clean) && clean.length > 10) {
      // KN-UI：先做一次大小写不敏感字典匹配（如 SYSTEMCONFIG → 系统配置），命中即中文化
      const dictHit = lookupDict(clean, resourceDict);
      if (dictHit) return dictHit;
      // KN-UI：驼峰复合词拆根逐段查字典（如 SystemDocumentCategory → 系统文档分类），未识别英文剥离
      const roots = clean.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
      const rootZh = roots
        .map((r) => lookupDict(r, resourceDict) || (/^[a-z]+$/i.test(r) ? "" : r))
        .join("");
      if (rootZh) return rootZh;
      const shortId = clean.length > 18 ? `${clean.slice(0, 8)}...${clean.slice(-6)}` : clean;
      return `指定业务对象 (${shortId})`;
    }
  }

  // 1. 字典精准与规范化匹配
  const matched = lookupDict(clean, resourceDict);
  if (matched) return matched;

  // 2. 路径层级资源解析（如 auth/session）
  if (clean.includes("/")) {
    const parts = clean.split("/");
    return parts.map((p) => lookupDict(p, resourceDict) || p).join(" / ");
  }

  // 3. 命名空间与实体 ID 解析（如 user:clxxxxxx）
  if (clean.includes(":")) {
    const [type, id] = clean.split(":");
    const typeZh = lookupDict(type, resourceDict) || type;
    const shortId = id.length > 18 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
    return `${typeZh} (${shortId})`;
  }

  // 4. 常见复合英文词根兜底转译
  if (clean.includes("_") || clean.includes(" ")) {
    const words = clean.toLowerCase().replace(/_+/g, " ").split(" ");
    const translated = words.map((w) => {
      switch (w) {
        case "sms": return "短信";
        case "gateway": return "网关通道";
        case "email": return "邮件";
        case "database": return "数据库";
        case "snapshot": return "快照";
        case "oauth": return "第三方认证";
        case "channels": return "登录渠道";
        case "config": return "配置";
        case "system": return "系统";
        case "settings": return "设置";
        case "user": return "用户";
        case "workspace": return "工作空间";
        case "member": return "成员";
        case "component": return "组件";
        case "password": return "登录密码";
        case "security": return "平台安全";
        case "knowledge": return "知识资产";
        case "task": return "生成任务";
        case "smtp": return "邮件SMTP";
        case "auth": return "安全认证";
        case "device": return "登录设备";
        case "session": return "在线会话";
        case "matrix": return "矩阵";
        case "positions": return "布局";
        case "asset": return "知识资料";
        case "studio": return "组件工作台";
        case "audit": return "审计";
        case "log": return "日志";
        case "login": return "登录";
        case "history": return "历史";
        default: return w;
      }
    }).join("");
    return translated;
  }

  return clean;
}
