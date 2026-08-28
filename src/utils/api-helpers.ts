/**
 * 安全地将 Fetch Response 解析为 JSON。
 * 如果 Response 不是 JSON 格式（例如服务端返回了 404/500 的 HTML 页面，或者重定向 HTML），
 * 则不会抛出 Unexpected token '<', "<!DOCTYPE "... 语法异常，
 * 而是安全捕获并返回结构化的错误对象。
 */
export async function safeJsonResponse<T = any>(
  res: Response,
  fallbackErrorMsg: string = "服务器响应异常"
): Promise<{ success: boolean; data?: T; error?: string; status: number }> {
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const errorMsg = res.ok
      ? fallbackErrorMsg
      : `请求失败 (${res.status}): ${res.statusText || fallbackErrorMsg}`;
    return {
      success: false,
      error: errorMsg,
      status: res.status,
    };
  }

  try {
    const json = await res.json();
    if (!res.ok) {
      const errorMsg = json?.error || json?.message || fallbackErrorMsg;
      return {
        success: false,
        data: json,
        error: errorMsg,
        status: res.status,
      };
    }
    return {
      success: true,
      data: json,
      status: res.status,
    };
  } catch (err) {
    return {
      success: false,
      error: `JSON 解析异常 (${res.status})`,
      status: res.status,
    };
  }
}
