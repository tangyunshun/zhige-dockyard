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
      title: targetMode ? "⚠️ 确认开启全局停机维护模式？" : "确认解除系统维护状态？",
      message: targetMode
        ? "【高危操作警告】开启后，系统将拒绝所有非管理员用户的访问，强制清空普通用户的活跃 Session，前端全站将统一展示停机维护公告。确定现在开启吗？"
        : "解除后，全站所有前台入口与沙箱计算任务将恢复正常对外开放。是否立即恢复系统正常运行？",
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
            const data = await res.json();
            setMaintenanceMode(targetMode);
            toast.success(targetMode ? "全局维护模式已开启，非管理员会话已重置" : "维护模式已解除，全站恢复正常");
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
        }),
      });
      if (res.ok) {
        toast.success("系统维护对外公告内容已更新并保存至配置表");
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

  return (
    <div className="space-y-6 pb-8">
      {/* 头部微毛玻璃顶栏 */}
      <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${
              maintenanceMode ? "bg-amber-500/10 text-amber-500" : "bg-[#3182ce]/10 text-[#3182ce]"
            }`}>
              <Wrench className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">系统维护与应急熔断</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  maintenanceMode
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                }`}>
                  {maintenanceMode ? "● 停机维护中" : "● 正常对外开放"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                知阁底层高危应急配置。维护模式持久化记录于数据库，重启服务后依然生效；开启后非管理员访问将被自动重定向。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadMaintenanceStatus}
              disabled={loading}
              className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
              刷新状态
            </button>
            <button
              onClick={() => router.push("/admin/settings")}
              className="h-9 px-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回全局设置
            </button>
          </div>
        </div>
      </div>

      {/* 4 大系统状态指示卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">当前运行阶段</span>
            <Radio className={`w-4 h-4 ${maintenanceMode ? "text-amber-500" : "text-emerald-500"}`} />
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">
            {maintenanceMode ? "停机维护 (In Maintenance)" : "生产运行 (Production)"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {maintenanceMode ? "常规用户端已被拦截" : "网关与所有对外路由畅通"}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">管理员免阻断通道</span>
            <ShieldCheck className="w-4 h-4 text-[#3182ce]" />
          </div>
          <div className="text-xl font-black text-emerald-600 mt-2">已就绪 (Whitelisted)</div>
          <div className="text-[11px] text-slate-400 mt-1">
            角色 ADMIN / SUPER_ADMIN 拥有通行豁免
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">会话强踢机制 (G-02)</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">自动执行 (Active)</div>
          <div className="text-[11px] text-slate-400 mt-1">
            开启时重置非管理端 sessionVersion
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">服务同步时标</span>
            <Info className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-sm font-black text-slate-700 mt-2 truncate" title={currentTime}>
            {currentTime ? new Date(currentTime).toLocaleTimeString("zh-CN") : "刚刚同步"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">持久化记录于 systemconfig</div>
        </div>
      </div>

      {/* 主控制面板区 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：模式开关与确认 */}
        <div className="lg:col-span-1 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#3182ce]" />
              控制台熔断开关
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              快速切换当前平台的系统运行级别，操作需二次确认。
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
              <span>状态指示器</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                maintenanceMode ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {maintenanceMode ? "维护生效中" : "正常开放"}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {maintenanceMode
                ? "当前系统已处于维护模式。外部访问将被引导至统一维护说明页，仅管理员允许登录后台。"
                : "当前系统运行平稳，所有前台功能正常服务中。"}
            </p>
          </div>

          {maintenanceMode ? (
            <button
              onClick={() => handleToggleMaintenance(false)}
              disabled={saving}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              立即解除维护并恢复对外服务
            </button>
          ) : (
            <button
              onClick={() => handleToggleMaintenance(true)}
              disabled={saving}
              className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              ⚡ 启动全站停机维护
            </button>
          )}

          <div className="p-3.5 rounded-lg bg-blue-50/60 border border-blue-100 text-[11px] text-blue-700 leading-relaxed font-medium">
            💡 <strong>温馨提示：</strong>
            维护模式仅应在系统底层大版本升级、数据库表结构大规模平滑迁移或不可抗力应急时开启。
          </div>
        </div>

        {/* 右侧：对外维护公告说明与预览 */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3182ce]" />
                全站维护公告配置 (持久化到 DB)
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                当维护模式开启时，普通用户访问全站页面将会看到的友好提示文案。
              </p>
            </div>
            <button
              onClick={handleSaveMessage}
              disabled={saving}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存公告文案
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">公告说明内容</label>
            <textarea
              rows={4}
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="请输入维护提示文案，例如：知阁舟坊正在进行例行底层升级，预计耗时30分钟，给您带来的不便敬请谅解..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#3182ce] outline-none transition-all resize-none"
            />
          </div>

          {/* 前台维护页渲染预览卡片 */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-600 block">前台用户端展示效果预览：</span>
            <div className="p-6 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Wrench className="w-6 h-6 animate-spin" style={{ animationDuration: "6s" }} />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-800">系统维护中，稍后即归</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto mt-2 leading-relaxed font-medium">
                  {maintenanceMessage || "系统正在停机维护升级中，预计稍后恢复，请耐心等待。"}
                </p>
              </div>
              <div className="pt-2">
                <span className="inline-block px-3 py-1 bg-white border border-amber-200 text-amber-700 text-[10px] font-bold rounded-full shadow-xs">
                  知阁·舟坊 运维中枢应急广播
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
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
