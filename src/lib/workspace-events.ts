/**
 * 空间信息（Logo 等）变更的全局事件总线。
 *
 * 背景：空间 Logo 同时展示在顶部导航、工作台、空间中枢、管理后台等多处，
 * 这些位置的数据分别来自 AppContext / WorkspaceContext / 各页面自身的接口缓存，
 * 启动时拉取一次后常驻内存，因此改了 Logo 之后"别处还是旧的"。
 *
 * 方案：变更成功并落库后广播本事件，各处监听者即时重新拉取，保证全端实时一致。
 */
export const WORKSPACE_LOGO_UPDATED_EVENT = "workspace:logo-updated";

export interface WorkspaceLogoUpdatedDetail {
  workspaceId: string;
  logo: string;
}

/** 广播「空间 Logo 已更新」（仅浏览器环境生效，服务端渲染时静默忽略） */
export function emitWorkspaceLogoUpdated(detail: WorkspaceLogoUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceLogoUpdatedDetail>(WORKSPACE_LOGO_UPDATED_EVENT, { detail }),
  );
}

/** 订阅「空间 Logo 已更新」，返回取消订阅函数 */
export function onWorkspaceLogoUpdated(
  handler: (detail: WorkspaceLogoUpdatedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<WorkspaceLogoUpdatedDetail>).detail);
  window.addEventListener(WORKSPACE_LOGO_UPDATED_EVENT, listener);
  return () => window.removeEventListener(WORKSPACE_LOGO_UPDATED_EVENT, listener);
}
