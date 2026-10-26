"use client";

/**
 * 团队总览（跨空间只读）
 *
 * 产品分工（大厂通用做法，消除双写通道）：
 * - 本页 = 我参与的全部企业空间的【人员总览】：空间、成员、角色、加入时间，只读；
 * - 一切成员管理动作（改角色 / 移出 / 邀请码生成与作废 / 算力额度分配）收敛到
 *   空间内部的成员管理页（/workspace/[id] 成员 Tab），本页提供直达入口；
 * - 此前本页与空间成员页并行维护两套可写通道（接口相同、交互分叉、门禁强度不一），已收敛。
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Crown,
  Shield,
  User as UserIcon,
  Building2,
  RefreshCw,
  Inbox,
  ArrowRight,
  Building,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";

const ROLE_META: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  OWNER: { label: "所有者", badge: "bg-amber-50 text-amber-700 border border-amber-200", icon: <Crown className="w-3.5 h-3.5" /> },
  ADMIN: { label: "管理员", badge: "bg-blue-50 text-[#2b6cb0] border border-blue-200", icon: <Shield className="w-3.5 h-3.5" /> },
  MEMBER: { label: "成员", badge: "bg-slate-100 text-slate-600 border border-slate-200", icon: <UserIcon className="w-3.5 h-3.5" /> },
};

function roleMeta(role?: string) {
  return ROLE_META[role || "MEMBER"] || ROLE_META.MEMBER;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface WsOverview {
  id: string;
  name: string;
  role: string;
  members: { userId: string; name: string; email: string; avatar: string | null; role: string; joinedAt?: string | null }[];
}

export default function TeamManagementPage() {
  const toastCtx = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overviews, setOverviews] = useState<WsOverview[]>([]);
  const [expandedWsId, setExpandedWsId] = useState<string>("");

  const loadOverview = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/list", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        toastCtx.error(data.error || "获取工作空间失败");
        setOverviews([]);
        return;
      }
      const enterpriseWs = (data.workspaces || []).filter((w: any) => w.type === "ENTERPRISE");

      // 并行拉取每个空间的成员列表（GET 对全体成员只读开放）
      const results = await Promise.all(
        enterpriseWs.map(async (w: any) => {
          try {
            const mRes = await fetch(`/api/workspace/members?workspaceId=${encodeURIComponent(w.id)}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            });
            if (!mRes.ok) return { id: w.id, name: w.name, role: w.role || "MEMBER", members: [] };
            const mData = await mRes.json();
            return {
              id: w.id,
              name: w.name,
              role: w.role || "MEMBER",
              members: (mData.members || []).map((m: any) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
                avatar: m.avatar ?? null,
                role: m.role,
                joinedAt: m.joinedAt ?? null,
              })),
            };
          } catch {
            return { id: w.id, name: w.name, role: w.role || "MEMBER", members: [] };
          }
        }),
      );

      setOverviews(results);
      if (!expandedWsId && results.length > 0) setExpandedWsId(results[0].id);
    } catch {
      toastCtx.error("网络错误，无法加载团队总览");
      setOverviews([]);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [toastCtx, expandedWsId]);

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myUserId = getCurrentUserId();
  const totalMembers = overviews.reduce((acc, o) => acc + o.members.length, 0);
  const managedCount = overviews.filter((o) => o.role === "OWNER" || o.role === "ADMIN").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 font-medium text-sm">正在加载团队总览...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 text-left font-sans">
      {/* 顶部标题 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1">团队总览</h1>
          <p className="text-xs text-slate-400 font-medium">
            我参与的全部企业空间与人员一览（只读）。成员管理（改角色、移出、邀请、额度分配）请进入对应空间的成员管理页。
          </p>
        </div>
        <button
          onClick={() => loadOverview(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-[#3182ce]/50 text-slate-600 hover:text-[#3182ce] text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "参与的企业空间", value: overviews.length, icon: <Building2 className="w-4 h-4 text-[#3182ce]" /> },
          { label: "覆盖成员总数", value: totalMembers, icon: <Users className="w-4 h-4 text-emerald-600" /> },
          { label: "我可管理的空间", value: managedCount, icon: <Building className="w-4 h-4 text-amber-600" /> },
        ].map((c, i) => (
          <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              {c.icon}
              {c.label}
            </div>
            <p className="text-2xl font-black text-slate-800 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* 空间卡片 */}
      {overviews.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl py-20 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto shadow-inner">
            <Inbox className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-700">暂无企业空间</h4>
          <p className="text-xs text-slate-400">创建企业空间后，这里会展示团队人员总览。</p>
          <button
            onClick={() => router.push("/workspace-hub")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            前往空间中枢创建
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {overviews.map((o) => {
            const meta = roleMeta(o.role);
            const expanded = expandedWsId === o.id;
            return (
              <div key={o.id} className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                <button
                  onClick={() => setExpandedWsId(expanded ? "" : o.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 hover:bg-slate-50/60 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#10b981] flex items-center justify-center text-white shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{o.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {o.members.length} 名成员 · 我的角色：
                        <span className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${meta.badge}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(o.role === "OWNER" || o.role === "ADMIN") && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/workspace/${o.id}?tab=members`);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        成员管理
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                    <ArrowRight className={`w-4 h-4 text-slate-300 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {o.members.length === 0 ? (
                      <p className="px-5 py-6 text-xs text-slate-400 text-center">无法读取成员列表（可能不是该空间在册成员）</p>
                    ) : (
                      o.members.map((m) => {
                        const rm = roleMeta(m.role);
                        const isSelf = m.userId === myUserId;
                        return (
                          <div key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-[#3182ce] flex items-center justify-center text-white text-[10px] font-black overflow-hidden shrink-0">
                                {m.avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                                ) : (
                                  (m.name || "G").charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate flex items-center gap-1.5">
                                  {m.name}
                                  {isSelf && <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">我</span>}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">{m.email || "未绑定邮箱"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[10px] text-slate-400 hidden sm:inline">{formatDate(m.joinedAt)} 加入</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${rm.badge}`}>
                                {rm.icon}
                                {rm.label}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
