/**
 * 资料事件通知中心
 *
 * 统一负责：资料移除 / 恢复 / 恢复申请 等事件的成员触达。
 * 通道策略：
 *   - 站内通知（notification 表）：必达，直接写入通知中心，前端头部铃铛与消息页即时可见。
 *   - 不使用邮件：邮件通道在本项目中不可用，所有资料事件仅通过站内消息提醒触达。
 */

import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

/** 移除原因枚举与展示文案 */
export const REMOVAL_REASONS: Record<string, string> = {
  VIOLATION: "违规内容",
  EXPIRED: "资料过期",
  COPYRIGHT: "版权问题",
  OTHER: "其他原因",
};

export function reasonLabel(code: string): string {
  return REMOVAL_REASONS[code] || REMOVAL_REASONS.OTHER;
}

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 资料被其他功能引用的情况（用于移除前的冲突检测与分级提示） */
export interface AssetUsage {
  sharesActive: number; // 仍有效的分享链接
  comments: number; // 评论数
  versions: number; // 历史版本数
  childDocs: number; // 以该资料为上级的子资料数
}

/** 生成“被其他功能引用”的影响提示文本；无引用时返回空串 */
function usageImpactLine(u?: AssetUsage | null): string {
  if (!u) return "";
  const parts: string[] = [];
  if (u.sharesActive > 0) parts.push(`${u.sharesActive} 条分享链接`);
  if (u.comments > 0) parts.push(`${u.comments} 条评论`);
  if (u.versions > 0) parts.push(`${u.versions} 个历史版本`);
  if (u.childDocs > 0) parts.push(`${u.childDocs} 个子资料`);
  if (parts.length === 0) return "";
  return `\n⚠️ 该资料仍被其他功能引用（${parts.join("、")}），移除后这些关联将不可用，已生成的分享链接也会失效。`;
}

interface DispatchResult {
  notified: number; // 站内通知成功数
  mailed: number; // 邮件成功数
}

/**
 * 向空间内全体成员批量投递（仅站内通知，直达通知中心）。
 * @param excludeUserIds 需要排除的用户（如操作人自己）
 */
async function dispatchToWorkspace(
  workspaceId: string,
  payload: { title: string; content: string; link?: string; excludeUserIds?: string[] }
): Promise<DispatchResult> {
  const result: DispatchResult = { notified: 0, mailed: 0 };

  const members = await prisma.workspacemember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  const exclude = new Set(payload.excludeUserIds || []);
  const userIds = Array.from(new Set(members.map((m) => m.userId))).filter((id) => !exclude.has(id));
  if (userIds.length === 0) return result;

  // 站内通知：重要事件，全体必达，前端头部铃铛与消息页即时可见
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        await addNotification(uid, payload.title, payload.content, "asset", payload.link || null);
        result.notified++;
      } catch (e) {
        console.warn("[资料通知] 站内通知写入失败:", uid, (e as Error)?.message);
      }
    })
  );

  return result;
}

/** 单独给某位用户投递（如原上传人、被 @ 的成员），仅站内通知 */
async function dispatchToUser(
  userId: string,
  payload: { title: string; content: string; link?: string }
): Promise<DispatchResult> {
  const result: DispatchResult = { notified: 0, mailed: 0 };
  try {
    await addNotification(userId, payload.title, payload.content, "asset", payload.link || null);
    result.notified++;
  } catch (e) {
    console.warn("[资料通知] 站内通知写入失败:", userId, (e as Error)?.message);
  }
  return result;
}

/**
 * 向空间成员逐人投递，可为每位成员定制标题/内容（如按上传人区分）。
 * 同一成员只会收到一条；excludeUserIds 中的用户（如操作人本人）不投递。
 */
