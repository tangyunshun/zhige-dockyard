# -*- coding: utf-8 -*-
# UsageStatsTab 假兜底移除（真实口径：无数据显示占位而非假值）
import io

P = "src/components/studio/UsageStatsTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 初始 state：全 0 / null，不再预置 1.2s 响应与 1.17GB 存储假值
old = """  const [remoteStats, setRemoteStats] = useState<any>({
    totalCalls: 0,
    activeComponents: 0,
    successRate: 0,
    avgResponseTime: 1.2,
    storage: { used: 1258291200, limit: 10737418240 },
  });"""
new = """  // KN-UI：真实口径——接口未返回前一律空值占位，绝不预置假数据（自查清单红线）
  const [remoteStats, setRemoteStats] = useState<any>({
    totalCalls: 0,
    activeComponents: 0,
    successRate: null,
    avgResponseTime: null,
    storage: null,
  });"""
assert old in s, "init"
s = s.replace(old, new, 1)

# 2. 成功写入：无真实值保持 null（不回退假值）
old = """          setRemoteStats({
            totalCalls: s.totalComponentCalls || recentTasks.length,
            activeComponents: s.activeComponents || boundComps.length,
            successRate: s.successRate || 100,
            avgResponseTime: s.avgResponseTime || 1.2,
            storage: s.storage || { used: 1258291200, limit: 10737418240 },
          });"""
new = """          setRemoteStats({
            totalCalls: s.totalComponentCalls ?? recentTasks.length,
            activeComponents: s.activeComponents ?? boundComps.length,
            successRate: s.successRate ?? null,
            avgResponseTime: s.avgResponseTime ?? null,
            storage: s.storage ?? null,
          });"""
assert old in s, "write"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("fallbacks OK")
