import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";
import { grantPoints } from "@/lib/credit-service";

export const WORKSPACE_SUBMITTED_POSTS_KEY = "PLATFORM_WORKSPACE_SUBMITTED_POSTS_V1";

/** 岗位可见范围：个人使用（仅限当前企业空间内使用） / 共享给系统（进入平台官方标准库审核池） */
export type PostVisibility = "PRIVATE" | "SYSTEM";

/** 共享给系统且审核通过时，系统自动赠送给提报人的算力点数量 */
export const POST_SUBMISSION_REWARD_POINTS = 10;
/** 奖励有效期（毫秒）：一个月 */
export const POST_SUBMISSION_REWARD_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export interface SubmittedPostItem {
  id: string;
  workspacePostId: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon?: string;
  workspaceId: string;
  workspaceName: string;
  submittedByUserId: string;
  submittedByUserName?: string;
  /** 可见范围：PRIVATE=个人使用；SYSTEM=共享给系统（走审核，通过后赠算力点） */
  visibility: PostVisibility;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  adminNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** 共享奖励发放结果（仅 visibility=SYSTEM 且审核通过时产生） */
  rewardGranted?: boolean;
  rewardGrantId?: string;
  rewardExpiresAt?: string;
  rewardNotified?: boolean;
}

/**
 * 重复检测：系统是否已存在相同岗位。
 * - 平台官方标准岗位库（platformstandardpost，名称唯一，按小写归一比对）
 * - 已提交（PENDING / ACCEPTED）且尚未被拒绝的提报记录（按小写归一比对）
 * 命中即视为"系统已存在相同岗位"，应禁止重复提交。
 */
export async function checkDuplicatePost(name: string): Promise<{
  duplicate: boolean;
  reason?: string;
}> {
  const norm = name.trim().toLowerCase();
  if (!norm) return { duplicate: false };

  // 1. 平台官方标准岗位库
  const stdList = await prisma.platformstandardpost.findMany({
    where: { status: "ACTIVE" },
    select: { name: true },
  });
  const hitStd = stdList.find((s) => s.name.trim().toLowerCase() === norm);
  if (hitStd) {
    return { duplicate: true, reason: `平台官方标准库已存在同名岗位「${hitStd.name}」` };
  }

  // 2. 已提交且未驳回的提报（避免与正在审核 / 已采纳的同名岗位重复）
  const list = await getSubmittedPostsFromDB();
  const hitSub = list.find(
    (i) =>
      (i.status === "PENDING" || i.status === "ACCEPTED") &&
      i.name.trim().toLowerCase() === norm,
  );
  if (hitSub) {
    return {
      duplicate: true,
      reason:
        hitSub.status === "ACCEPTED"
          ? `同名岗位「${hitSub.name}」已在平台标准库`
          : `同名岗位「${hitSub.name}」已提交审核，请勿重复提报`,
    };
  }

  return { duplicate: false };
}

/**
 * 获取全平台企业空间提报的岗位列表
 */
export async function getSubmittedPostsFromDB(): Promise<SubmittedPostItem[]> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: WORKSPACE_SUBMITTED_POSTS_KEY },
    });

    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    return [];
  } catch (err) {
    console.error("读取企业空间提报岗位记录失败:", err);
    return [];
  }
}

/**
 * 保存/更新企业空间提报岗位列表
 */
export async function saveSubmittedPostsToDB(list: SubmittedPostItem[]): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: WORKSPACE_SUBMITTED_POSTS_KEY },
      create: {
        key: WORKSPACE_SUBMITTED_POSTS_KEY,
        value: JSON.stringify(list),
      },
      update: {
        value: JSON.stringify(list),
      },
    });
    return true;
  } catch (err) {
    console.error("保存企业空间提报岗位记录失败:", err);
    return false;
  }
}

/**
 * 提交空间岗位到平台官方库审核池
 */
export async function submitWorkspacePostToPlatform(submission: Omit<SubmittedPostItem, "id" | "status" | "createdAt" | "updatedAt">): Promise<SubmittedPostItem> {
  const currentList = await getSubmittedPostsFromDB();
  
  // 检查是否已经存在相同空间的该岗位提报
  const existingIndex = currentList.findIndex(
    (item) => item.workspaceId === submission.workspaceId && item.name.trim().toLowerCase() === submission.name.trim().toLowerCase()
  );

  const now = new Date().toISOString();
  const newItem: SubmittedPostItem = {
    ...submission,
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    currentList[existingIndex] = {
      ...currentList[existingIndex],
      ...submission,
      status: "PENDING",
      updatedAt: now,
    };
  } else {
    currentList.unshift(newItem);
  }

  await saveSubmittedPostsToDB(currentList);
  return newItem;
}

