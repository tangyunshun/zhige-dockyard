"use client";

import { useState, useEffect } from "react";
import { Key, Trash2, Search, Clock, Shield, AlertCircle } from "lucide-react";

interface ApiKey {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
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

interface ApiKeyData {
  apiKeys: ApiKey[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminApiKeysPage() {
  const [apiKeyData, setApiKeyData] = useState<ApiKeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys(currentPage);
  }, [currentPage]);

  const loadApiKeys = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      const res = await fetch(`/api/admin/api-keys?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载 API 密钥失败");

      const result = await res.json();
      setApiKeyData(result.data);
    } catch (error) {
      console.error("Load API keys error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个 API 密钥吗？此操作不可恢复！")) {
      return;
    }

    try {
      setDeletingId(id);
      const res = await fetch("/api/admin/api-keys", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("删除失败");

      await loadApiKeys(currentPage);
      alert("API 密钥已删除");
    } catch (error) {
      console.error("Delete API key error:", error);
      alert("删除失败，请重试");
    } finally {
      setDeletingId(null);
    }
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
        <h1 className="text-2xl font-bold text-slate-800 mb-2">API 密钥管理</h1>
        <p className="text-sm text-slate-500">
          查看和管理用户的 API 访问密钥
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总密钥数</div>
            <Key className="w-5 h-5 text-[#3182ce]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {apiKeyData?.total || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">活跃密钥</div>
            <Shield className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">--</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">今日调用</div>
            <Clock className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">--</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索密钥名称、用户..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
            />
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载密钥列表中...</p>
            </div>
          </div>
        ) : apiKeyData?.apiKeys.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Key className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无 API 密钥数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    密钥信息
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    密钥前缀
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    最后使用
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {apiKeyData?.apiKeys.map((apiKey) => (
                  <tr key={apiKey.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          {apiKey.name}
                        </div>
                        {apiKey.description && (
                          <div className="text-xs text-slate-500 mt-1">
                            {apiKey.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {apiKey.user.avatar ? (
                          <img
                            src={apiKey.user.avatar}
                            alt={apiKey.user.name || ""}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                            {apiKey.user.name?.charAt(0) ||
                              apiKey.user.email?.charAt(0) ||
                              "?"}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {apiKey.user.name || "未知用户"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {apiKey.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-600">
                        {apiKey.keyPrefix}••••••••
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {apiKey.lastUsedAt ? (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          {formatTimeAgo(apiKey.lastUsedAt)}
                        </div>
                      ) : (
                        <span className="text-slate-400">从未使用</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatTimeAgo(apiKey.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(apiKey.id)}
                        disabled={deletingId === apiKey.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="删除密钥"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {apiKeyData && apiKeyData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {apiKeyData.total} 条记录，第 {apiKeyData.page} /{" "}
              {apiKeyData.totalPages} 页
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
                  setCurrentPage((p) => Math.min(apiKeyData.totalPages, p + 1))
                }
                disabled={currentPage === apiKeyData.totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-bold mb-1">安全提示</p>
            <ul className="list-disc list-inside space-y-1">
              <li>API 密钥具有完整的 API 访问权限，请谨慎管理</li>
              <li>删除的密钥将无法恢复，用户需要重新生成</li>
              <li>建议定期审查长期未使用的密钥</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
