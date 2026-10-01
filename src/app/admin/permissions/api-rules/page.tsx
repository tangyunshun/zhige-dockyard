"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eraser,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface ApiRule {
  id: string;
  pathPrefix: string;
  methods: string[];
  permission: string;
  enabled: boolean;
  note?: string;
  source: "ui" | "manual";
  moduleRoute?: string;
}

interface CatalogOption {
  key: string;
  label: string;
  desc: string;
  group: string;
}

/** 请求方法 → 用户看得懂的说法 */
const METHOD_LABEL: Record<string, string> = {
  GET: "查看",
  POST: "新增",
  PUT: "修改",
  PATCH: "修改",
  DELETE: "删除",
};

const METHOD_ORDER: Record<string, number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-sky-50 text-sky-700 border-sky-200",
  POST: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PUT: "bg-amber-50 text-amber-700 border-amber-200",
  PATCH: "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-red-50 text-red-600 border-red-200",
};

const EMPTY_FORM = {
  id: "",
  pathPrefix: "/api/admin/",
  methods: ["GET"],
  permission: "",
  enabled: false,
  note: "",
};

type FormErrors = Partial<Record<"pathPrefix" | "methods" | "permission", string>>;

export default function ApiPermissionRulesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<ApiRule[]>([]);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [isEdit, setIsEdit] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickerKeyword, setPickerKeyword] = useState("");

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/api-permission-rules", {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "读取失败");
        return;
      }
      setRules(data.rules ?? []);
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
    } catch (error) {
      console.error("Load api permission rules error:", error);
      toast.error("网络异常，读取失败");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 权限代号 → 中文名称（用于列表里显示"人话"） */
  const labelOf = useCallback(
    (key: string) => catalog.find((c) => c.key === key)?.label || "",
    [catalog]
  );

  const stats = useMemo(() => {
    const on = rules.filter((r) => r.enabled).length;
    return { total: rules.length, on, off: rules.length - on, paths: new Set(rules.map((r) => r.pathPrefix)).size };
  }, [rules]);

  const groups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = rules.filter((r) => {
      if (statusFilter === "on" && !r.enabled) return false;
      if (statusFilter === "off" && r.enabled) return false;
      if (!kw) return true;
      return (
        r.pathPrefix.toLowerCase().includes(kw) ||
        r.permission.toLowerCase().includes(kw) ||
        labelOf(r.permission).toLowerCase().includes(kw) ||
        (r.methods ?? []).join(",").toLowerCase().includes(kw) ||
        (r.note ?? "").toLowerCase().includes(kw)
      );
    });

    const map = new Map<string, ApiRule[]>();
    for (const r of filtered) {
      const list = map.get(r.pathPrefix) ?? [];
      list.push(r);
      map.set(r.pathPrefix, list);
    }

    return Array.from(map.entries())
      .map(([pathPrefix, items]) => {
        const sorted = [...items].sort(
          (a, b) =>
            (METHOD_ORDER[(a.methods?.[0] ?? "").toUpperCase()] ?? 9) -
            (METHOD_ORDER[(b.methods?.[0] ?? "").toUpperCase()] ?? 9)
        );
        return {
          pathPrefix,
          items: sorted,
          onCount: sorted.filter((i) => i.enabled).length,
          fromModule: sorted.some((i) => i.source === "ui"),
        };
      })
      .sort((a, b) => a.pathPrefix.localeCompare(b.pathPrefix));
  }, [rules, keyword, statusFilter, labelOf]);

  const pickerOptions = useMemo(() => {
    const kw = pickerKeyword.trim().toLowerCase();
    if (!kw) return catalog;
    return catalog.filter(
      (c) =>
        c.key.toLowerCase().includes(kw) ||
        c.label.toLowerCase().includes(kw) ||
        c.group.toLowerCase().includes(kw) ||
        c.desc.toLowerCase().includes(kw)
    );
  }, [catalog, pickerKeyword]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
    setShowPicker(false);
    setIsEdit(false);
    setShowForm(true);
  };

  const openEdit = (rule: ApiRule) => {
    setForm({
      id: rule.id,
      pathPrefix: rule.pathPrefix,
      methods: rule.methods?.length ? rule.methods : ["GET"],
      permission: rule.permission,
      enabled: rule.enabled,
      note: rule.note ?? "",
    });
    setFormErrors({});
    setShowPicker(false);
    setIsEdit(true);
    setShowForm(true);
  };

  const validate = (): FormErrors => {
    const errors: FormErrors = {};
    const pathPrefix = form.pathPrefix.trim();
    if (!pathPrefix) {
      errors.pathPrefix = "请填写接口地址";
    } else if (!pathPrefix.startsWith("/")) {
      errors.pathPrefix = "接口地址要以 / 开头，例如 /api/admin/testimonials";
    } else if (pathPrefix.endsWith("/")) {
      errors.pathPrefix = "接口地址末尾不要带 /";
    }
    if (form.methods.length === 0) errors.methods = "请至少选择一种操作（查看/新增/修改/删除）";
    if (!form.permission.trim()) {
      errors.permission = "请选择对应配置个权限（可点右侧「从权限目录选择」）";
    } else if (!/^[a-z0-9_]+:[a-z0-9_]+$/i.test(form.permission.trim())) {
      errors.permission = "格式应为「功能:动作」，建议直接用「从权限目录选择」避免手写出错";
    }
    return errors;
  };

  const submit = async () => {
    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/api-permission-rules", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          id: form.id || undefined,
          pathPrefix: form.pathPrefix.trim(),
          methods: form.methods,
          permission: form.permission.trim(),
          enabled: form.enabled,
          note: form.note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setFormErrors({ permission: data?.error || "保存失败，请稍后重试" });
        return;
      }
      toast.success("已保存，约 3 秒内生效");
      setShowForm(false);
      await load();
    } catch (error) {
      console.error("Save api permission rule error:", error);
      setFormErrors({ permission: "网络异常，保存失败，请稍后重试" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: ApiRule) => {
    const res = await fetch("/api/admin/api-permission-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      toast.error(data?.error || "操作失败");
      return;
    }
    toast.success(rule.enabled ? "已关闭拦截（该接口不再校验权限），约 3 秒内生效" : "已开启拦截（该接口会校验权限），约 3 秒内生效");
    await load();
  };

  const remove = async (rule: ApiRule) => {
    const res = await fetch(`/api/admin/api-permission-rules?id=${encodeURIComponent(rule.id)}`, {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      toast.error(data?.error || "删除失败");
      return;
    }
    toast.success("已删除该条规则");
    await load();
  };

  const fieldClass = (hasError: boolean) =>
    `mt-1 w-full h-10 px-3 rounded-xl border text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 transition-colors ${
      hasError
        ? "border-red-400 bg-red-50/40 focus:ring-red-200"
        : "border-slate-200 focus:ring-[#3182ce]/30"
    }`;

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/permissions"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-[#2b6cb0] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回权限配置
          </Link>
          <h1 className="mt-1 text-lg font-black text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#3182ce]" />
            接口权限设置
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            这里决定「<strong>哪一类后台操作需要哪个权限</strong>」。设置好之后，没有该权限的管理员就无法操作对应功能。
            超级管理员不受限制，永远可以操作。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-[#3182ce] hover:text-[#2b6cb0] transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-black shadow-xs hover:shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新增规则
          </button>
        </div>
      </div>

      {/* 怎么用：三步指引 */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <p className="text-xs font-black text-[#2b6cb0] flex items-center gap-1.5">
          <Info className="w-4 h-4" />
          三步就会用
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              n: "1",
              t: "找到要保护的功能",
              d: "在下方列表按关键字搜索接口地址（例如输入 testimonials 找到用户评价相关接口）",
            },
            {
              n: "2",
              t: "打开或关闭拦截",
              d: "点左侧圆圈：绿色=会拦截（需要权限）；灰色=不拦截（谁都能用）。改完约 3 秒生效",
            },
            {
              n: "3",
              t: "给管理员配上权限",
              d: "到「权限配置」给管理员勾上对应权限。没勾的管理员会被挡住（超管不受限）",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-xl bg-white/80 border border-blue-100 p-3">
              <p className="text-xs font-black text-slate-800">
                <span className="inline-flex w-5 h-5 mr-1 items-center justify-center rounded-full bg-[#3182ce] text-white text-[10px] font-black align-middle">
                  {s.n}
                </span>
                {s.t}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 绿色圆圈 = 已开启拦截
          </span>
          <span className="inline-flex items-center gap-1">
            <Circle className="w-4 h-4 text-slate-300" /> 灰色圆圈 = 未开启（不拦截）
          </span>
          <span>保存后约 <strong className="text-slate-700">3 秒</strong>内生效</span>
        </div>
      </div>

      {/* 概览 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "已配置的接口", value: stats.paths, color: "text-slate-800" },
          { label: "规则条数", value: stats.total, color: "text-slate-800" },
          { label: "已开启拦截", value: stats.on, color: "text-emerald-600" },
          { label: "未开启（不拦截）", value: stats.off, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <p className="text-[11px] font-black text-slate-400">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 搜索 + 筛选 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索：功能名称 / 接口地址 / 权限名称，例如「用户评价」或 testimonials"
            className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["all", "全部"],
              ["on", "已开启拦截"],
              ["off", "未开启"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                statusFilter === value ? "bg-white text-[#2b6cb0] shadow-xs" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {(keyword || statusFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setStatusFilter("all");
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500 hover:text-[#2b6cb0] hover:border-[#3182ce] transition-all cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            清空
          </button>
        )}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">加载中...</div>
        ) : rules.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-xs font-bold text-slate-400">还没有任何规则</p>
            <p className="mt-2 text-[11px] text-slate-400">
              注册新功能模块时会自动生成；也可点右上角「新增一条」手工添加
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-xs font-bold text-slate-400">没有找到匹配的规则</p>
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setStatusFilter("all");
              }}
              className="mt-3 text-[11px] font-black text-[#2b6cb0] hover:underline cursor-pointer"
            >
              清空搜索条件
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((group) => (
              <div key={group.pathPrefix} className="px-4 sm:px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <code className="text-xs font-black text-slate-800 break-all">{group.pathPrefix}</code>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                      group.onCount > 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {group.onCount > 0 ? `已开启 ${group.onCount}/${group.items.length}` : "未开启拦截"}
                  </span>
                  {group.fromModule && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-black">
                      新增模块时自动生成
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {group.items.map((rule) => {
                    const method = (rule.methods?.[0] ?? "").toUpperCase();
                    const zhLabel = labelOf(rule.permission);
                    return (
                      <div
                        key={rule.id}
                        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
                          rule.enabled ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 bg-slate-50/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(rule)}
                          title={rule.enabled ? "点击关闭拦截" : "点击开启拦截"}
                          className="cursor-pointer shrink-0"
                        >
                          {rule.enabled ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-300" />
                          )}
                        </button>

                        {(rule.methods?.length ? rule.methods : ["ALL"]).map((m) => {
                          const up = m.toUpperCase();
                          return (
                            <span
                              key={m}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${
                                METHOD_STYLE[up] ?? "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {METHOD_LABEL[up] ?? "操作"}（{up}）
                            </span>
                          );
                        })}

                        <span className="text-[11px] font-bold text-slate-500">需要权限：</span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2b6cb0] text-[11px] font-black">
                          {zhLabel || rule.permission}
                        </span>
                        <code className="text-[10px] text-slate-400">{rule.permission}</code>

                        <span className="flex-1 min-w-[100px] text-[10px] text-slate-400 truncate">
                          {rule.note || ""}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(rule)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-[#3182ce] hover:text-[#2b6cb0] transition-all cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(rule)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-red-300 hover:text-red-500 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        说明：本页只覆盖后台接口（<code>/api/admin/…</code>）。保存后约 <strong>3 秒</strong>生效；
        管理员权限的勾选/取消在「权限配置」页，最多 <strong>5 分钟</strong>生效。
        为安全起见，若规则或权限服务临时不可用，后台接口会返回 <strong>503</strong> 并提示"权限校验服务暂时不可用，请稍后重试"
        （<strong>不会放行</strong>；超级管理员不受影响）。详细流程见
        <code className="mx-1">docs/权限与模块接入流程.md</code>。
      </p>

      {/* 新增 / 编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800">{isEdit ? "编辑这条规则" : "新增规则"}</h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="关闭"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* 接口地址 */}
              <div>
                <span className="text-xs font-black text-slate-600">
                  要保护哪个接口 <span className="text-red-500">*</span>
                </span>
                <input
                  value={form.pathPrefix}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, pathPrefix: e.target.value }));
                    if (formErrors.pathPrefix) setFormErrors((p) => ({ ...p, pathPrefix: undefined }));
                  }}
                  placeholder="/api/admin/testimonials"
                  aria-invalid={!!formErrors.pathPrefix}
                  className={fieldClass(!!formErrors.pathPrefix)}
                />
                {formErrors.pathPrefix ? (
                  <p className="mt-1 text-[11px] font-bold text-red-500">{formErrors.pathPrefix}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    填后台接口地址（一般以 <code>/api/admin/</code> 开头）。
                    填前缀即可覆盖它下面的子接口，例如填 <code>/api/admin/testimonials</code> 会包含 <code>/api/admin/testimonials/config</code>
                  </p>
                )}
              </div>

              {/* 什么时候拦截 */}
              <div>
                <span className="text-xs font-black text-slate-600">
                  哪类操作需要权限 <span className="text-red-500">*</span>
                </span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => {
                    const active = form.methods.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            methods: active ? p.methods.filter((x) => x !== m) : [...p.methods, m],
                          }));
                          if (formErrors.methods) setFormErrors((p) => ({ ...p, methods: undefined }));
                        }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                          active
                            ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-transparent"
                            : "bg-slate-100 text-slate-500 border-transparent hover:text-[#2b6cb0]"
                        }`}
                      >
                        {METHOD_LABEL[m]}（{m}）
                      </button>
                    );
                  })}
                </div>
                {formErrors.methods ? (
                  <p className="mt-1 text-[11px] font-bold text-red-500">{formErrors.methods}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    查看=读取数据；新增=创建；修改=更新；删除=移除。可多选。
                  </p>
                )}
              </div>

              {/* 需要哪个权限 */}
              <div>
                <span className="text-xs font-black text-slate-600">
                  配置权限 <span className="text-red-500">*</span>
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    value={form.permission}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, permission: e.target.value }));
                      if (formErrors.permission) setFormErrors((p) => ({ ...p, permission: undefined }));
                    }}
                    placeholder="点右侧按钮从权限目录里选"
                    aria-invalid={!!formErrors.permission}
                    className={`h-10 flex-1 min-w-0 px-3 rounded-xl border text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 transition-colors ${
                      formErrors.permission
                        ? "border-red-400 bg-red-50/40 focus:ring-red-200"
                        : "border-slate-200 focus:ring-[#3182ce]/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPicker((v) => !v)}
                    className="inline-flex items-center gap-1 h-10 px-3 rounded-xl border border-[#3182ce] text-[11px] font-black text-[#2b6cb0] hover:bg-blue-50 transition-all cursor-pointer shrink-0"
                  >
                    从权限目录选择
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                {formErrors.permission ? (
                  <p className="mt-1 text-[11px] font-bold text-red-500">{formErrors.permission}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {form.permission && labelOf(form.permission)
                      ? `已选：${labelOf(form.permission)}（${form.permission}）`
                      : "建议直接点右侧按钮选择，避免手写权限代号出错"}
                  </p>
                )}

                {showPicker && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={pickerKeyword}
                        onChange={(e) => setPickerKeyword(e.target.value)}
                        placeholder="搜索权限（中文名或代号，如 用户评价 / user_reviews）"
                        className="w-full h-9 pl-8 pr-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                      />
                    </div>
                    <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                      {pickerOptions.length === 0 ? (
                        <p className="py-6 text-center text-[11px] text-slate-400">
                          没有匹配的权限。若该权限还未注册，请先到「权限配置」注册模块。
                        </p>
                      ) : (
                        pickerOptions.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              setForm((p) => ({ ...p, permission: opt.key }));
                              setFormErrors((p) => ({ ...p, permission: undefined }));
                              setShowPicker(false);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg bg-white border border-slate-200 hover:border-[#3182ce] transition-all cursor-pointer"
                          >
                            <span className="text-[11px] font-black text-slate-700">{opt.label}</span>
                            <span className="ml-2 text-[10px] text-slate-400">{opt.key}</span>
                            {opt.group && <span className="ml-2 text-[10px] text-slate-400">· {opt.group}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 备注 */}
              <div>
                <span className="text-xs font-black text-slate-600">备注（选填）</span>
                <input
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="写点说明，方便以后自己看懂，例如：用户评价列表需要查看权限"
                  className={fieldClass(false)}
                />
              </div>

              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition-all cursor-pointer ${
                  form.enabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <span className="text-left">
                  <span className="block text-xs font-black text-slate-700">
                    保存后立即开启拦截
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {form.enabled
                      ? "开启：没有该权限的管理员会被挡住（超管不受限）"
                      : "关闭：只登记不拦截，谁都能用（可稍后再开启）"}
                  </span>
                </span>
                {form.enabled ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                )}
              </button>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-red-500">
                {Object.keys(formErrors).length > 0 ? "请先修正标红的项" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={submit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-black shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? "保存中..." : "保存（约 3 秒生效）"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
