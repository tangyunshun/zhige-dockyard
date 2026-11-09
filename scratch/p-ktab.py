# -*- coding: utf-8 -*-
# KnowledgeTab：来源任务/关联组件 UUID 不再裸显（红线：不出现英文标识）
import io

P = "src/components/studio/KnowledgeTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. sourceTaskName 解析：UUID 形态回退为中文归档描述
old = """  let sourceTaskName = item.sourceTaskName?.trim();
  if (!sourceTaskName) {
    if (item.sourceTaskId && item.sourceTaskId !== item.componentId) {
      sourceTaskName = item.sourceTaskId;
    } else if (compInfo.code !== "CORE") {
      sourceTaskName = `${compInfo.name}任务`;
    } else {
      sourceTaskName = "空间研发任务";
    }
  }"""
new = """  let sourceTaskName = item.sourceTaskName?.trim();
  if (!sourceTaskName) {
    if (item.sourceTaskId && item.sourceTaskId !== item.componentId) {
      // KN-UI：来源任务无法解析出名称（任务已归档/删除）时显示中文归档描述，不裸显 UUID（用户红线）
      sourceTaskName = "历史空间任务（已归档）";
    } else if (compInfo.code !== "CORE") {
      sourceTaskName = `${compInfo.name}任务`;
    } else {
      sourceTaskName = "空间研发任务";
    }
  }"""
assert old in s, "task name"
s = s.replace(old, new, 1)

# 2. sourceTaskName 本身是 UUID 时同样替换（后端 task?.name||d.parentId 已可能给出 UUID）
old = """  let sourceTaskName = item.sourceTaskName?.trim();"""
new = """  let sourceTaskName = item.sourceTaskName?.trim();
  // KN-UI：后端兜底返回的 UUID 串同样不裸显（用户红线）
  if (sourceTaskName && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(sourceTaskName)) {
    sourceTaskName = "历史空间任务（已归档）";
  }"""
assert old in s, "uuid guard"
s = s.replace(old, new, 1)

# 3. compInfo 未命中时 full=`[UUID] 空间组件知识` → 中文，不含 UUID
old = '''    : { code: rawComp, name: "空间组件知识", full: `[${rawComp}] 空间组件知识`, category: "💡 团队知识" };'''
new = '''    : { code: rawComp, name: "空间组件知识", full: "空间组件知识", category: "💡 团队知识" };'''
assert old in s, "comp full"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("KnowledgeTab OK")
