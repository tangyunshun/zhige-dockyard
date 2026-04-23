"use client";

import { useState, useEffect } from "react";
import { Settings, Search, Cpu, Sliders } from "lucide-react";

interface UserPreference {
  id: string;
  userId: string;
  aiEngine: string;
  systemPrompt?: string | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface PreferenceData {
  preferences: UserPreference[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminPreferencesPage() {
  const [preferenceData, setPreferenceData] = useState<PreferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadPreferences(currentPage);
  }, [currentPage]);

  const loadPreferences = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      const res = await fetch(`/api/admin/preferences?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载偏好设置失败");

      const result = await res.json();
      setPreferenceData(result.data);
    } catch (error) {
      console.error("Load preferences error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEngineBadge = (engine: string) => {
    const badges: Record<string, string> = {
      zhige: "bg-blue-100 text-blue-700",
      openai: "bg-green-100 text-green-700",
      azure: "bg-purple-100 text-purple-700",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-bold ${badges[engine] || "bg-slate-100 text-slate-700"}`}
      >
        {engine.toUpperCase()}
      </span>
    );
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "刚刚";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">用户偏好管理</h1>
        <p className="text-sm text-slate-500">AI 引擎配置与模型偏好设置</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总用户数</div>
            <Settings className="w-5 h-5 text-[#3182ce]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {preferenceData?.total || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">知阁引擎</div>
            <Cpu className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {preferenceData?.preferences.filter((p) => p.aiEngine === "zhige").length || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">OpenAI</div>
            <Sliders className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {preferenceData?.preferences.filter((p) => p.aiEngine === "openai").length || 0}
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载偏好设置中...</p>
            </div>
          </div>
        ) : preferenceData?.preferences.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无用户偏好数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    AI 引擎
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    默认模型
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Temperature
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Max Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    更新时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {preferenceData?.preferences.map((preference) => (
                  <tr key={preference.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {preference.user.avatar ? (
                          <img
                            src={preference.user.avatar}
                            alt={preference.user.name || ""}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                            {preference.user.name?.charAt(0) ||
                              preference.user.email?.charAt(0) ||
                              "?"}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {preference.user.name || "未知用户"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {preference.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getEngineBadge(preference.aiEngine)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {preference.defaultModel}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-24">
                          <div
                            className="h-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] rounded-full"
                            style={{ width: `${preference.temperature * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-slate-600 w-8">
                          {preference.temperature.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {preference.maxTokens}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatTimeAgo(preference.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {preferenceData && preferenceData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {preferenceData.total} 条记录，第 {preferenceData.page} /{" "}
              {preferenceData.totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                上一页
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(preferenceData.totalPages, p + 1))
                }
                disabled={currentPage === preferenceData.totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
