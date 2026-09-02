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
 * 确保用户的通知偏好记录存在，且仅首次注入默认欢迎通知。
 * 用 usernotification.defaultsSeeded 标记避免"删除全部后再次冒出默认通知"。
 */
async function ensureDefaultsSeeded(userId: string): Promise<void> {
  const prefs = await prisma.usernotification.upsert({
    where: { userId },
    update: {},
    create: {
      id: crypto.randomUUID(),
      userId,
      updatedAt: new Date(),
    },
  });

  if (prefs.defaultsSeeded) return;

  const now = Date.now();
  const defaults: {
    id: string;
    userId: string;
    title: string;
    content: string;
    type: string;
    isRead: boolean;
    createdAt: Date;
  }[] = [
    {
      id: crypto.randomUUID(),
      userId,
      title: "🎉 欢迎使用知阁舟坊工作台！",
      content: "系统已赠送您 100 点免费体验额度，您可以前往组件大厅挑选工具开始使用。",
      type: "system",
      isRead: false,
      createdAt: new Date(now - 3600 * 1000 * 2), // 2小时前
    },
    {
      id: crypto.randomUUID(),
      userId,
      title: "⚙️ 招标文件分析任务处理完成",
      content: "您提交的文件已分析完成，生成了完整的对比分析报告，您可以随时查看或导出下载报告。",
      type: "task",
      isRead: false,
      createdAt: new Date(now - 3600 * 1000 * 6), // 6小时前
    },
    {
      id: crypto.randomUUID(),
      userId,
      title: "🔐 账号安全防护已开启",
      content: "您的账号安全防护已初始化完成，所有上传的项目文档与资料均已妥善安全存储。",
      type: "security",
      isRead: true,
      createdAt: new Date(now - 3600 * 1000 * 24), // 1天前
    },
  ];

  await prisma.notification.createMany({ data: defaults });
  await prisma.usernotification.update({
    where: { userId },
    data: { defaultsSeeded: true },
  });
}

/**
 * 获取用户的通知列表（按时间倒序）
 */
export async function getNotifications(userId: string): Promise<NotificationRecord[]> {
  await ensureDefaultsSeeded(userId);
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