async function dispatchPerMember(
  workspaceId: string,
  build: (userId: string) => { title: string; content: string; link?: string } | null,
  excludeUserIds: string[] = []
): Promise<DispatchResult> {
  const result: DispatchResult = { notified: 0, mailed: 0 };
  const members = await prisma.workspacemember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  const exclude = new Set(excludeUserIds);
  await Promise.all(
    members.map(async (m) => {
      if (exclude.has(m.userId)) return;
      const payload = build(m.userId);
      if (!payload) return;
      try {
        await addNotification(m.userId, payload.title, payload.content, "asset", payload.link || null);
        result.notified++;
      } catch (e) {
        console.warn("[资料通知] 站内通知写入失败:", m.userId, (e as Error)?.message);
      }
    })
  );
  return result;
}

/**
 * 资料被管理员移除 → 通知全体成员（含资料名称、原因、时间、联系管理员）
 * 并单独提醒原上传人可申请恢复。
 */
export async function notifyAssetRemoved(params: {
  workspaceId: string;
  documentId: string;
  title: string;
  reasonCode: string;
  reasonDetail?: string | null;
  removedByName: string;
  removedByUserId: string;
  uploaderId?: string | null;
  removedAt?: Date;
  usage?: AssetUsage | null;
  // 额外排除的用户（如删除申请人本人）：其提交删除申请经审核生效后，不应再收到“资料已被移除”通知
  excludeUserIds?: string[];
}): Promise<DispatchResult> {
  const { workspaceId, documentId, title, reasonCode, reasonDetail, removedByName, removedByUserId, uploaderId } = params;
  const removedAt = params.removedAt || new Date();
  const timeText = fmtDateTime(removedAt);
  const detail = (reasonDetail || "").trim();
  const link = `/workspace/${workspaceId}?tab=assets`;
  const impact = usageImpactLine(params.usage);

  const standardContent =
    `资料名称：《${title}》\n` +
    `移除原因：${reasonLabel(reasonCode)}${detail ? ` — ${detail}` : ""}\n` +
    `移除时间：${timeText}\n` +
    `操作人：${removedByName}\n` +
    `如有疑问，请联系空间管理员。${impact}`;

  const uploaderContent =
    `您上传的资料《${title}》已被移除。\n` +
    `移除原因：${reasonLabel(reasonCode)}${detail ? ` — ${detail}` : ""}\n` +
    `移除时间：${timeText}\n` +
    `操作人：${removedByName}\n` +
    `如您认为移除有误，请在 7 日内联系空间管理员申请恢复。${impact}`;

  // 仅向“非操作人”的成员推送，每位成员只收到一条：
  // 若接收人正是原上传人，则内容携带“7 日内申请恢复”提示，其余成员为标准文案。
  const r = await dispatchPerMember(
    workspaceId,
    (uid) => {
      const isUploader = !!uploaderId && uid === uploaderId;
      return {
        title: isUploader ? "🗑️ 您上传的资料已被移除" : "🗑️ 资料已被移除",
        content: isUploader ? uploaderContent : standardContent,
        link,
      };
    },
    [removedByUserId, ...(params.excludeUserIds || [])]
  );

  return r;
}

/**
 * 批量资料被移除 → 全空间广播（含完整清单）+ 逐上传人单独提醒（仅其本人被移除的资料）
 * byUploader: 上传人 userId -> 该上传人被移除的资料标题列表（用于精准通知，避免把他人资料泄露给对方）
 */
