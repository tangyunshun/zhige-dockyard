/**
 * 服务端轻量短缓存（P3）
 *
 * 仅用于「计算昂贵、秒级内不易变、读频率高」的只读辅助数据，例如：
 *   - 工作空间已装配组件数（getBoundComponentCount）
 *   - 工作空间中枢 Dashboard 聚合响应
 *
 * 安全设计：
 * 1. TTL 极短（2~4 秒），即便有写路径未覆盖，也只会短暂显示旧值，随后自动恢复；
 * 2. 关键写路径（装配 / 解绑 / 清空 / 解散等）成功后会调用 clearServerCache()
 *    整体失效，保证组件数等强时效数据「变更后立即正确」，不存在陈旧的业务判断风险；
 * 3. 只缓存读结果，从不跳过任何写操作。
 *
 * 说明：缓存挂在 globalThis 上，规避 Next.js dev 模式模块热更新导致缓存表丢失/膨胀；
 * 多实例部署时各实例独立缓存，仍是幂等只读结果，无一致性问题。
 */
interface CacheEntry {
  expireAt: number;
  value: unknown;
}

const MAX_ENTRIES = 500;

const globalHolder = globalThis as unknown as {
  __zhigeServerCache__?: Map<string, CacheEntry>;
};

function getStore(): Map<string, CacheEntry> {
  if (!globalHolder.__zhigeServerCache__) {
    globalHolder.__zhigeServerCache__ = new Map();
  }
  return globalHolder.__zhigeServerCache__;
}

export function serverCacheGet<T>(key: string): T | undefined {
  const store = getStore();
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expireAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function serverCacheSet(key: string, ttlMs: number, value: unknown): void {
  const store = getStore();
  // 简单容量保护：超限时整体清空（缓存量小，重建成本可忽略）
  if (store.size >= MAX_ENTRIES) {
    store.clear();
  }
  store.set(key, { expireAt: Date.now() + ttlMs, value });
}

/** 清空全部服务端短缓存，供写接口在成功写入后调用以保证数据时效 */
export function clearServerCache(): void {
  const store = getStore();
  if (store.size > 0) {
    store.clear();
  }
}