/**
 * 超级管理员审核提报岗位：
 * - ACCEPT: 接收为官方标准岗位，写入官方岗位集并向全网分发
 * - REJECT: 不接收，仅保留在提报空间内部继续使用
 * - EDIT: 超管微调提报岗位属性
 */
export async function reviewSubmittedPost(params: {
  submissionId: string;
  action: "ACCEPT" | "REJECT" | "EDIT";
  editData?: {
    name?: string;
    code?: string;
    description?: string;
    color?: string;
  };
  adminNote?: string;
}): Promise<{ success: boolean; message: string; data?: any }> {
  const list = await getSubmittedPostsFromDB();
  const itemIndex = list.findIndex((i) => i.id === params.submissionId);

  if (itemIndex === -1) {
    return { success: false, message: "未找到该提报记录" };
  }

  const item = list[itemIndex];
  const now = new Date().toISOString();

  if (params.action === "EDIT" && params.editData) {
    list[itemIndex] = {
      ...item,
      name: params.editData.name?.trim() || item.name,
      code: params.editData.code?.trim() || item.code,
      description: params.editData.description !== undefined ? params.editData.description : item.description,
      color: params.editData.color || item.color,
      adminNote: params.adminNote || item.adminNote,
      updatedAt: now,
    };
    await saveSubmittedPostsToDB(list);
    return { success: true, message: "提报岗位信息已更新", data: list[itemIndex] };
  }

  if (params.action === "REJECT") {
    const rejectReason = params.adminNote?.trim() || "管理员已审阅，该岗位作为企业内部专有岗位保留，未纳入全平台官方集";
    list[itemIndex] = {
      ...item,
      status: "REJECTED",
      adminNote: rejectReason,
      reviewedAt: now,
      updatedAt: now,
    };
    await saveSubmittedPostsToDB(list);

    // 站内消息通知提醒提报人
    if (item.submittedByUserId) {
      try {
        await addNotification(
          item.submittedByUserId,
          `📋 岗位提报审核反馈：【${item.name}】未纳入平台标准库`,
          `您在企业空间【${item.workspaceName || "企业空间"}】提报的新岗位【${item.name}】（代号: ${item.code}）未被纳入全平台官方标准库。审核意见：${rejectReason}。该岗位仍完整保留在您的企业空间内部继续使用，空间业务不受任何影响。`,
          "system",
          `/workspace/${item.workspaceId}?tab=permissions`
        );
      } catch (notifyErr) {
        console.error("发送岗位拒绝站内通知异常:", notifyErr);
      }
    }

    return {
      success: true,
      message: `已反馈不接收意见并向提报人发送消息提醒，岗位【${item.name}】仅保留在原来的企业空间继续使用`,
      data: list[itemIndex],
    };
  }

  if (params.action === "ACCEPT") {
    // 1. 标记提报为 ACCEPTED
    list[itemIndex] = {
      ...item,
      status: "ACCEPTED",
      adminNote: params.adminNote || "管理员已审核通过并接收为平台官方标准岗位",
      reviewedAt: now,
      updatedAt: now,
    };
    await saveSubmittedPostsToDB(list);

    // 2. 将岗位写入官方标准岗位集（platformstandardpost 数据表）
    const nameTrim = item.name.trim();
    const codeUpper = (item.code || "").trim().toUpperCase();

    const existingStd = await prisma.platformstandardpost.findFirst({
      where: {
        OR: [{ name: nameTrim }, ...(codeUpper ? [{ code: codeUpper }] : [])],
      },
    });

    let savedStd;
    if (existingStd) {
      // 若已有同名，更新并激活
      savedStd = await prisma.platformstandardpost.update({
        where: { id: existingStd.id },
        data: {
          description: item.description || existingStd.description,
          status: "ACTIVE",
        },
      });
    } else {
      savedStd = await prisma.platformstandardpost.create({
        data: {
          id: `std_post_from_${item.workspaceId.substring(0, 6)}_${Date.now()}`,
          name: nameTrim,
          code: codeUpper || `POST_${Date.now()}`,
          description: item.description || "",
          color: item.color || "#3182ce",
          icon: item.icon && /^[A-Z][A-Za-z0-9]*$/.test(item.icon) ? item.icon : "UserRound",
          status: "ACTIVE",
          sortOrder: (await prisma.platformstandardpost.count()) + 1,
          isWorkspaceDefault: false,
          isSystemReserved: false,
        },
      });
    }

    // 3. 共享奖励：仅当提报可见范围为"共享给系统"且审核通过时，系统自动赠送算力点
    let rewardInfo: { granted: boolean; points: number; expiresAt?: string; grantId?: string } | null = null;
    if (item.visibility === "SYSTEM" && item.submittedByUserId) {
      try {
        const rewardExpiresAt = new Date(Date.now() + POST_SUBMISSION_REWARD_VALIDITY_MS);
        const grant = await grantPoints({
          scope: "PERSONAL_GIFT",
          userId: item.submittedByUserId,
          workspaceId: item.workspaceId,
          points: POST_SUBMISSION_REWARD_POINTS,
          sourceType: "GIFT_BONUS",
          type: "GIFT_BONUS",
          title: `岗位共享奖励 ${POST_SUBMISSION_REWARD_POINTS} 算力点（岗位【${item.name}】被平台采纳）`,
          expiresAt: rewardExpiresAt,
          paymentMethod: "SYSTEM",
          idempotencyKey: `POST_SUBMISSION_REWARD:${item.id}`,
          remark: `您共享的岗位【${item.name}】经审核纳入平台官方标准库，系统赠送 ${POST_SUBMISSION_REWARD_POINTS} 算力点；有效期至 ${rewardExpiresAt.toLocaleDateString("zh-CN")}，到期未用完将自动清零。`,
        });
        rewardInfo = {
          granted: !grant.skipped,
          points: POST_SUBMISSION_REWARD_POINTS,
          expiresAt: rewardExpiresAt.toISOString(),
          grantId: grant.grantId,
        };
        // 将奖励发放结果写回提报记录，便于后续追溯与去重
        list[itemIndex] = {
          ...list[itemIndex],
          rewardGranted: !grant.skipped,
          rewardGrantId: grant.grantId,
          rewardExpiresAt: rewardExpiresAt.toISOString(),
          rewardNotified: !grant.skipped,
        };
        await saveSubmittedPostsToDB(list);
      } catch (rewardErr) {
        console.error("岗位共享奖励发放失败:", rewardErr);
      }
    }

    // 4. 站内消息通知提醒提报人（审核通过 + 共享奖励到账）
    if (item.submittedByUserId) {
      try {
        const rewardSentence = rewardInfo?.granted
          ? `，并因共享至系统额外获得 ${POST_SUBMISSION_REWARD_POINTS} 算力点奖励（有效期至 ${new Date(rewardInfo.expiresAt!).toLocaleDateString("zh-CN")}，到期未用完自动清零）`
          : "";
        await addNotification(
          item.submittedByUserId,
          `🎉 岗位提报审核通过：【${item.name}】已正式纳入平台官方标准库`,
          `恭喜！您在企业空间【${item.workspaceName || "企业空间"}】提报的新岗位【${item.name}】（代号: ${item.code}）已通过超级管理员审核！现已正式晋升为全平台官方标准岗位，全网所有企业空间均可直接装配引入${rewardSentence}。`,
          "system",
          `/workspace/${item.workspaceId}?tab=permissions`
        );
        // 奖励到账单独提醒（与审核通过区分，明确告知有效期与到期清零规则）
        if (rewardInfo?.granted) {
          await addNotification(
            item.submittedByUserId,
            `🎁 岗位共享奖励到账：${POST_SUBMISSION_REWARD_POINTS} 算力点`,
            `您共享的岗位【${item.name}】已通过审核被平台采纳，系统已向您赠送 ${POST_SUBMISSION_REWARD_POINTS} 个算力点，可在「我的算力点」中查看。该笔奖励有效期至 ${new Date(rewardInfo.expiresAt!).toLocaleDateString("zh-CN")}，到期前未用完将自动清零，请尽快使用。`,
            "system",
            `/user/points`
          );
        }
      } catch (notifyErr) {
        console.error("发送岗位接收站内通知异常:", notifyErr);
      }
    }

    return {
      success: true,
      message: `已成功接收岗位【${item.name}】并纳入系统官方标准库，已向提报人发送消息通知！${
        rewardInfo?.granted ? `并赠送 ${POST_SUBMISSION_REWARD_POINTS} 算力点奖励。` : ""
      }`,
      data: { ...savedStd, reward: rewardInfo },
    };
  }

  return { success: false, message: "未知操作指令" };
}

