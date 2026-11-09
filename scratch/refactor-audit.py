# -*- coding: utf-8 -*-
# 重构 audit-dict.ts：删除全部 DEFAULT_* 硬编码常量，运行时只从 DB 读取
import io, re

P = "src/lib/audit-dict.ts"
s = io.open(P, encoding="utf-8").read()

# —— 1. 删除六个 DEFAULT_* 常量块 + ensureAuditDictionariesSeeded（从 DEFAULT_ACTION_DICT 起到 getAuditDictionariesFromDb 前）——
i_start = s.find("export const DEFAULT_ACTION_DICT")
i_getdb = s.find("export async function getAuditDictionariesFromDb")
assert i_start > 0 and i_getdb > i_start, "markers"
head = s[:i_start].rstrip() + "\n\n"

# —— 2. 替换 getAuditDictionariesFromDb 整个函数（到 function lookupDict 前）——
i_lookup = s.find("function lookupDict")
assert i_lookup > i_getdb

new_getdb = '''// KN-CFG：审计字典唯一真相源 = 数据库 system_config（用户红线：配置不允许硬编码）。
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

'''

# —— 3. 重写 fallbackTranslateAction（词根全部查 DB）——
# 定位旧 fallback：function fallbackTranslateAction ... 到 export function translateAction
i_fb = s.find("function fallbackTranslateAction")
i_ta = s.find("export function translateAction")
assert 0 < i_fb < i_ta

new_fallback = '''// 兜底动作翻译：词根全部来自数据库（wordDict = audit_display_dict.words，resourceDict = 模块前缀资源名），
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

  const words = actBody.replace(/[:_\\s-]+/g, " ").trim().split(" ").filter(Boolean);
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

'''

# —— 4. translateAction 签名加 wordDict/resourceDict ——
ta_seg = s[i_ta:i_lookup if i_lookup > i_ta else len(s)]
ta_new = ta_seg.replace(
    "export function translateAction(action: string, actionDict: Record<string, string>) {",
    "export function translateAction(\n  action: string,\n  actionDict: Record<string, string>,\n  wordDict: Record<string, string> = {},\n  resourceDict: Record<string, string> = {}\n) {",
).replace(
    "fallbackTranslateAction(norm)",
    "fallbackTranslateAction(norm, wordDict, resourceDict)",
)

# —— 组装：head + 新 getdb + lookupDict 段 + 新 fallback + translateAction(改) + 其后（translateResource 等）——
# lookupDict 段 = i_lookup..i_fb（lookupDict 与旧 fallback 之间可能有其它函数？检查：lookupDict 后直接是 fallback）
lookup_seg = s[i_lookup:i_fb]

new_s = (
    head
    + "\n"
    + new_getdb
    + "\n"
    + lookup_seg
    + "\n"
    + new_fallback
    + "\n"
    + ta_new
)
# 保留 translateResource 及其后的内容（从 i_ta 段结束即 translateResource 起到文件尾已在 ta_seg 中？）
# ta_seg 是 i_ta 到 i_lookup——但 i_lookup < i_ta，所以 ta_seg = i_ta..文件尾，包含 translateResource。
# 上面组装里 ta_new 已含 translateResource 及其后内容，无需重复。
io.open(P, "w", encoding="utf-8", newline="").write(new_s)
print("refactored, new length:", len(new_s.split(chr(10))))
