"use client";

import { useState, useEffect } from "react";
import { Wrench, ArrowLeft, AlertTriangle, ShieldCheck, RefreshCw, Radio, CheckCircle2, FileText, Info, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

export default function MaintenancePage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");

  // 快捷预设维护模板
  const PRESET_TEMPLATES = [
    {
      title: "例行底层升级",
      content: "系统正在进行例行底层架构与安全组件升级，预计维护 30 分钟。期间暂停普通用户访问，感谢您的理解与配合。",
      est: "30"
    },
    {
      title: "数据库扩容割接",
      content: "系统正在进行核心数据库集群扩容与数据平滑迁移，预计维护 1 小时。数据安全已全量备份，稍后即可恢复正常服务。",
      est: "60"
    },
    {
      title: "紧急故障排查",
      content: "平台监测到网络探针异常波动，运维团队已启动应急隔离与安全加固程序。工程师正在紧急处理中，预计很快恢复。",
      est: "15"
    }
  ];

  // 确认弹窗
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

  // 加载当前系统维护状态（真实持久化接口）
  const loadMaintenanceStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/system/maintenance", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(Boolean(data.maintenanceMode));
        setMaintenanceMessage(data.maintenanceMessage || "系统正在停机维护升级中，预计稍后恢复，请耐心等待。");
        setCurrentTime(data.currentTime || new Date().toISOString());
      } else {
        toast.error("获取系统维护状态失败");
      }
    } catch (err) {
      toast.error("网络异常，无法连接维护控制中枢");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaintenanceStatus();
  }, []);

  // 执行维护模式切换
  const handleToggleMaintenance = (targetMode: boolean) => {
    setConfirmDialog({
      isOpen: true,
      type: targetMode ? "danger" : "info",
      title: targetMode ? "⚠️ 确认启动全站停机维护模式？" : "确认解除全站维护状态？",
      message: targetMode
        ? "【最高警戒】开启后，系统将拒绝所有非管理员用户的访问，强制清除普通用户的活跃登录凭证（G-02 会话强踢），前台页面将统一展示停机维护公告。确认立即开启吗？"
        : "解除后，全站前台服务、组件执行沙箱与用户会话将恢复正常对外开放。确认立即恢复正常运行吗？",
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
            }),
          });

          if (res.ok) {
            setMaintenanceMode(targetMode);
            toast.success(targetMode ? "全局维护模式已开启，已强制清空非管理端在线会话" : "维护模式已解除，全站对外服务已恢复正常");
            loadMaintenanceStatus();
          } else {
            const errData = await res.json().catch(() => ({}));
            toast.error(errData.error || "操作失败，权限不足或服务器错误");
          }
        } catch (e) {
          toast.error("执行维护切换请求发生异常");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // 保存维护公告
  const handleSaveMessage = async () => {
    if (!maintenanceMessage.trim()) {
      toast.warning("维护公告说明内容不能为空");
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
        }),
      });
      if (res.ok) {
        toast.success("系统维护公告文案已成功保存并落库");
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "保存失败");
      }
    } catch (e) {
      toast.error("保存公告失败");
    } finally {
      setSaving(false);
    }
  };

  // 应用预设模板
  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setMaintenanceMessage(preset.content);
    setEstimatedMinutes(preset.est);
    toast.success(`已载入「${preset.title}」预设文案`);
  };

  return (
    <div className="space-y-6 pb-12 font-sans text-left">
      {/* 顶部 Bento 标头导航区 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs transition-colors ${
                maintenanceMode ? "bg-amber-500/10 text-amber-600" : "bg-[#3182ce]/10 text-[#3182ce]"
              }`}>
                <Wrench className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                系统维护与应急熔断中枢 (Maintenance & Circuit Breaker)
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border select-none ${
                maintenanceMode 
                  ? "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse" 
                  : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
              }`}>
                {maintenanceMode ? "● 停机维护生效中" : "● 正常对外开放中"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              管理平台应急停机与升级窗口，状态持久化记录于数据库，重启后依然生效；开启后全站非管理员自动隔离拦截
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => router.push("/admin/system-status")}
              className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Radio className="w-3.5 h-3.5 text-[#3182ce]" />
              运行大盘
            </button>
            <button
              onClick={loadMaintenanceStatus}
              disabled={loading}
              className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="重新获取持久化维护标记"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              刷新
            </button>
            <button
              onClick={() => router.push("/admin/settings")}
              className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              全局设置
            </button>
          </div>
        </div>
      </div>

      {/* 4 大系统状态指标指示卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">当前运行阶段</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              maintenanceMode ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
            }`}>
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mt-2 tracking-tight ${
            maintenanceMode ? "text-amber-600" : "text-slate-800"
          }`}>
            {loading ? "—" : maintenanceMode ? "停机维护阶段" : "生产运行阶段"}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            {maintenanceMode ? "外部请求已被统一拦截" : "网关与业务路由全量通畅"}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">管理员免阻断通道</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3182ce] mt-2 tracking-tight">
            已放行通行 (Bypass)
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            超级管理与运营管理员具备鉴权白名单
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">会话强踢机制 (PRD G-02)</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#805ad5] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2 tracking-tight">
            自动清退已生效
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            开启时重置非管理端 sessionToken
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">状态持久化同步时标</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-black text-slate-700 mt-2 tracking-tight truncate" title={currentTime}>
            {currentTime ? new Date(currentTime).toLocaleTimeString("zh-CN") : "刚刚同步"}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            落库于 systemconfig 表
          </div>
        </div>
      </div>

      {/* 主控制面板 Bento 两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：控制台熔断开关与预设模板 (4 栅格) */}
        <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/90 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#3182ce]" />
              控制台应急熔断控制
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              快速切换当前平台的系统运行级别，操作需二次确认并记入审计日志。
            </p>
          </div>

          {/* 当前状态指示箱 */}
          <div className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
            maintenanceMode 
              ? "bg-amber-50/70 border-amber-200" 
              : "bg-emerald-50/70 border-emerald-200"
          }`}>
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>运行状态指示器</span>
              <span className={`px-2.5 py-0.5 rounded text-[10px] font-black ${
                maintenanceMode ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}>
                {maintenanceMode ? "全站停机维护中" : "正常生产服务中"}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {maintenanceMode
                ? "当前系统处于维护模式。外部访问将被引导至统一维护说明页，仅管理员允许登录并操作后台。"
                : "当前系统运行平稳，所有前台功能与工作空间计算沙箱正常对外服务中。"}
            </p>
          </div>

          {/* 切换开关按钮 */}
          <div>
            {maintenanceMode ? (
              <button
                onClick={() => handleToggleMaintenance(false)}
                disabled={saving}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 active:scale-98"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>立即解除维护并恢复对外服务</span>
              </button>
            ) : (
              <button
                onClick={() => handleToggleMaintenance(true)}
                disabled={saving}
                className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 active:scale-98"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                <span>⚡ 启动全站停机维护模式</span>
              </button>
            )}
          </div>

          {/* 快捷载入预设文案 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-700 block">快捷载入官方公告模板：</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  onClick={() => applyPreset(tpl)}
                  className="p-2.5 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-200 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="text-xs font-bold text-slate-700 group-hover:text-[#3182ce]">
                    {tpl.title}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                    预估 {tpl.est} 分钟
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 安全温馨指引 */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100/80 text-[11px] text-[#2b6cb0] leading-relaxed font-medium">
            🛡️ <strong>安全控制标准 SOP：</strong>
            停机维护模式仅应在系统底层重大版本升级、数据库表结构大规模无锁迁移或应急演练时启用。解除维护前，请先在后台测试主要业务流程。
          </div>
        </div>

        {/* 右侧：维护公告编辑与前台展示仿真 (7 栅格) */}
        <div className="lg:col-span-7 bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/90 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3182ce]" />
                全站维护公告配置 (持久化到 DB)
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                停机维护开启时，普通用户访问全站入口将看到的友好提示内容
              </p>
            </div>
            <button
              onClick={handleSaveMessage}
              disabled={saving}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto active:scale-95"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>保存公告文案</span>
            </button>
          </div>

          {/* 输入框与预估时间 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <span className="text-red-500 font-black text-sm">*</span>
                公告说明内容
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">预计耗时:</span>
                <select
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  className="h-7 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="15">15 分钟</option>
                  <option value="30">30 分钟</option>
                  <option value="60">1 小时</option>
                  <option value="120">2 小时</option>
                </select>
              </div>
            </div>
            <textarea
              rows={4}
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="请输入系统停机维护的广播文案..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all resize-none"
            />
            <div className="text-right text-[11px] text-slate-400">
              已输入 {maintenanceMessage.length} 个字符
            </div>
          </div>

          {/* 前台仿真卡片 */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              前台普通用户端展示效果实时仿真预览：
            </span>
            <div className="p-8 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 text-center space-y-4 relative overflow-hidden">
              <div className="w-14 h-14 rounded-2xl bg-amber-100/80 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                <Wrench className="w-7 h-7 animate-spin" style={{ animationDuration: "8s" }} />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h4 className="text-lg font-black text-slate-800 tracking-tight">
                  知阁·舟坊 正在停机维护升级中
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {maintenanceMessage || "系统正在停机维护升级中，预计稍后恢复，请耐心等待。"}
                </p>
                <div className="pt-1 flex items-center justify-center gap-2">
                  <span className="px-2.5 py-1 bg-white/90 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg shadow-2xs">
                    预计维护: 约 {estimatedMinutes} 分钟
                  </span>
                  <span className="px-2.5 py-1 bg-white/90 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg shadow-2xs">
                    恢复后自动放行
                  </span>
                </div>
              </div>
              <div className="pt-2">
                <span className="inline-block px-3 py-0.5 bg-white border border-amber-200 text-amber-700 text-[10px] font-bold rounded-full shadow-2xs">
                  知阁·舟坊 平台运维中枢应急广播
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

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