/**
 * 获取某用户本人提交的全部岗位提报（仅返回 submittedByUserId 命中的记录，按本人隔离）
 */
export async function getUserSubmissions(userId: string): Promise<SubmittedPostItem[]> {
  const list = await getSubmittedPostsFromDB();
  return list
    .filter((i) => i.submittedByUserId === userId)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/**
 * 用户撤回（仅 PENDING 可撤回，撤回后状态置为 WITHDRAWN，退出审核池）
 */
export async function withdrawSubmission(submissionId: string, userId: string): Promise<{ success: boolean; message: string }> {
  const list = await getSubmittedPostsFromDB();
  const idx = list.findIndex((i) => i.id === submissionId);
  if (idx === -1) return { success: false, message: "未找到该提报记录" };
  const item = list[idx];
  if (item.submittedByUserId !== userId) return { success: false, message: "无权操作他人提报" };
  if (item.status !== "PENDING") return { success: false, message: "仅待审核状态的提报可撤回" };

  list[idx] = { ...item, status: "WITHDRAWN", updatedAt: new Date().toISOString() };
  await saveSubmittedPostsToDB(list);
  return { success: true, message: "已撤回提报，退出审核池" };
}

/**
 * 用户重新提交（仅 REJECTED / WITHDRAWN 可重提，复用原记录并翻回 PENDING）
 * 注意：被拒记录不计入 checkDuplicatePost 的重复判定，因此重提同名岗位不会被拦。
 */
export async function resubmitSubmission(submissionId: string, userId: string): Promise<{ success: boolean; message: string }> {
  const list = await getSubmittedPostsFromDB();
  const idx = list.findIndex((i) => i.id === submissionId);
  if (idx === -1) return { success: false, message: "未找到该提报记录" };
  const item = list[idx];
  if (item.submittedByUserId !== userId) return { success: false, message: "无权操作他人提报" };
  if (item.status !== "REJECTED" && item.status !== "WITHDRAWN") {
    return { success: false, message: "仅被驳回或已撤回的提报可重新提交" };
  }

  // 复用 submitWorkspacePostToPlatform：按 workspaceId+name 命中已有记录并翻回 PENDING
  await submitWorkspacePostToPlatform({
    workspacePostId: item.workspacePostId,
    name: item.name,
    code: item.code,
    description: item.description,
    color: item.color,
    icon: item.icon,
    workspaceId: item.workspaceId,
    workspaceName: item.workspaceName,
    submittedByUserId: item.submittedByUserId,
    submittedByUserName: item.submittedByUserName,
    visibility: item.visibility,
  });

  // 重新提交回执通知
  try {
    await addNotification(
      item.submittedByUserId,
      `📨 岗位提报已重新提交：【${item.name}】等待超级管理员审核`,
      `您在企业空间【${item.workspaceName || "企业空间"}】重新提报的岗位【${item.name}】（代号: ${item.code}）已再次提交至平台官方标准库审核池，审核结果将以站内消息通知您。`,
      "system",
      `/workspace/${item.workspaceId}?tab=permissions`
    );
  } catch (notifyErr) {
    console.error("发送岗位重新提交通知异常:", notifyErr);
  }

  return { success: true, message: "已重新提交，等待审核" };
}

/**
 * 用户删除提报记录（仅 REJECTED / WITHDRAWN 可删除，已通过/待审核不允许删除）
 */
export async function deleteSubmission(submissionId: string, userId: string): Promise<{ success: boolean; message: string }> {
  const list = await getSubmittedPostsFromDB();
  const idx = list.findIndex((i) => i.id === submissionId);
  if (idx === -1) return { success: false, message: "未找到该提报记录" };
  const item = list[idx];
  if (item.submittedByUserId !== userId) return { success: false, message: "无权操作他人提报" };
  if (item.status !== "REJECTED" && item.status !== "WITHDRAWN") {
    return { success: false, message: "仅已驳回或已撤回的提报可删除记录" };
  }

  const newList = list.filter((i) => i.id !== submissionId);
  await saveSubmittedPostsToDB(newList);
  return { success: true, message: "提报记录已删除" };
}

/**
 * 管理员批量删除提报记录（仅允许删除已完成审核的记录：已接收 ACCEPTED / 已拒绝 REJECTED）。
 * 待审核 PENDING 与用户撤回 WITHDRAWN 不参与删除，返回实际删除条数。
 */
export async function adminDeleteSubmissions(ids: string[]): Promise<{ success: boolean; deleted: number; message: string }> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, deleted: 0, message: "未提供待删除记录" };
  }
  const list = await getSubmittedPostsFromDB();
  const idSet = new Set(ids);
  const deletableStatus = new Set(["ACCEPTED", "REJECTED"]);
  const newList = list.filter((i) => !(idSet.has(i.id) && deletableStatus.has(i.status)));
  const deleted = list.length - newList.length;
  await saveSubmittedPostsToDB(newList);
  return { success: true, deleted, message: `已删除 ${deleted} 条提报记录` };
}
