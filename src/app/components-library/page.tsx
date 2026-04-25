"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import {
  Search,
  Filter,
  Grid3X3,
  List,
  ArrowLeft,
  Package,
  Eye,
  TrendingUp,
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description: string;
  type: string;
  icon: string;
  category: string;
  tags: string;
  usageCount: number;
  createdAt: string;
}

export default function ComponentsLibraryPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<Component[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    category: "",
  });
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    loadComponents();
  }, []);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/components");
      
      if (res.ok) {
        const data = await res.json();
        setComponents(data.data.components);
        setTypes(data.data.types);
        setCategories(data.data.categories.filter(Boolean));
      } else {
        toast.error("加载组件失败");
      }
    } catch (error) {
      console.error("Load components error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const filteredComponents = components.filter((component) => {
    const matchSearch = filters.search
      ? component.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        component.description?.toLowerCase().includes(filters.search.toLowerCase())
      : true;
    
    const matchType = filters.type ? component.type === filters.type : true;
    const matchCategory = filters.category ? component.category === filters.category : true;
    
    return matchSearch && matchType && matchCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-xl font-bold text-slate-800">组件库</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-[#3182ce]/10 text-[#3182ce]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Grid3X3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-[#3182ce]/10 text-[#3182ce]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 筛选栏 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件名称或描述..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters({ ...filters, type: e.target.value })
            }
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="">全部阶段</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="">全部分类</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* 统计信息 */}
        <div className="mb-6 flex items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            共 {filteredComponents.length} 个组件
          </span>
          <span className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            仅显示已上架组件
          </span>
        </div>

        {/* 组件列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredComponents.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">暂无组件</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredComponents.map((component) => (
              <div
                key={component.id}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-[#3182ce]/30 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-2xl flex-shrink-0">
                    {component.icon || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 mb-1 group-hover:text-[#3182ce] transition-colors truncate">
                      {component.name}
                    </h3>
                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {component.description}
                    </p>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-[#3182ce]/10 text-[#3182ce] rounded text-xs font-bold">
                        {component.category || "通用"}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                        {component.type.split("：")[0]}
                      </span>
                    </div>
                    {component.tags && (
                      <div className="flex flex-wrap gap-1">
                        {component.tags.split(",").slice(0, 3).map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-xs"
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        使用 {component.usageCount || 0} 次
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredComponents.map((component) => (
              <div
                key={component.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-lg hover:border-[#3182ce]/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-xl flex-shrink-0">
                    {component.icon || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                      {component.name}
                    </h3>
                    <p className="text-sm text-slate-600 truncate">
                      {component.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="px-3 py-1 bg-[#3182ce]/10 text-[#3182ce] rounded-full text-xs font-bold">
                      {component.category || "通用"}
                    </span>
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {component.usageCount || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
