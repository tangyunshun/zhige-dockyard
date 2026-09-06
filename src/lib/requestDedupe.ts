/**
 * 并发 GET 去重合并器
 *
 * 背景：AppProvider / WorkspaceProvider / AuthCheck / 页面 Hooks 会在同一时刻
 * 对同一 GET 接口（如 /api/auth/me、/api/workspace/list）发起重复请求，
 * 造成数据库重复查询与串行等待，是页面加载慢的放大因素之一。
 *
 * 做法：只合并“同一时刻仍处于进行中”的相同请求（忽略查询串与缓存标记），
 * 共用同一次网络往返；请求一结束立即移出表，后续新请求仍能拿到最新数据，
 * 因此不会引入“旧数据”。非 GET 请求直接透传不合并。
 *
 * 注意：fetch 的 Response body 只能读一次，这里为每个调用方返回独立 clone，
 * 保证多个调用方各自 await res.json() 不会冲突。
 */
const inFlightMap = new Map<string, Promise<Response>>();

export function dedupeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") {
    return fetch(input, init);
  }

  // 去掉查询串与时间戳标记（_t=...），使 /api/workspace/list 与
  // /api/workspace/list?_t=xxx 视为同一请求。
  const rawUrl =
    typeof input === "string"
      ? input.split("?")[0]
      : String(input).split("?")[0];
  const key = `${method} ${rawUrl}`;

  const existing = inFlightMap.get(key);
  if (existing) {
    // 加入者：复用进行中的底层响应，但拿到独立 clone，可各自读 body
    return existing.then((res) => res.clone());
  }

  const raw = fetch(input, init);
  inFlightMap.set(key, raw);
  // 无论成功失败，请求结束后立即移出，避免后续请求被“旧”响应顶替
  raw.then(
    () => {
      if (inFlightMap.get(key) === raw) inFlightMap.delete(key);
    },
    () => {
      if (inFlightMap.get(key) === raw) inFlightMap.delete(key);
    },
  );
  // 发起方同样使用 clone，行为与加入者一致，避免原始 Response 被重复消费
  return raw.then((res) => res.clone());
}
