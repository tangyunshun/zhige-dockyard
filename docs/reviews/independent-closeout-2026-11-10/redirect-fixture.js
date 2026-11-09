"use strict";
function sanitizeInternalRedirect(raw) {
    const fallback = "/workspace-hub";
    if (!raw)
        return fallback;
    let v = String(raw).trim();
    try {
        const dec = decodeURIComponent(v);
        if (dec !== v)
            v = dec;
    }
    catch { /* 保留原值继续校验 */ }
    if (!v.startsWith("/"))
        return fallback; // 相对/外站/协议
    if (v.startsWith("//") || v.startsWith("/\\") || v.includes("\\"))
        return fallback; // 协议相对/反斜杠绕过
    if (v.includes(":"))
        return fallback; // 任何 scheme（javascript:/data:/http: 等）
    if (v.toLowerCase().startsWith("%2f"))
        return fallback;
    return v;
}

module.exports=sanitizeInternalRedirect;