export async function notifyAssetsBatchRemoved(params: {
  workspaceId: string;
  titles: string[];
  byUploader: Record<string, string[]>;
  reasonCode: string;
  reasonDetail?: string | null;
  removedByName: string;
  removedByUserId: string;
  removedAt?: Date;
  usage?: AssetUsage | null;
}): Promise<DispatchResult> {
  const { workspaceId, titles, byUploader, reasonCode, reasonDetail, removedByName, removedByUserId } = params;
  const removedAt = params.removedAt || new Date();
  const timeText = fmtDateTime(removedAt);
  const detail = (reasonDetail || "").trim();
  const link = `/workspace/${workspaceId}?tab=assets`;
  const reasonText = `移除原因：${reasonLabel(reasonCode)}${detail ? ` — ${detail}` : ""}`;
  const allList = titles.slice(0, 10).map((t, i) => `  ${i + 1}. 《${t}》`).join("\n");
  const more = titles.length > 10 ? `\n  ……（共 ${titles.length} 项）` : "";
  const impact = usageImpactLine(params.usage);

  const broadcastContent =
    `${removedByName} 批量移除了 ${titles.length} 项资料。\n` +
    `${reasonText}\n` +
    `移除时间：${timeText}\n` +
    `资料清单：\n${allList}${more}\n` +
    `如有疑问，请联系空间管理员。${impact}`;

  // 仅向“非操作人”成员推送，每位成员一条：
  //  - 原上传人：仅列其本人被移除的资料，并附“7 日内申请恢复”提示
  //  - 其他成员：收到完整的批量移除清单
  const r = await dispatchPerMember(
    workspaceId,
    (uid) => {
      const ownTitles = byUploader[uid];
      if (ownTitles && ownTitles.length > 0) {
        const ownList = ownTitles.slice(0, 10).map((t, i) => `  ${i + 1}. 《${t}》`).join("\n");
        const ownMore = ownTitles.length > 10 ? `\n  ……（您共被移除 ${ownTitles.length} 项）` : "";
        return {
          title: "🗑️ 您上传的资料已被移除",
          content:
            `您上传的以下资料已被移除：\n` +
            `${ownList}${ownMore}\n` +
            `${reasonText}\n` +
            `移除时间：${timeText}\n` +
            `操作人：${removedByName}\n` +
            `如您认为移除有误，请在 7 日内联系空间管理员申请恢复。`,
          link,
        };
      }
      return {
        title: `🗑️ ${titles.length} 项资料已被移除`,
        content: broadcastContent,
        link,
      };
    },
    [removedByUserId]
  );

  return r;
}

/** 资料被恢复 → 通知全体成员 */
export async function notifyAssetRestored(params: {
  workspaceId: string;
  documentId: string;
  title: string;
  restoredByName: string;
  restoredByUserId: string;
}): Promise<DispatchResult> {
  const { workspaceId, title, restoredByName, restoredByUserId } = params;
  const link = `/workspace/${workspaceId}?tab=assets`;
  const content =
    `资料名称：《${title}》\n` +
    `恢复时间：${fmtDateTime(new Date())}\n` +
    `操作人：${restoredByName}\n` +
    `该资料已重新回到空间资料库，可正常查看与使用。`;

  return dispatchToWorkspace(
    workspaceId,
    { title: "♻️ 资料已恢复", content, link, excludeUserIds: [restoredByUserId] }
  );
}

/**
 * 成员申请恢复资料 → 通知空间内全部管理员/所有者（站内消息），
 * 管理员在「治理中心 → 移除记录」中审核并恢复后，成员会收到恢复通知。
 */
export async function notifyRestoreRequested(params: {
  workspaceId: string;
  title: string;
  requesterName: string;
  requesterId: string;
  message?: string | null;
  removedAt?: Date;
  deadlineText?: string;
}): Promise<DispatchResult> {
  const { workspaceId, title, requesterName, requesterId, message, removedAt, deadlineText } = params;
  const link = `/workspace/${workspaceId}?tab=governance`;
  const admins = await prisma.workspacemember.findMany({
    where: { workspaceId, role: { in: ["ADMIN", "OWNER"] } },
    select: { userId: true },
  });
  const adminIds = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== requesterId);
  const result: DispatchResult = { notified: 0, mailed: 0 };
  const removedTime = removedAt ? fmtDateTime(removedAt) : "";
  const content =
    `成员 ${requesterName} 申请恢复资料《${title}》。\n` +
    (removedTime ? `原移除时间：${removedTime}\n` : "") +
    (deadlineText ? `恢复窗口剩余：${deadlineText}\n` : "") +
    (message ? `申请说明：${message}\n` : "") +
    `请在「治理中心 → 移除记录」中审核并处理，恢复后该成员将收到通知。`;
  for (const uid of adminIds) {
    const r2 = await dispatchToUser(uid, { title: "🔔 收到资料恢复申请", content, link });
    result.notified += r2.notified;
    result.mailed += r2.mailed;
  }
  return result;
}

