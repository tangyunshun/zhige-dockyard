"use client";

/**
 * 前台「空间模型策略」页（空间所有者/管理员视角）
 * 配置本空间的：①默认模型 ②可用官方模型白名单。
 * 口径与管理员后台一致（留空=不限制；勾选后仅能用勾选模型），但无需进管理员后台。
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { Cpu, Save, ShieldCheck, ArrowLeft, RotateCcw, Loader2, Check, Building2 } from "lucide-react";

interface Deployment {
  id: string;
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  contextLimit: number;
  capabilities: string[];
}

const CAP_LABELS: Record<string, string> = {
  TEXT_GENERATION: "文本生成",
  STRUCTURED_OUTPUT: "结构化输出",
  VISION: "视觉多模态",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文档解析",
  FUNCTION_CALLING: "工具调用",
  CODE_INTERPRETER: "代码沙箱",
  WEB_SEARCH: "联网检索",
};

function fmtCtx(t: number | null | undefined): string {
  if (!t) return "未指定";
  return t >= 1024 ? `${(t / 1024).toFixed(0)}k` : `${t}`;
}

export default function WorkspaceModelPolicyPage() {
  const params = useParams();
  const workspaceId = (params?.id as string) || "";
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [defaultId, setDefaultId] = useState<string>("");
  const [allowed, setAllowed] = useState<string[]>([]);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-policy`, { headers: headers() });
      const json = await res.json().catch(() => ({}));
      if (json?.success) {
        setDeployments(json.data?.deployments || []);
        setDefaultId(json.data?.policy?.defaultDeploymentId || "");
        setAllowed(json.data?.policy?.allowedDeploymentIds || []);
      } else {
        toast.error(json?.error || "加载失败");
      }
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-policy`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ defaultDeploymentId: defaultId || null, allowedDeploymentIds: allowed }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) toast.success("空间模型策略已保存");
      else toast.error(json?.error || "保存失败");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const hasRealPolicy = Boolean(defaultId) || allowed.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-5 space-y-5">
        {/* 顶部标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.push(`/workspace/${workspaceId}?tab=quick`)}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center cursor-pointer transition-all shadow-2xs"
              title="返回空间"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center">
                  <Cpu className="w-4.5 h-4.5" />
                </span>
                空间模型策略
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-1">
                配置本空间的默认模型与可用官方模型白名单（默认模型优先于平台兜底模型）
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setDefaultId("");
                setAllowed([]);
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              恢复默认
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading}
              className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "保存中..." : "保存空间策略"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
            <div className="w-9 h-9 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-400">正在加载空间模型策略...</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 当前状态 */}
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Building2 className="w-4 h-4 text-[#3182ce]" />
                <span className="font-mono text-slate-400">空间 ID: {workspaceId}</span>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  hasRealPolicy
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {hasRealPolicy ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" /> 已单独配置专属策略
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3 h-3 text-slate-400" /> 沿用平台默认
                  </>
                )}
              </span>
            </div>

            {/* 默认模型 */}
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-5 space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
                  空间默认模型
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  空间内任务未指定模型时优先调用；留空则自动沿用平台全局默认模型。若下方已启用白名单，默认模型也需在白名单内。
                </p>
              </div>
              <select
                value={defaultId}
                onChange={(e) => setDefaultId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-[#3182ce] cursor-pointer"
              >
                <option value="">（不单独设置，自动沿用平台全局默认模型）</option>
                {deployments.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.providerName}] {d.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* 白名单 */}
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" />
                    可用模型白名单
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      {allowed.length === 0 ? "全部可用（未限制）" : `已限制 ${allowed.length} 款`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">留空表示不限制；勾选后，该空间仅允许调度已选中的模型</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAllowed(deployments.map((d) => d.id))}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-bold cursor-pointer"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllowed([])}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded text-[11px] font-bold cursor-pointer"
                  >
                    清空（不限制）
                  </button>
                </div>
              </div>

              {deployments.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  暂无可配置的官方模型部署（需平台在模型注册表启用模型）
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {deployments.map((d) => {
                    const isChecked = allowed.includes(d.id);
                    const isDefault = defaultId === d.id;
                    return (
                      <label
                        key={d.id}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                          isChecked ? "border-[#3182ce] bg-blue-50/40" : "border-slate-200 bg-white hover:bg-slate-50/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggle(d.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-bold text-xs text-slate-800 font-mono truncate" title={d.modelId}>
                              {d.modelId}
                            </span>
                            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              {d.providerName}
                            </span>
                          </div>
                          {d.displayName && d.displayName !== d.modelId && (
                            <div className="text-[11px] text-slate-500 truncate mb-1">{d.displayName}</div>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className="text-[9px] text-slate-400 font-mono">上下文 {fmtCtx(d.contextLimit)}</span>
                            {d.capabilities.slice(0, 3).map((c) => (
                              <span
                                key={c}
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/70"
                              >
                                {CAP_LABELS[c] || c}
                              </span>
                            ))}
                            {isDefault && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-[#805ad5] border border-purple-200">
                                空间默认
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
