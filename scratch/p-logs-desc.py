# -*- coding: utf-8 -*-
# LogsTab：AI 黑话描述换大白话 + 默认兜底用动作标签
import io

P = "src/components/studio/LogsTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 知识类动作描述：去"沉淀知识库规约项"黑话
old = """      case "KNOWLEDGE_PUBLISH":
      case "KNOWLEDGE_SUBMIT":
      case "KNOWLEDGE_APPROVE":
      case "KNOWLEDGE_REJECT":
        return d.title ? `沉淀与归档团队知识《${d.title}》` : "沉淀知识库规约项";"""
new = """      case "KNOWLEDGE_PUBLISH":
        return d.title ? `发布知识《${d.title}》` : "发布了一篇知识内容";
      case "KNOWLEDGE_SUBMIT":
        return d.title ? `提交知识《${d.title}》审核` : "提交了一篇知识内容审核";
      case "KNOWLEDGE_APPROVE":
        return d.title ? `审核通过知识《${d.title}》` : "审核通过了一篇知识内容";
      case "KNOWLEDGE_REJECT":
        return d.title ? `驳回知识《${d.title}》` : "驳回了一篇知识内容";"""
assert old in s, "knowledge desc"
s = s.replace(old, new, 1)

# 2. 默认兜底：改用动作中文标签（调用方传入），去"完成空间协同事务"黑话
old = """      default:
        return d.message || "完成空间协同事务";
    }
  };"""
new = """      default:
        return d.message || fallbackLabel || "执行了一项空间操作";
    }
  };"""
assert old in s, "default"
s = s.replace(old, new, 1)

# 3. 签名加 fallbackLabel 并更新两处调用
old = """  const summarizeDetails = (action: string, details: any): string => {
    if (!details || typeof details !== "object") return "执行通用空间协同操作";"""
new = """  const summarizeDetails = (action: string, details: any, fallbackLabel?: string): string => {
    if (!details || typeof details !== "object") return fallbackLabel || "执行了一项空间操作";"""
assert old in s, "signature"
s = s.replace(old, new, 1)

# 调用点：先取 meta 再 summarize（搜索区内 meta 已算好；渲染区逐行算）
old = """        const hay = `${actorName(log)} ${log.action} ${meta.label} ${meta.category} ${summarizeDetails(log.action, log.details)}`.toLowerCase();"""
new = """        const hay = `${actorName(log)} ${log.action} ${meta.label} ${meta.category} ${summarizeDetails(log.action, log.details, meta.label)}`.toLowerCase();"""
assert old in s, "search call"
s = s.replace(old, new, 1)

# 渲染区两处（799-800 附近）——找模式
import re
pattern = re.compile(r"(\{summarizeDetails\(log\.action, log\.details\)\})")
cnt = s.count("summarizeDetails(log.action, log.details)")
# 逐个替换为带 meta.label 的版本：渲染处已有 const meta = resolveMeta(...) 在同一作用域
s = s.replace("summarizeDetails(log.action, log.details)", "summarizeDetails(log.action, log.details, resolveMeta(log.action, log).label)")
print("call sites updated:", cnt)

# 4. "沉淀与归档"其他黑话排查
for w in ["沉淀与归档", "全维应归档", "协同事务"]:
    if w in s:
        print("REMAINING JARGON:", w)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("LogsTab desc OK")
