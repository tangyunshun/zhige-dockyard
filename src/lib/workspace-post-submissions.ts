import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

export const WORKSPACE_SUBMITTED_POSTS_KEY = "PLATFORM_WORKSPACE_SUBMITTED_POSTS_V1";

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
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  adminNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
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
 * - REJECT: 不接收，仅保留提报空间内部自治使用
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
          `您在企业空间【${item.workspaceName || "企业空间"}】提报的新岗位【${item.name}】（代号: ${item.code}）未被纳入全平台官方标准库。审核意见：${rejectReason}。该岗位仍完整保留在您的企业空间内部自治使用，空间业务不受任何影响。`,
          "system",
          `/workspace/${item.workspaceId}?tab=permissions`
        );
      } catch (notifyErr) {
        console.error("发送岗位拒绝站内通知异常:", notifyErr);
      }
    }

    return {
      success: true,
      message: `已反馈不接收意见并向提报人发送消息提醒，岗位【${item.name}】仅保留在空间内部自治使用`,
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

    // 3. 站内消息通知提醒提报人
    if (item.submittedByUserId) {
      try {
        await addNotification(
          item.submittedByUserId,
          `🎉 岗位提报审核通过：【${item.name}】已正式纳入平台官方标准库`,
          `恭喜！您在企业空间【${item.workspaceName || "企业空间"}】提报的新岗位【${item.name}】（代号: ${item.code}）已通过超级管理员审核！现已正式晋升为全平台官方标准岗位，全网所有企业空间均可直接装配引入。`,
          "system",
          `/workspace/${item.workspaceId}?tab=permissions`
        );
      } catch (notifyErr) {
        console.error("发送岗位接收站内通知异常:", notifyErr);
      }
    }

    return {
      success: true,
      message: `已成功接收岗位【${item.name}】并纳入系统官方标准库，已向提报人发送消息通知！`,
      data: savedStd,
    };
  }

  return { success: false, message: "未知操作指令" };
}
