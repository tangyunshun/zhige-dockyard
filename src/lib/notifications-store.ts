/**
 * 用户系统通知持久化中心（基于数据库 notification 表）
 * 支持登录用户获取消息列表、标记已读、全部已读、删除、清空已读以及生成通知
 * 数据落库存储，服务重启不丢失
 */

import { prisma } from "@/lib/prisma";

export interface NotificationRecord {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  type: string;
  createdAt: number; // 毫秒时间戳，兼容前端现有展示
  link?: string | null;
}

function toRecord(n: {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  type: string;
  link: string | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    isRead: n.isRead,
    type: n.type,
    link: n.link,
    createdAt: new Date(n.createdAt).getTime(),
  };
}

/**
 * 首次注册/登录时为新用户注入默认欢迎通知。
 * 基于 usernotification.defaultsSeeded 严格幂等：已初始化用户不再注入。
 */
export async function seedDefaultWelcomeNotifications(userId: string): Promise<void> {
  const prefs = await prisma.usernotification.findUnique({
    where: { userId },
  });
  if (prefs?.defaultsSeeded) return;

  // 平滑兼容历史旧文案：若库中存在“100 点免费体验额度”，自动修正为标准文案
  await prisma.notification.updateMany({
    where: {
      userId,
      content: { contains: "100 点免费体验额度" },
    },
    data: {
      content: "系统已赠送您 100 算力点免费组件体验额度，您可以前往组件大厅挑选工具开始使用。",
    },
  }).catch(() => {});

  const now = Date.now();
  const defaults = [
    {
      id: crypto.randomUUID(),
      userId,
      title: "🎉 欢迎使用知阁舟坊工作台！",
      content: "系统已赠送您 100 算力点免费组件体验额度，您可以前往组件大厅挑选工具开始使用。",
      type: "system",
      isRead: false,
      createdAt: new Date(now - 1000 * 60 * 2), // 2分钟前
    },
    {
      id: crypto.randomUUID(),
      userId,
      title: "🔐 账号安全防护已开启",
      content: "您的账号安全防护已初始化完成，所有上传的项目文档与资料均已妥善安全存储。",
      type: "security",
      isRead: false,
      createdAt: new Date(now - 1000 * 60 * 5), // 5分钟前
    },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.notification.createMany({ data: defaults });
    await tx.usernotification.upsert({
      where: { userId },
      update: { defaultsSeeded: true },
      create: {
        id: crypto.randomUUID(),
        userId,
        defaultsSeeded: true,
        updatedAt: new Date(),
      },
    });
  });
}

/**
 * 获取用户的通知列表（按时间倒序）
 */
export async function getNotifications(userId: string): Promise<NotificationRecord[]> {
  // 自动清理历史上因默认注入而遗留的未发生真实业务操作的“招标文件分析”虚假通知
  await prisma.notification.deleteMany({
    where: {
      userId,
      title: "⚙️ 招标文件分析任务处理完成",
    },
  }).catch(() => {});

  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return list.map(toRecord);
}

/**
 * 标记单条通知为已读
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<NotificationRecord[]> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return getNotifications(userId);
}

/**
 * 标记所有通知为已读
 */
export async function markAllNotificationsAsRead(userId: string): Promise<NotificationRecord[]> {
  await prisma.notification.updateMany({
    where: { userId },
    data: { isRead: true },
  });
  return getNotifications(userId);
}

/**
 * 删除单条通知
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<NotificationRecord[]> {
  await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
  return getNotifications(userId);
}

/**
 * 清空所有已读通知（保留未读）
 */
export async function clearReadNotifications(userId: string): Promise<NotificationRecord[]> {
  await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  });
  return getNotifications(userId);
}

/**
 * 触发/生成一条新的系统通知
 */
export async function addNotification(
  userId: string,
  title: string,
  content: string,
  type: string = "system",
  link?: string | null
): Promise<NotificationRecord> {
  const record = await prisma.notification.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      title,
      content,
      type,
      link: link || null,
    },
  });
  return toRecord(record);
}
