"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Radio,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Save,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Tag,
  X,
  History,
  Check,
  Edit3,
  Sliders,
  BellRing,
  User,
  Server,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

// 维护计划类型定义
interface MaintenanceSchedule {
  id: string;
  title: string;
  type: "UPGRADE" | "DATABASE" | "HARDWARE" | "INSPECT";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  isDowntime?: boolean;
  startTime: string;
  endTime: string;
  manager: string;
  scope: string;
  description: string;
  actualResult?: string;
}

// 发版更新日志类型定义
interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  type: "FEATURE" | "OPTIMIZE" | "BUGFIX" | "SECURITY";
  publishDate: string;
  isPublished: boolean;
  author: string;
  items: string[];
}

// 系统发版与全局更新控制策略接口定义
interface SystemUpdateSettings {
  autoCheckUpdate: boolean;
  notifyModalEnabled: boolean;
  forceUpdate: boolean;
  minSupportedVersion: string;
  releaseChannel: "STABLE" | "BETA";
  customDownloadUrl: string;
  popupTitle: string;
}

// 快捷预设维护说明模板（使用普通直白的描述，拒绝AI黑话）
const PRESET_TEMPLATES = [
  {
    title: "例行系统升级",
    content: "系统正在进行例行版本升级与功能优化，预计维护 30 分钟。维护期间将暂停访问，感谢您的理解与支持。",
    est: "30",
  },
  {
    title: "数据库维护与优化",
    content: "系统正在对核心数据库进行常规归档与维护优化，预计维护 1 小时。数据已完成全量备份，稍后即可恢复正常使用。",
    est: "60",
  },
  {
    title: "临时故障排查",
    content: "技术人员正在对系统服务进行临时排查与检修，预计很快恢复正常，请稍后重新访问。",
    est: "15",
  },
];

