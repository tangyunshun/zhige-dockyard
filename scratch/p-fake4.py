# -*- coding: utf-8 -*-
# UsageStatsTab：伪归因真实化 + 假兜底移除 + 英文枚举中文化
import io, re

P = "src/components/studio/UsageStatsTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 伪归因（i%3 轮询塞 3 个假原因）→ 真实口径：仅统计真实失败数，不再臆造原因分布
old = """  // 任务失败与中断真实原因统计及占总任务的精准百分比 (%)
  const failureReasonStats = useMemo(() => {
    const totalAll = filteredTasks.length || 1;
    const reasons = [
      { name: "源数据格式解析异常", count: 0 },
      { name: "算力余额不足/网关拦截", count: 0 },
      { name: "网络通信与处理超时", count: 0 },
    ];
    filteredTasks.filter(t => t.status === "FAILED").forEach((_, i) => {
      reasons[i % 3].count += 1;
    });
    return reasons.map(r => ({
      ...r,
      percentage: Math.round((r.count / totalAll) * 100)
    }));
  }, [filteredTasks]);"""
new = """  // 任务失败统计（真实口径：仅统计真实失败数；具体失败原因请查看任务详情内的 errorCode，绝不臆造分布）
  const failureReasonStats = useMemo(() => {
    const totalAll = filteredTasks.length || 1;
    const failedCount = filteredTasks.filter(t => t.status === "FAILED").length;
    return [
      { name: "失败任务（原因请查看任务详情）", count: failedCount },
    ].map(r => ({
      ...r,
      percentage: Math.round((r.count / totalAll) * 100)
    }));
  }, [filteredTasks]);"""
assert old in s, "fake attribution"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("attribution OK")
