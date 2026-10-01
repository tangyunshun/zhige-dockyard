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
 *
 * 三条不可破坏的约束（历史缺陷修复，务必保留）：
 * 1. 调用方的 signal 只作用于「它自己拿到的那份 Promise」，绝不下沉到共享的底层请求。
 *    否则某个调用方（如 AuthCheck 的 AbortSignal.timeout(10000)）一旦超时，
 *    会连带中断并拒绝所有共享同一次请求的调用方，表现为控制台
 *    “TimeoutError: signal timed out”。
 * 2. 共享请求自带安全超时，保证一定会结算，不会在后端无响应时永久占用 in-flight 槽位。
 * 3. 交出去的 Promise 内部消化拒绝：调用方可能提前 return 而从未 await
 *    （如 useWorkspaceHubData 中并发预取的 dashboard 请求），
 *    若不消化会产生未处理拒绝，在 Next.js 开发环境弹 Console 错误。
 */
const inFlightMap = new Map<string, Promise<Response>>();

/** 共享请求的安全上限：超时即中止并释放槽位，避免个别接口无响应时永久阻塞后续同接口请求 */
const SHARED_REQUEST_TIMEOUT_MS = 20_000;

function toAbortReason(signal: AbortSignal): unknown {
  return (
    (signal as AbortSignal & { reason?: unknown }).reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

/** 把 signal 只绑定到调用方自己持有的 Promise 上，不影响共享的底层请求 */
function bindCallerSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(toAbortReason(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(toAbortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

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

  // 调用方 signal 不下沉到共享请求（约束 1），其余 init 保持原样
  const { signal, ...sharedInit } = init ?? {};

  const existing = inFlightMap.get(key);
  if (existing) {
    // 加入者：复用进行中的底层响应，但拿到独立 clone，可各自读 body
    return bindCallerSignal(existing.then((res) => res.clone()), signal);
  }

  const raw = fetch(input, {
    ...sharedInit,
    signal: AbortSignal.timeout(SHARED_REQUEST_TIMEOUT_MS),
  });
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
  const result = raw.then((res) => res.clone());
  // 约束 3：共享结果可能被调用方遗弃（提前 return 未 await），此处提前挂上拒绝处理器，
  // 使该 Promise 始终处于“已处理”状态，杜绝 UnhandledPromiseRejection；
  // 真正 await 它的调用方依然能正常拿到 reject 并自行处理。
  result.catch(() => {});

  return bindCallerSignal(result, signal);
}