export default function MaintenancePage() {
  const router = useRouter();
  const toast = useToast();

  // 当前激活的选项卡
  const [activeTab, setActiveTab] = useState<"switch" | "schedules" | "releases">("switch");

  // 基础状态
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");
  const [currentVersion, setCurrentVersion] = useState("");

  // 数据列表（100% 数据库持久化）
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [releases, setReleases] = useState<ReleaseNote[]>([]);

  // 弹窗表单状态：登记维护计划
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    type: "UPGRADE" as MaintenanceSchedule["type"],
    isDowntime: true,
    startTime: "",
    endTime: "",
    manager: "",
    scope: "全站系统服务",
    description: "",
  });

  // 弹窗表单状态：发布新版本记录
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseForm, setReleaseForm] = useState({
    version: "",
    title: "",
    type: "FEATURE" as ReleaseNote["type"],
    publishDate: new Date().toISOString().split("T")[0],
    isPublished: true,
    author: "",
    itemsText: "",
  });

  // 系统发版与更新策略全局设置
  const [updateSettings, setUpdateSettings] = useState<SystemUpdateSettings>({
    autoCheckUpdate: true,
    notifyModalEnabled: true,
    forceUpdate: false,
    minSupportedVersion: "v1.0.0",
    releaseChannel: "STABLE",
    customDownloadUrl: "",
    popupTitle: "知阁·舟坊新版本发布公告",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);

  // 选中的维护任务详情（用于查看详情模态框）
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<MaintenanceSchedule | null>(null);

  // 分页控制（用户指令要求：每页显示五条数据，支持分页）
  const PAGE_SIZE = 5;
  const [schedulePage, setSchedulePage] = useState(1);
  const [releasePage, setReleasePage] = useState(1);

  const totalSchedulePages = Math.max(1, Math.ceil(schedules.length / PAGE_SIZE));
  const currentSchedulePage = Math.min(schedulePage, totalSchedulePages);
  const paginatedSchedules = schedules.slice(
    (currentSchedulePage - 1) * PAGE_SIZE,
    currentSchedulePage * PAGE_SIZE
  );

  const totalReleasePages = Math.max(1, Math.ceil(releases.length / PAGE_SIZE));
  const currentReleasePage = Math.min(releasePage, totalReleasePages);
  const paginatedReleases = releases.slice(
    (currentReleasePage - 1) * PAGE_SIZE,
    currentReleasePage * PAGE_SIZE
  );

  // 全局统一确认框
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 从数据库加载完整系统维护、计划与发版数据
  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/system/maintenance", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(Boolean(data.maintenanceMode));
        setMaintenanceMessage(data.maintenanceMessage || "系统正在维护升级中，预计稍后恢复，请耐心等待。");
        setEstimatedMinutes(data.estimatedMinutes || "30");
        setCurrentTime(data.currentTime || new Date().toISOString());
        setCurrentVersion(data.currentVersion || "v1.0.0");
        setSchedules(data.schedules || []);
        setReleases(data.releases || []);
        if (data.updateSettings) {
          setUpdateSettings(data.updateSettings);
        }
      } else {
        toast.error("获取系统维护状态失败");
      }
    } catch {
      toast.error("网络异常，无法连接系统维护接口");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. 切换停机维护模式
  const handleToggleMaintenance = (targetMode: boolean) => {
    setConfirmDialog({
      isOpen: true,
      type: targetMode ? "danger" : "info",
      title: targetMode ? "确认开启系统停机维护？" : "确认解除停机维护状态？",
      message: targetMode
        ? "开启后，系统将暂停对普通用户的对外服务，并自动退出普通用户的登录状态。前台将展示维护提示说明。管理员可正常登录管理后台。确认立即开启吗？"
        : "解除后，全站所有前台功能与用户登录将恢复正常。确认立即解除并恢复服务吗？",
      onConfirm: async () => {
        try {
          setSaving(true);
          const authToken = getAuthToken();
          const res = await fetch("/api/system/maintenance", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              enabled: targetMode,
              message: maintenanceMessage.trim(),
              estimatedMinutes,
            }),
          });

          if (res.ok) {
            setMaintenanceMode(targetMode);
            toast.success(
              targetMode
                ? "系统维护模式已开启，普通用户访问已被拦截"
                : "系统维护已结束，已恢复对外正常服务"
            );
            loadData();
          } else {
            const errData = await res.json().catch(() => ({}));
            toast.error(errData.error || "操作失败，请检查管理员权限");
          }
        } catch {
          toast.error("请求失败，请稍后重试");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // 2. 保存维护公告文案
  const handleSaveMessage = async () => {
    if (!maintenanceMessage.trim()) {
      toast.warning("维护公告说明不能为空");
      return;
    }
    try {
      setSaving(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          enabled: maintenanceMode,
          message: maintenanceMessage.trim(),
          estimatedMinutes,
        }),
      });
      if (res.ok) {
        toast.success("维护公告说明已成功保存到数据库");
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "保存失败");
      }
    } catch {
      toast.error("保存公告发生异常");
    } finally {
      setSaving(false);
    }
  };

  const TIME_TEXT_MAP: Record<string, string> = {
    "15": "15 分钟",
    "30": "30 分钟",
    "60": "1 小时",
    "120": "2 小时",
    "240": "4 小时",
  };

  // 耗时下拉框与正文内容智能双向联动
  const handleEstimatedMinutesChange = (newEst: string) => {
    setEstimatedMinutes(newEst);
    const newTimeText = TIME_TEXT_MAP[newEst] || `${newEst} 分钟`;
    const regex = /(预计维护\s*)([0-9一二三四两半]+(\s*(分钟|小时|分|h))?)/g;
    if (maintenanceMessage.match(regex)) {
      setMaintenanceMessage(maintenanceMessage.replace(regex, `$1${newTimeText}`));
    } else if (maintenanceMessage.includes("预计")) {
      const generalRegex = /(预计\s*)([0-9一二三四两半]+(\s*(分钟|小时|分|h))?)/g;
      setMaintenanceMessage(maintenanceMessage.replace(generalRegex, `$1维护 ${newTimeText}`));
    }
  };

  const handleMaintenanceMessageChange = (newMsg: string) => {
    setMaintenanceMessage(newMsg);
    if (newMsg.includes("15 分钟") || newMsg.includes("15分钟")) {
      setEstimatedMinutes("15");
    } else if (newMsg.includes("30 分钟") || newMsg.includes("30分钟")) {
      setEstimatedMinutes("30");
    } else if (
      newMsg.includes("1 小时") ||
      newMsg.includes("1小时") ||
      newMsg.includes("60分钟") ||
      newMsg.includes("60 分钟")
    ) {
      setEstimatedMinutes("60");
    } else if (newMsg.includes("2 小时") || newMsg.includes("2小时") || newMsg.includes("120分钟")) {
      setEstimatedMinutes("120");
    } else if (newMsg.includes("4 小时") || newMsg.includes("4小时") || newMsg.includes("240分钟")) {
      setEstimatedMinutes("240");
    }
  };

  // 维护类型与影响范围智能联动映射表
  const TYPE_SCOPE_MAP: Record<MaintenanceSchedule["type"], string> = {
    UPGRADE: "全站系统服务及所有业务模块",
    DATABASE: "核心生产数据库集群与数据读写服务",
    HARDWARE: "机房核心网络设备、网关与外部通信通道",
    INSPECT: "全平台例行系统深度健康巡检（业务不中断）",
  };

  // 本地日期时间转 input datetime-local 格式 (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // 打开登记维护任务弹窗（智能联动默认时间与影响范围）
  const handleOpenScheduleModal = () => {
    const now = new Date();
    // 默认开始时间预设为下一个小时整点
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const startStr = formatDateTimeLocal(now);
    // 默认结束时间预设为开始后 1 小时
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const endStr = formatDateTimeLocal(end);

    setScheduleForm({
      title: "",
      type: "UPGRADE",
      startTime: startStr,
      endTime: endStr,
      manager: "",
      scope: TYPE_SCOPE_MAP.UPGRADE,
      description: "",
    });
    setShowScheduleModal(true);
  };

  // 维护类型改变时，自动联动建议影响范围与是否需要停服
  const handleScheduleTypeChange = (newType: MaintenanceSchedule["type"]) => {
    setScheduleForm((prev) => ({
      ...prev,
      type: newType,
      scope: TYPE_SCOPE_MAP[newType] || prev.scope,
      isDowntime: newType === "UPGRADE" || newType === "DATABASE",
    }));
  };

  // 智能计算推荐的下一个版本号（支持语义化版本号 +0.0.1 递增）
  const computeNextVersion = (base: string, mode: "patch" | "minor" | "major" = "patch"): string => {
    const match = (base || "v1.0.0").match(/^v?(\d+)\.(\d+)\.(\d+)(.*)$/);
    if (!match) return "v1.0.1";
    let major = parseInt(match[1], 10);
    let minor = parseInt(match[2], 10);
    let patch = parseInt(match[3], 10);
    if (mode === "patch") patch += 1;
    else if (mode === "minor") {
      minor += 1;
      patch = 0;
    } else if (mode === "major") {
      major += 1;
      minor = 0;
      patch = 0;
    }
    return `v${major}.${minor}.${patch}`;
  };

  // 打开发布版本弹窗（自动在当前基准版本上升级一个，如从 v1.0.0 默认推荐 v1.0.1）
  const handleOpenReleaseModal = () => {
    setEditingReleaseId(null);
    const nextVer = computeNextVersion(currentVersion || "v1.0.0", "patch");
    setReleaseForm({
      version: nextVer,
      title: "",
      type: "FEATURE",
      publishDate: new Date().toISOString().split("T")[0],
      isPublished: true,
      author: "",
      itemsText: "",
    });
    setShowReleaseModal(true);
  };

  // 打开编辑已有发版记录弹窗
  const handleOpenEditReleaseModal = (rel: ReleaseNote) => {
    setEditingReleaseId(rel.id);
    setReleaseForm({
      version: rel.version,
      title: rel.title,
      type: rel.type,
      publishDate: rel.publishDate,
      isPublished: rel.isPublished,
      author: rel.author,
      itemsText: Array.isArray(rel.items) ? rel.items.join("\n") : "",
    });
    setShowReleaseModal(true);
  };

  // 3. 应用预设普通模版
  const applyPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setMaintenanceMessage(preset.content);
    setEstimatedMinutes(preset.est);
    toast.success(`已载入「${preset.title}」说明`);
  };

  // 4. 提交新增维护计划
  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.title.trim()) {
      toast.error("请输入维护任务标题");
      return;
    }
    if (!scheduleForm.startTime.trim()) {
      toast.error("请设置维护开始时间");
      return;
    }
    try {
      setSaving(true);
      const authToken = getAuthToken();
      // 将 datetime-local 的 T 格式化为标准易读的空格分隔格式 (YYYY-MM-DD HH:mm)
      const cleanSchedule = {
        ...scheduleForm,
        startTime: scheduleForm.startTime.replace("T", " "),
        endTime: scheduleForm.endTime ? scheduleForm.endTime.replace("T", " ") : "待定",
      };
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "create_schedule",
          schedule: cleanSchedule,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("维护计划已成功登记并保存在数据库！");
        if (Array.isArray(data.schedules)) {
          setSchedules(data.schedules);
        }
        setShowScheduleModal(false);
        setScheduleForm({
          title: "",
          type: "UPGRADE",
          startTime: "",
          endTime: "",
          manager: "",
          scope: "全站系统服务",
          description: "",
          isDowntime: true,
        });
      } else {
        toast.error(data.error || "登记维护任务失败");
      }
    } catch {
      toast.error("提交异常，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  // 5. 变更维护计划状态（支持原子化联动切换全站停机维护电闸）
  const handleUpdateScheduleStatus = async (
    schedule: MaintenanceSchedule,
    newStatus: MaintenanceSchedule["status"],
    syncMaintenanceMode: boolean = false,
    actualResult?: string
  ) => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "update_schedule",
          syncMaintenanceMode,
          schedule: {
            ...schedule,
            status: newStatus,
            ...(actualResult !== undefined ? { actualResult } : {}),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          `维护任务已变更为「${getStatusLabel(newStatus)}」${
            syncMaintenanceMode
              ? newStatus === "IN_PROGRESS"
                ? "，已同步开启全站停机维护！"
                : "，已同步恢复全站对外访问！"
              : "并已持久化保存"
          }`
        );
        if (Array.isArray(data.schedules)) {
          setSchedules(data.schedules);
        }
        if (data.maintenanceMode !== undefined) {
          setMaintenanceMode(data.maintenanceMode);
        }
      } else {
        toast.error(data.error || "更新状态失败");
      }
    } catch {
      toast.error("修改维护状态发生异常");
    }
  };

  // 智能交互：开始执行维护任务（自动判定是否需要同步开启停服电闸）
  const handleStartSchedule = (schedule: MaintenanceSchedule) => {
    const isDowntime =
      schedule.isDowntime !== undefined
        ? schedule.isDowntime
        : schedule.type === "UPGRADE" || schedule.type === "DATABASE";

    setConfirmDialog({
      isOpen: true,
      type: isDowntime ? "danger" : "warning",
      title: isDowntime ? "开始执行停机维护任务" : "开始执行在线维护任务",
      message: isDowntime
        ? `任务【${schedule.title}】属于「全站停机维护」，影响范围：${schedule.scope || "全站系统服务"}。\n确认后将把任务置为维护中，并【同步开启系统停机维护模式】（前台立即全屏阻断），是否立即执行？`
        : `任务【${schedule.title}】属于「在线平滑维护」（不停服）。确认后将在前台挂载维护预警通知横幅，各业务模块继续开放。是否立即开始？`,
      onConfirm: async () => {
        await handleUpdateScheduleStatus(schedule, "IN_PROGRESS", isDowntime);
      },
    });
  };

  // 智能交互：完成维护任务（自动联动解除停服并恢复对外服务）
  const handleCompleteSchedule = (schedule: MaintenanceSchedule) => {
    const isDowntime =
      schedule.isDowntime !== undefined
        ? schedule.isDowntime
        : schedule.type === "UPGRADE" || schedule.type === "DATABASE";

    setConfirmDialog({
      isOpen: true,
      type: "info",
      title: "确认维护任务执行完毕",
      message: `维护任务【${schedule.title}】执行完毕。\n确认后将归档为已完成${
        isDowntime || maintenanceMode
          ? "，并【同步解除停机维护模式】恢复前台正常对外服务"
          : ""
      }，是否确认？`,
      onConfirm: async () => {
        await handleUpdateScheduleStatus(
          schedule,
          "COMPLETED",
          isDowntime || maintenanceMode,
          "各项升级操作执行完毕，系统自检验证正常"
        );
      },
    });
  };

  // 6. 删除维护计划
  const handleDeleteSchedule = (scheduleId: string, title: string) => {
    setConfirmDialog({
      isOpen: true,
      type: "danger",
      title: "删除维护计划记录",
      message: `确定要从数据库中删除维护任务「${title}」吗？删除后不可撤销。`,
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch("/api/system/maintenance", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              action: "delete_schedule",
              scheduleId,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("维护计划记录已从数据库删除");
            if (Array.isArray(data.schedules)) {
              setSchedules(data.schedules);
            }
          } else {
            toast.error(data.error || "删除失败");
          }
        } catch {
          toast.error("删除维护计划异常");
        }
      },
    });
  };

  // 7. 提交发版记录（支持新增与编辑修改双模）
  const handleCreateReleaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseForm.version.trim()) {
      toast.error("请输入版本号 (如 v2.4.1)");
      return;
    }
    if (!releaseForm.title.trim()) {
      toast.error("请输入版本标题说明");
      return;
    }
    const items = releaseForm.itemsText
      .split("\n")
      .map((it) => it.trim())
      .filter(Boolean);

    try {
      setSaving(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: editingReleaseId ? "update_release" : "create_release",
          release: {
            ...(editingReleaseId ? { id: editingReleaseId } : {}),
            version: releaseForm.version.trim(),
            title: releaseForm.title.trim(),
            type: releaseForm.type,
            publishDate: releaseForm.publishDate,
            isPublished: releaseForm.isPublished,
            author: releaseForm.author.trim() || "平台研发组",
            items: items.length > 0 ? items : [releaseForm.title.trim()],
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(editingReleaseId ? "发版记录已成功更新！" : "新版本发版记录已成功落库保存！");
        if (Array.isArray(data.releases)) {
          setReleases(data.releases);
        }
        setShowReleaseModal(false);
        setEditingReleaseId(null);
        setReleaseForm({
          version: "",
          title: "",
          type: "FEATURE",
          publishDate: new Date().toISOString().split("T")[0],
          isPublished: true,
          author: "",
          itemsText: "",
        });
      } else {
        toast.error(data.error || "保存发版记录失败");
      }
    } catch {
      toast.error("提交异常，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  // 保存系统版本与更新全局策略配置
  const handleSaveUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "save_update_settings",
          settings: updateSettings,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("系统版本与更新配置已成功更新并持久化到数据库！");
        if (data.updateSettings) {
          setUpdateSettings(data.updateSettings);
        }
      } else {
        toast.error(data.error || "保存更新设置失败");
      }
    } catch {
      toast.error("网络异常，保存更新配置失败");
    } finally {
      setSavingSettings(false);
    }
  };

  // 8. 切换版本公示状态
  const handleToggleReleasePublish = async (releaseId: string, currentStatus: boolean) => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "toggle_release_publish",
          releaseId,
          isPublished: !currentStatus,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(!currentStatus ? "该版本已设为全网公示" : "已隐藏该版本的前台公示");
        if (Array.isArray(data.releases)) {
          setReleases(data.releases);
        }
      } else {
        toast.error(data.error || "修改公示状态失败");
      }
    } catch {
      toast.error("网络异常");
    }
  };

  // 9. 删除发版记录
  const handleDeleteRelease = (releaseId: string, version: string) => {
    setConfirmDialog({
      isOpen: true,
      type: "danger",
      title: "删除发版记录",
      message: `确定要从数据库中删除版本「${version}」的发版记录吗？删除后将不再记录在发版履历中。`,
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch("/api/system/maintenance", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              action: "delete_release",
              releaseId,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("发版记录已删除");
            if (Array.isArray(data.releases)) {
              setReleases(data.releases);
            }
          } else {
            toast.error(data.error || "删除失败");
          }
        } catch {
          toast.error("删除发版记录失败");
        }
      },
    });
  };

  // 辅助函数：状态中文转换
  function getStatusLabel(status: MaintenanceSchedule["status"]) {
    switch (status) {
      case "SCHEDULED":
        return "待执行";
      case "IN_PROGRESS":
        return "维护中";
      case "COMPLETED":
        return "已完成";
      case "CANCELLED":
        return "已取消";
      default:
        return status;
    }
  }

  // 辅助函数：类型中文转换
  function getTypeLabel(type: MaintenanceSchedule["type"]) {
    switch (type) {
      case "UPGRADE":
        return "系统升级";
      case "DATABASE":
        return "数据库维护";
      case "HARDWARE":
        return "网络设备";
      case "INSPECT":
        return "例行检查";
      default:
        return type;
    }
  }

  // 辅助函数：发版类型标签
  function getReleaseTypeBadge(type: ReleaseNote["type"]) {
    switch (type) {
      case "FEATURE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">功能更新</span>;
      case "OPTIMIZE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">体验优化</span>;
      case "BUGFIX":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">缺陷修复</span>;
      case "SECURITY":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">安全加固</span>;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6 pb-12 font-sans text-left">
      {/* 顶部标头导航区（去AI黑话，普通清晰的业务描述） */}
      <div className="bg-white/90 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs transition-colors ${
                  maintenanceMode
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-[#3182ce]/10 text-[#3182ce]"
                }`}
              >
                <Wrench className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                系统维护与发版记录管理
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border select-none ${
                  maintenanceMode
                    ? "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                }`}
              >
                {maintenanceMode ? "● 停机维护生效中" : "● 正常对外开放中"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              管理系统停机维护开关、排期维护任务与发布版本更新说明。数据 100% 保存在数据库中，重启后依然生效。
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={loadData}
              disabled={loading}
              className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="重新从数据库读取"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loading ? "animate-spin text-[#3182ce]" : "text-slate-500"
                }`}
              />
              <span>重新加载</span>
            </button>
            <button
              onClick={() => router.push("/admin/settings")}
              className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>系统设置</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 大系统状态指标指示卡（普通工程语言描述） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">当前运行状态</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                maintenanceMode ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-black mt-2 tracking-tight ${
              maintenanceMode ? "text-amber-600" : "text-slate-800"
            }`}
          >
            {loading ? "—" : maintenanceMode ? "停机维护中" : "正常运行中"}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            {maintenanceMode ? "普通用户已被统一拦截" : "所有前台业务正常访问"}
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">管理员权限</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3182ce] mt-2 tracking-tight">
            正常通行
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            管理员不受维护影响，可正常登录后台
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">普通用户登录控制</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2 tracking-tight">
            维护时强制退出
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            开启维护时自动清退非管理员在线会话
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">生产当前版本</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-2 tracking-tight">
            {currentVersion}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1 truncate" title={currentTime}>
            数据库同步于 {currentTime ? new Date(currentTime).toLocaleTimeString("zh-CN") : "刚刚"}
          </div>
        </div>
      </div>

      {/* 3 大核心业务板块选项卡切换（实现真正闭环） */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("switch")}
          className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "switch"
              ? "bg-[#3182ce] text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>全站维护开关与公告说明</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedules")}
          className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "schedules"
              ? "bg-[#3182ce] text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>计划中的维护任务 ({schedules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("releases")}
          className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "releases"
              ? "bg-[#3182ce] text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>系统发版记录与更新日志 ({releases.length})</span>
        </button>
      </div>

      {/* 板块 1：维护开关与说明公告 */}
      {activeTab === "switch" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in-50">
          {/* 左侧：停机维护开关与预设模版 (5 栅格) */}
          <div className="lg:col-span-5 bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#3182ce]" />
                全站维护模式切换
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                切换平台运行模式。操作需要管理员二次确认并记录在操作审计日志中。
              </p>
            </div>

            {/* 状态指示框 */}
            <div
              className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
                maintenanceMode
                  ? "bg-amber-50/70 border-amber-200"
                  : "bg-emerald-50/70 border-emerald-200"
              }`}
            >
              <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>运行状态</span>
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-black ${
                    maintenanceMode
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {maintenanceMode ? "正在停机维护" : "正常生产运行"}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {maintenanceMode
                  ? "当前系统处于维护状态。普通用户访问将被引导至维护提示页，仅管理员可登录并操作后台。"
                  : "当前系统运行平稳，所有前台功能正常对外开放。"}
              </p>
            </div>

            {/* 切换按钮 */}
            <div>
              {maintenanceMode ? (
                <button
                  type="button"
                  onClick={() => handleToggleMaintenance(false)}
                  disabled={saving}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs hover:shadow flex items-center justify-center gap-2 active:scale-98"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>立即解除维护并恢复对外服务</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleMaintenance(true)}
                  disabled={saving}
                  className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs hover:shadow flex items-center justify-center gap-2 active:scale-98"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>开启全站停机维护模式</span>
                </button>
              )}
            </div>

            {/* 常用模板选择（普通语言） */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 block">快捷载入说明模板：</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESET_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => applyPreset(tpl)}
                    className="p-2.5 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-200 rounded-xl text-left transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-slate-700 group-hover:text-[#3182ce]">
                      {tpl.title}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                      预计 {tpl.est} 分钟
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 运维建议提示 */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-[11px] text-[#2b6cb0] leading-relaxed font-medium">
              💡 <strong>操作提示：</strong>
              建议在业务低峰期执行停机维护。解除维护前，请先在管理后台检查各核心功能，确认数据完整后再恢复对外开放。
            </div>
          </div>

          {/* 右侧：维护公告编辑与实时仿真预览 (7 栅格) */}
          <div className="lg:col-span-7 bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#3182ce]" />
                  维护公告提示说明 (保存到数据库)
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  停机维护开启时，普通用户访问页面时看到的友好提示说明
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveMessage}
                disabled={saving}
                className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto active:scale-95"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>保存说明内容</span>
              </button>
            </div>

            {/* 输入框与预估耗时 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="text-red-500 font-black text-sm">*</span>
                  公告说明正文
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">预计耗时:</span>
                  <select
                    value={estimatedMinutes}
                    onChange={(e) => handleEstimatedMinutesChange(e.target.value)}
                    className="h-7 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-hidden cursor-pointer"
                  >
                    <option value="15">15 分钟</option>
                    <option value="30">30 分钟</option>
                    <option value="60">1 小时</option>
                    <option value="120">2 小时</option>
                    <option value="240">4 小时</option>
                  </select>
                </div>
              </div>
              <textarea
                rows={4}
                value={maintenanceMessage}
                onChange={(e) => handleMaintenanceMessageChange(e.target.value)}
                placeholder="请输入系统停机维护时的提示说明..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-hidden transition-all resize-none"
              />
              <div className="text-right text-[11px] text-slate-400">
                已输入 {maintenanceMessage.length} 个字符
              </div>
            </div>

            {/* 前台仿真卡片 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">
                前台用户端展示效果仿真预览：
              </span>
              <div className="p-8 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 text-center space-y-4 relative overflow-hidden">
                <div className="w-14 h-14 rounded-2xl bg-amber-100/80 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                  <Wrench className="w-7 h-7" />
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">
                    知阁·舟坊 正在维护升级中
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {maintenanceMessage || "系统正在维护升级中，预计稍后恢复，请耐心等待。"}
                  </p>
                  <div className="pt-1 flex items-center justify-center gap-2">
                    <span className="px-2.5 py-1 bg-white/90 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg shadow-2xs">
                      预计耗时: 约 {estimatedMinutes} 分钟
                    </span>
                    <span className="px-2.5 py-1 bg-white/90 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg shadow-2xs">
                      维护后自动开放
                    </span>
                  </div>
                </div>
                <div className="pt-2">
                  <span className="inline-block px-3 py-0.5 bg-white border border-amber-200 text-amber-700 text-[10px] font-bold rounded-full shadow-2xs">
                    知阁·舟坊 运维提示
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 板块 2：计划维护任务排期 (从登记到完成的流程闭环) */}
      {activeTab === "schedules" && (
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 animate-in fade-in-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3182ce]" />
                计划中的维护任务排期
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                记录平台计划维护任务与执行情况，所有任务记录持久化保存于数据库。
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenScheduleModal}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>登记新维护计划</span>
            </button>
          </div>

          {schedules.length === 0 ? (
            <div className="py-14 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center shadow-2xs">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className="text-xs font-black text-slate-700">数据库中暂无排期中的维护任务</h4>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  系统已连接真实数据库。如有例行停机升级、网络设备检修或数据库整理任务，可点击下方按钮登记。
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenScheduleModal}
                className="h-8 px-3.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即登记新计划</span>
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {paginatedSchedules.map((s) => (
                  <div key={s.id} className="py-4.5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-800">{s.title}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {getTypeLabel(s.type)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            (s.isDowntime ?? (s.type === "UPGRADE" || s.type === "DATABASE"))
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-blue-50 text-[#2b6cb0] border-blue-200"
                          }`}
                        >
                          {(s.isDowntime ?? (s.type === "UPGRADE" || s.type === "DATABASE"))
                            ? "全站停服维护"
                            : "在线平滑维护"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                            s.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : s.status === "IN_PROGRESS"
                              ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                              : s.status === "SCHEDULED"
                              ? "bg-blue-50 text-[#2b6cb0] border-blue-200"
                              : "bg-slate-100 text-slate-400 border-slate-200"
                          }`}
                        >
                          {getStatusLabel(s.status)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {s.description || "无详细说明"}
                      </p>

                      <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium flex-wrap pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          维护窗口：{s.startTime} ~ {s.endTime}
                        </span>
                        <span>负责人：{s.manager || "平台运维组"}</span>
                        <span>影响范围：{s.scope || "全站服务"}</span>
                      </div>

                      {s.actualResult && (
                        <div className="text-[11px] text-emerald-700 bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100 font-medium">
                          <strong>执行反馈：</strong>
                          {s.actualResult}
                        </div>
                      )}
                    </div>

                    {/* 状态操作按钮（智能双向联动） */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                      {s.status === "SCHEDULED" && (
                        <button
                          type="button"
                          onClick={() => handleStartSchedule(s)}
                          className="px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                        >
                          <span>开始执行</span>
                          {(s.isDowntime ?? (s.type === "UPGRADE" || s.type === "DATABASE")) && (
                            <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-white/20 text-white">
                              联动停服
                            </span>
                          )}
                        </button>
                      )}
                      {s.status === "IN_PROGRESS" && (
                        <button
                          type="button"
                          onClick={() => handleCompleteSchedule(s)}
                          className="px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>完成并恢复对外服务</span>
                        </button>
                      )}
                      {s.status !== "CANCELLED" && s.status !== "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateScheduleStatus(s, "CANCELLED", s.status === "IN_PROGRESS" && maintenanceMode)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          取消计划
                        </button>
                      )}
                      {/* 查看详情（文字 + 图标） */}
                      <button
                        type="button"
                        onClick={() => setSelectedScheduleDetail(s)}
                        className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-200 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
                        <span>查看详情</span>
                      </button>

                      {/* 删除记录（文字 + 图标） */}
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(s.id, s.title)}
                        className="px-2.5 py-1.5 text-xs font-bold text-red-500 hover:text-red-700 bg-white hover:bg-red-50/70 border border-slate-200 hover:border-red-200 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                        title="删除此维护计划"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>删除记录</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 维护任务分页栏（每页固定5条，大厂中后台规范） */}
              {schedules.length > 0 && (
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="text-slate-500 font-medium">
                    共 <span className="font-bold text-slate-800 font-mono">{schedules.length}</span> 项维护任务，
                    每页显示 <span className="font-bold text-slate-800 font-mono">{PAGE_SIZE}</span> 条，
                    当前第 <span className="font-bold text-[#3182ce] font-mono">{currentSchedulePage}</span> / <span className="font-mono">{totalSchedulePages}</span> 页
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSchedulePage((prev) => Math.max(1, prev - 1))}
                      disabled={currentSchedulePage <= 1}
                      className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>上一页</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalSchedulePages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSchedulePage(p)}
                          className={`w-8 h-8 rounded-[4px] text-xs font-bold font-mono transition-all cursor-pointer ${
                            p === currentSchedulePage
                              ? "bg-[#3182ce] text-white shadow-2xs font-black"
                              : "bg-white border border-slate-200 text-slate-600 hover:border-blue-200 hover:text-[#3182ce]"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSchedulePage((prev) => Math.min(totalSchedulePages, prev + 1))}
                      disabled={currentSchedulePage >= totalSchedulePages}
                      className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <span>下一页</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 板块 3：系统发版记录与更新日志 (全生命周期闭环) */}
      {activeTab === "releases" && (
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 animate-in fade-in-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-[#3182ce]" />
                系统发版记录与更新公告
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                记录平台每次版本发布与更新要点，数据存入数据库并支持全网公告展示。
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenReleaseModal}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>发布新版本记录</span>
            </button>
          </div>

          {/* 全新增加：系统发版更新控制策略与前台广播设置面板 */}
          <form
            onSubmit={handleSaveUpdateSettings}
            className="p-4 rounded-xl border border-blue-100/80 bg-gradient-to-br from-blue-50/40 to-slate-50/50 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-blue-100/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#3182ce]" />
                <span className="text-xs font-black text-slate-800">
                  全网版本更新控制策略（Update Settings）
                </span>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="h-7 px-3 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-bold rounded-[4px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                <span>保存更新策略</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 策略 1：新版本弹窗广播 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-slate-700">前台更新弹窗 (What's New)</span>
                  <input
                    type="checkbox"
                    checked={updateSettings.notifyModalEnabled}
                    onChange={(e) =>
                      setUpdateSettings({ ...updateSettings, notifyModalEnabled: e.target.checked })
                    }
                    className="rounded text-[#3182ce] focus:ring-[#3182ce]"
                  />
                </label>
                <p className="text-[10px] text-slate-400 leading-tight">
                  开启后，前台用户在系统发布新版本后首次登录将弹出更新要点介绍。
                </p>
              </div>

              {/* 策略 2：用户检查更新 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-slate-700">自主检查更新入口</span>
                  <input
                    type="checkbox"
                    checked={updateSettings.autoCheckUpdate}
                    onChange={(e) =>
                      setUpdateSettings({ ...updateSettings, autoCheckUpdate: e.target.checked })
                    }
                    className="rounded text-[#3182ce] focus:ring-[#3182ce]"
                  />
                </label>
                <p className="text-[10px] text-slate-400 leading-tight">
                  允许前台用户在页脚或个人中心手动点击“检查系统更新”。
                </p>
              </div>

              {/* 策略 3：发布渠道与强更控制 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-slate-700">发布更新渠道</span>
                  <select
                    value={updateSettings.releaseChannel}
                    onChange={(e) =>
                      setUpdateSettings({
                        ...updateSettings,
                        releaseChannel: e.target.value as "STABLE" | "BETA",
                      })
                    }
                    className="text-[11px] font-bold text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 outline-hidden"
                  >
                    <option value="STABLE">正式稳定通道 (Stable)</option>
                    <option value="BETA">体验公测通道 (Beta)</option>
                  </select>
                </label>
                <p className="text-[10px] text-slate-400 leading-tight">
                  标记前台展示的版本更新通道标签。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  更新弹窗标题自定义
                </label>
                <input
                  type="text"
                  value={updateSettings.popupTitle}
                  onChange={(e) =>
                    setUpdateSettings({ ...updateSettings, popupTitle: e.target.value })
                  }
                  placeholder="如：知阁·舟坊新版本发布公告"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 outline-hidden bg-white focus:border-[#3182ce]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  最低兼容运行版本
                </label>
                <input
                  type="text"
                  value={updateSettings.minSupportedVersion}
                  onChange={(e) =>
                    setUpdateSettings({ ...updateSettings, minSupportedVersion: e.target.value })
                  }
                  placeholder="如：v1.0.0"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 outline-hidden bg-white focus:border-[#3182ce]"
                />
              </div>
            </div>
          </form>

          {releases.length === 0 ? (
            <div className="py-14 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                <History className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className="text-xs font-black text-slate-700">数据库中暂无发版记录与更新日志</h4>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  当前生产基准版本为 {currentVersion || "v1.0.0"}。管理员可通过上方按钮录入真实版本更新日志并持久化入库。
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenReleaseModal}
                className="h-8 px-3.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>发布系统新版本记录</span>
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedReleases.map((rel) => (
                  <div
                    key={rel.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40 hover:bg-white transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-[#3182ce] text-white">
                          {rel.version}
                        </span>
                        <h4 className="text-sm font-black text-slate-800">{rel.title}</h4>
                        {getReleaseTypeBadge(rel.type)}
                        {rel.isPublished ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>全网公示中</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                            暂未公示
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                        <span>{rel.publishDate}</span>
                        <span>·</span>
                        <span>{rel.author}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleReleasePublish(rel.id, rel.isPublished)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title={rel.isPublished ? "点击隐藏前台公示" : "点击设为全网公示"}
                        >
                          {rel.isPublished ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>{rel.isPublished ? "隐藏公示" : "设为公示"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditReleaseModal(rel)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="编辑修改此发版记录"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>编辑</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRelease(rel.id, rel.version)}
                          className="px-2 py-1 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="删除此发版记录"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          <span>删除</span>
                        </button>
                      </div>
                    </div>

                    {/* 更新项条目 */}
                    <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                      {rel.items.map((item, idx) => (
                        <div key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] mt-1.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* 发版记录分页栏（每页固定5条，大厂中后台规范） */}
              {releases.length > 0 && (
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="text-slate-500 font-medium">
                    共 <span className="font-bold text-slate-800 font-mono">{releases.length}</span> 条发版记录，
                    每页显示 <span className="font-bold text-slate-800 font-mono">{PAGE_SIZE}</span> 条，
                    当前第 <span className="font-bold text-[#3182ce] font-mono">{currentReleasePage}</span> / <span className="font-mono">{totalReleasePages}</span> 页
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setReleasePage((prev) => Math.max(1, prev - 1))}
                      disabled={currentReleasePage <= 1}
                      className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>上一页</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalReleasePages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setReleasePage(p)}
                          className={`w-8 h-8 rounded-[4px] text-xs font-bold font-mono transition-all cursor-pointer ${
                            p === currentReleasePage
                              ? "bg-[#3182ce] text-white shadow-2xs font-black"
                              : "bg-white border border-slate-200 text-slate-600 hover:border-blue-200 hover:text-[#3182ce]"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setReleasePage((prev) => Math.min(totalReleasePages, prev + 1))}
                      disabled={currentReleasePage >= totalReleasePages}
                      className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <span>下一页</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 弹窗 1：登记维护任务（采用大厂防截断固顶固底 + 弹性自适应滚动区架构） */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95">
            {/* Header 头部固定置顶 */}
            <div className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/60 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    登记系统维护计划
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    排期一次计划中的维护任务并持久化记录在数据库中
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 表单整体采用弹性列布局 */}
            <form onSubmit={handleCreateScheduleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden text-left">
              {/* 中间内容区域：带流畅滚动条，内容再多也不会被截断 */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    维护任务标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="如：2026年9月下旬核心数据库常规优化"
                    value={scheduleForm.title}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] text-xs font-bold text-slate-800 outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">维护类型</label>
                    <select
                      value={scheduleForm.type}
                      onChange={(e) =>
                        handleScheduleTypeChange(e.target.value as MaintenanceSchedule["type"])
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 outline-hidden bg-white cursor-pointer"
                    >
                      <option value="UPGRADE">系统升级</option>
                      <option value="DATABASE">数据库维护</option>
                      <option value="HARDWARE">网络设备</option>
                      <option value="INSPECT">例行检查</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>影响范围</span>
                      <span className="text-[10px] text-[#3182ce] font-normal">已智能联动</span>
                    </label>
                    <input
                      type="text"
                      placeholder="如：全站服务 / 数据库"
                      value={scheduleForm.scope}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, scope: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden focus:border-[#3182ce]"
                    />
                  </div>
                </div>

                {/* 运行控制策略单选卡片 */}
                <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>运行控制策略</span>
                    <span className="text-[10px] text-[#3182ce] font-semibold">大厂运维标准闭环</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleForm({ ...scheduleForm, isDowntime: true })}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        scheduleForm.isDowntime
                          ? "bg-red-50/80 border-red-200 text-red-900 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <span className={`w-2 h-2 rounded-full ${scheduleForm.isDowntime ? "bg-red-500 animate-pulse" : "bg-slate-300"}`} />
                        <span>全站停机维护</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight font-medium">
                        开始执行时联动开启维护模式，前台全屏阻断；完成后自动恢复
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScheduleForm({ ...scheduleForm, isDowntime: false })}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        !scheduleForm.isDowntime
                          ? "bg-blue-50/80 border-blue-200 text-blue-900 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <span className={`w-2 h-2 rounded-full ${!scheduleForm.isDowntime ? "bg-[#3182ce]" : "bg-slate-300"}`} />
                        <span>在线平滑维护</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight font-medium">
                        系统服务不停机，仅前台顶部挂载通知横幅，业务正常使用
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>计划开始时间 <span className="text-red-500">*</span></span>
                      <span className="text-[10px] text-slate-400 font-normal">日历点选</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={scheduleForm.startTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 outline-hidden bg-white cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>预计结束时间</span>
                      <span className="text-[10px] text-slate-400 font-normal">日历点选</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleForm.endTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 outline-hidden bg-white cursor-pointer"
                    />
                  </div>
                </div>

                {/* 快捷设置结束时间小工具 */}
                <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                  <span>快捷设置维护窗口时长:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleForm.startTime) return;
                        const s = new Date(scheduleForm.startTime);
                        const e = new Date(s.getTime() + 60 * 60 * 1000);
                        setScheduleForm((prev) => ({ ...prev, endTime: formatDateTimeLocal(e) }));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                    >
                      +1小时
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleForm.startTime) return;
                        const s = new Date(scheduleForm.startTime);
                        const e = new Date(s.getTime() + 2 * 60 * 60 * 1000);
                        setScheduleForm((prev) => ({ ...prev, endTime: formatDateTimeLocal(e) }));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                    >
                      +2小时
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleForm.startTime) return;
                        const s = new Date(scheduleForm.startTime);
                        const e = new Date(s.getTime() + 4 * 60 * 60 * 1000);
                        setScheduleForm((prev) => ({ ...prev, endTime: formatDateTimeLocal(e) }));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                    >
                      +4小时
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">负责人</label>
                  <input
                    type="text"
                    placeholder="如：平台运维组-李工"
                    value={scheduleForm.manager}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, manager: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">维护内容与操作说明</label>
                  <textarea
                    rows={3}
                    placeholder="简述本次维护要执行的具体任务和注意事项..."
                    value={scheduleForm.description}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden resize-none"
                  />
                </div>
              </div>

              {/* Footer 底部操作栏固定置底防截断 */}
              <div className="shrink-0 p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>保存并登记到数据库</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 2：发布与编辑新版本记录（采用大厂防截断固顶固底 + 弹性自适应滚动区架构） */}
      {showReleaseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95">
            {/* Header 头部固定置顶 */}
            <div className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/60 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    {editingReleaseId ? "编辑系统发版记录" : "发布系统新版本记录"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {editingReleaseId
                      ? "修改此版本的升级要点并持久化更新到数据库中"
                      : "录入新版本的升级要点并持久化保存在数据库中"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReleaseModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 表单整体采用弹性列布局 */}
            <form onSubmit={handleCreateReleaseSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden text-left">
              {/* 中间内容区域：自适应滚动 */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>版本号 <span className="text-red-500">*</span></span>
                      <span className="text-[10px] text-[#3182ce] font-normal">基于当前 {currentVersion || "v1.0.0"} 递增</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="如：v1.0.1"
                      value={releaseForm.version}
                      onChange={(e) => setReleaseForm({ ...releaseForm, version: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold font-mono text-xs text-slate-800 outline-hidden focus:border-[#3182ce]"
                    />
                    {/* 快捷指定大中小版本 */}
                    <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          setReleaseForm((prev) => ({
                            ...prev,
                            version: computeNextVersion(currentVersion || "v1.0.0", "patch"),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                      >
                        +0.0.1 补丁
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReleaseForm((prev) => ({
                            ...prev,
                            version: computeNextVersion(currentVersion || "v1.0.0", "minor"),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                      >
                        +0.1.0 功能
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReleaseForm((prev) => ({
                            ...prev,
                            version: computeNextVersion(currentVersion || "v1.0.0", "major"),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-600 transition-colors cursor-pointer"
                      >
                        +1.0.0 架构
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">发版类型</label>
                    <select
                      value={releaseForm.type}
                      onChange={(e) =>
                        setReleaseForm({
                          ...releaseForm,
                          type: e.target.value as ReleaseNote["type"],
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 outline-hidden"
                    >
                      <option value="FEATURE">功能迭代</option>
                      <option value="OPTIMIZE">体验优化</option>
                      <option value="BUGFIX">缺陷修复</option>
                      <option value="SECURITY">安全加固</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    版本更新标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="如：工作空间协同优化与算力核算升级"
                    value={releaseForm.title}
                    onChange={(e) => setReleaseForm({ ...releaseForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">发版日期</label>
                    <input
                      type="date"
                      value={releaseForm.publishDate}
                      onChange={(e) => setReleaseForm({ ...releaseForm, publishDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">发版发布人</label>
                    <input
                      type="text"
                      placeholder="如：平台研发组"
                      value={releaseForm.author}
                      onChange={(e) => setReleaseForm({ ...releaseForm, author: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>更新要点清单 (每行一条)</span>
                    <span className="text-[11px] text-slate-400 font-normal">换行区分不同条目</span>
                  </label>
                  <textarea
                    rows={4}
                    placeholder="例如：&#10;1. 优化工作空间协作效率&#10;2. 修复数据表格偶发错位&#10;3. 增强平台访问安全校验"
                    value={releaseForm.itemsText}
                    onChange={(e) => setReleaseForm({ ...releaseForm, itemsText: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-700 outline-hidden resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isPublishedCheck"
                    checked={releaseForm.isPublished}
                    onChange={(e) => setReleaseForm({ ...releaseForm, isPublished: e.target.checked })}
                    className="rounded text-[#3182ce] focus:ring-[#3182ce]"
                  />
                  <label htmlFor="isPublishedCheck" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    全网公示（立即在前台更新公告栏中展示）
                  </label>
                </div>
              </div>

              {/* Footer 底部操作栏固定置底防截断 */}
              <div className="shrink-0 p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReleaseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{editingReleaseId ? "确认保存修改" : "确认发布并保存数据库"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 3：查看计划维护任务详情模态框（大厂规范三段式防截断设计） */}
      {selectedScheduleDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header 头部固定置顶 */}
            <div className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/60 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-slate-800 tracking-tight">
                      {selectedScheduleDetail.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-[4px] text-[10px] font-black border ${
                        selectedScheduleDetail.status === "IN_PROGRESS"
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : selectedScheduleDetail.status === "SCHEDULED"
                          ? "bg-blue-50 text-[#3182ce] border-blue-200"
                          : selectedScheduleDetail.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {getStatusLabel(selectedScheduleDetail.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    任务ID: {selectedScheduleDetail.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScheduleDetail(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                title="关闭详情"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body 内容自适应滚动区 */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-left">
              {/* 核心属性网格卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">运行控制策略</span>
                  <div className="flex items-center gap-2">
                    {(selectedScheduleDetail.isDowntime ?? (selectedScheduleDetail.type === "UPGRADE" || selectedScheduleDetail.type === "DATABASE")) ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-black bg-red-50 text-red-700 border border-red-200">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        全站停机维护 (联动停服)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">
                        <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                        在线平滑维护 (不停服)
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">任务分类</span>
                  <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>
                      {selectedScheduleDetail.type === "UPGRADE"
                        ? "系统升级与版本迭代"
                        : selectedScheduleDetail.type === "DATABASE"
                        ? "核心数据库维护与优化"
                        : selectedScheduleDetail.type === "HARDWARE"
                        ? "网络基础设施检修"
                        : "常规安全健康巡检"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">影响范围</span>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedScheduleDetail.scope || "全站系统服务"}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">运维负责人</span>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedScheduleDetail.manager || "平台运维组"}</span>
                  </div>
                </div>
              </div>

              {/* 维护时间窗口卡片 */}
              <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100 space-y-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#3182ce]" />
                  <span>维护计划时间窗口</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 block">计划开始时间</span>
                    <span className="font-mono font-bold text-slate-800">{selectedScheduleDetail.startTime}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 block">预计结束时间</span>
                    <span className="font-mono font-bold text-slate-800">{selectedScheduleDetail.endTime || "待定"}</span>
                  </div>
                </div>
              </div>

              {/* 维护内容与操作说明 */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">维护内容与操作说明</span>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-line border-l-4 border-l-[#3182ce]">
                  {selectedScheduleDetail.description || "暂无详细操作说明"}
                </div>
              </div>

              {/* 实际执行反馈（若存在） */}
              {selectedScheduleDetail.actualResult && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>实际执行反馈记录</span>
                  </span>
                  <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                    {selectedScheduleDetail.actualResult}
                  </p>
                </div>
              )}
            </div>

            {/* Footer 底部固定操作栏 */}
            <div className="shrink-0 p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-3">
              <div>
                {selectedScheduleDetail.status === "SCHEDULED" && (
                  <button
                    type="button"
                    onClick={() => {
                      const cur = selectedScheduleDetail;
                      setSelectedScheduleDetail(null);
                      handleStartSchedule(cur);
                    }}
                    className="h-8 px-3.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                  >
                    <span>开始执行维护</span>
                  </button>
                )}
                {selectedScheduleDetail.status === "IN_PROGRESS" && (
                  <button
                    type="button"
                    onClick={() => {
                      const cur = selectedScheduleDetail;
                      setSelectedScheduleDetail(null);
                      handleCompleteSchedule(cur);
                    }}
                    className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>完成维护并恢复服务</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedScheduleDetail(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                关闭详情
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 统一二次确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="确认执行"
        cancelText="取消"
        onConfirm={async () => {
          await confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