/**
 * 普通成员提交删除自己资料的申请 → 通知空间内全部管理员/所有者（站内消息）。
 * 管理员在「治理中心 → 删除申请」中审核：同意即正式移除并通知成员，驳回需填写意见。
 */
export async function notifyDeletionRequested(params: {
  workspaceId: string;
  documentId: string;
  title: string;
  requesterName: string;
  requesterId: string;
  reasonCode: string;
  reasonDetail?: string | null;
}): Promise<DispatchResult> {
  const { workspaceId, title, requesterName, requesterId, reasonCode, reasonDetail } = params;
  const link = `/workspace/${workspaceId}?tab=governance`;
  const detail = (reasonDetail || "").trim();
  const content =
    `成员 ${requesterName} 申请删除资料《${title}》。\n` +
    `删除原因：${reasonLabel(reasonCode)}${detail ? ` — ${detail}` : ""}\n` +
    `提交时间：${fmtDateTime(new Date())}\n` +
    `请在「治理中心 → 删除申请」中审核处理：同意后将正式移除并通知成员，驳回请填写驳回意见。`;
  const admins = await prisma.workspacemember.findMany({
    where: { workspaceId, role: { in: ["ADMIN", "OWNER"] } },
    select: { userId: true },
  });
  const adminIds = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== requesterId);
  const result: DispatchResult = { notified: 0, mailed: 0 };
  for (const uid of adminIds) {
    const r2 = await dispatchToUser(uid, { title: "🔔 收到资料删除申请", content, link });
    result.notified += r2.notified;
    result.mailed += r2.mailed;
  }
  return result;
}

/**
 * 管理员驳回删除申请 → 通知申请人本人，并附驳回意见，明确告知资料不会被删除、仍保留可用。
 */
export async function notifyDeletionRejected(params: {
  workspaceId: string;
  documentId: string;
  title: string;
  requesterId: string;
  rejectReason: string;
}): Promise<DispatchResult> {
  const { workspaceId, title, requesterId, rejectReason } = params;
  const link = `/workspace/${workspaceId}?tab=assets`;
  const content =
    `您申请删除的资料《${title}》未通过管理员审核，删除申请已被驳回。\n` +
    `驳回意见：${rejectReason}\n` +
    `该资料仍保留在空间资料库中，可正常使用。`;
  return dispatchToUser(requesterId, { title: "⛔ 删除申请被驳回", content, link });
}

/**
 * 管理员/所有者对成员私密资料发起“治理说明/整改”要求。
 * 管理员只看到资料标题等元数据，不读取内容；通知上传人自行处理。
 */
export async function notifyPrivateReviewRequest(params: {
  workspaceId: string;
  documentId: string;
  title: string;
  uploaderId: string;
  requesterName: string;
  message: string;
}): Promise<DispatchResult> {
  const { workspaceId, title, uploaderId, requesterName, message } = params;
  const link = `/workspace/${workspaceId}?tab=assets`;
  const content =
    `空间治理人员 ${requesterName} 对您的个人私密资料《${title}》发起了处理要求。\n` +
    `要求说明：${message}\n\n` +
    `管理员不会直接查看您的私密内容。您可自行修改、删除该资料，或点击“申请公开”将资料提交管理员审核。`;
  return dispatchToUser(uploaderId, {
    title: "🔔 收到个人私密资料处理要求",
    content,
    link,
  });
}


