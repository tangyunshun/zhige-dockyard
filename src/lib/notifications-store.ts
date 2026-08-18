/**
 * 用户系统通知内存持久化中心（模拟 Redis / 数据库）
 * 支持登录用户获取消息列表、标记已读、全部已读以及模拟触发通知
 */

export interface NotificationRecord {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  type: "system" | "task" | "security";
  createdAt: number;
}

// 确保热重载时数据不丢失
const globalForNotifications = globalThis as unknown as {
  notificationStore: Map<string, NotificationRecord[]>;
};

const notificationStore = globalForNotifications.notificationStore || new Map<string, NotificationRecord[]>();

if (!globalForNotifications.notificationStore) {
  globalForNotifications.notificationStore = notificationStore;
}

/**
 * 初始化用户的系统默认通知（模拟业务带入）
 */
function initDefaultNotifications(userId: string): NotificationRecord[] {
  const defaults: NotificationRecord[] = [
    {
      id: `notify-init-1-${userId}`,
      title: "🎉 欢迎体验知阁舟坊工作台！",
      content: "系统已自动为您的个人空间注入 100 点免费组件调用额度。您可以前往组件大厅挑选装配高阶组件。",
      isRead: false,
      type: "system",
      createdAt: Date.now() - 3600 * 1000 * 2, // 2小时前
    },
    {
      id: `notify-init-2-${userId}`,
      title: "⚙️ 标书自动偏离度分析任务执行成功",
      content: "您提交的招标文件已在沙箱中通过智能审计组件分析完毕，共甄别出 3 项苛刻法偏离条款。可点击右侧结果中心导出 Markdown 报告。",
      isRead: false,
      type: "task",
      createdAt: Date.now() - 3600 * 1000 * 6, // 6小时前
    },
    {
      id: `notify-init-3-${userId}`,
      title: "🔐 企业安全隔离网关初始化成功",
      content: "您所关联的所有项目资产及业务材料均已由 AES-256 底层加密算法妥善加锁物理隔离，安全级别：AAA。",
      isRead: true,
      type: "security",
      createdAt: Date.now() - 3600 * 1000 * 24, // 1天前
    }
  ];
  notificationStore.set(userId, defaults);
  return defaults;
}

/**
 * 获取用户的通知列表
 */
export function getNotifications(userId: string): NotificationRecord[] {
  let list = notificationStore.get(userId);
  if (!list) {
    list = initDefaultNotifications(userId);
  }
  return list;
}

/**
 * 标记单条通知为已读
 */
export function markNotificationAsRead(userId: string, notificationId: string): NotificationRecord[] {
  const list = getNotifications(userId);
  const updated = list.map(item => {
    if (item.id === notificationId) {
      return { ...item, isRead: true };
    }
    return item;
  });
  notificationStore.set(userId, updated);
  return updated;
}

/**
 * 标记所有通知为已读
 */
export function markAllNotificationsAsRead(userId: string): NotificationRecord[] {
  const list = getNotifications(userId);
  const updated = list.map(item => ({ ...item, isRead: true }));
  notificationStore.set(userId, updated);
  return updated;
}

/**
 * 触发/生成一条新的系统通知
 */
export function addNotification(
  userId: string,
  title: string,
  content: string,
  type: "system" | "task" | "security" = "system"
): NotificationRecord {
  const list = getNotifications(userId);
  const newNotify: NotificationRecord = {
    id: `notify-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title,
    content,
    isRead: false,
    type,
    createdAt: Date.now()
  };
  notificationStore.set(userId, [newNotify, ...list]);
  return newNotify;
}
