"use client";

import { Filter, X } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number; // 可选：显示该选项的数据数量
}

export interface FilterConfig {
  key: string;
  label: string;
  placeholder?: string;
  options: FilterOption[];
}

interface DataTableFilterProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
  showResetButton?: boolean;
}

export default function DataTableFilter({
  filters,
  values,
  onChange,
  onReset,
  showResetButton = true,
}: DataTableFilterProps) {
  const hasActiveFilters = Object.values(values).some(
    (value) => value !== "all" && value !== ""
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        const currentValue = values[filter.key] || "all";
        const isSelected = currentValue !== "all";

        return (
          <div key={filter.key} className="relative">
            <select
              value={currentValue}
              onChange={(e) => onChange(filter.key, e.target.value)}
              className={`appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#3182ce] text-white border-[#3182ce] shadow-sm"
                  : "bg-white text-slate-700 border-[#e2e8f0] hover:border-[#3182ce]"
              }`}
            >
              {/* 全部选项 */}
              <option value="all">
                {filter.placeholder || `全部${filter.label}`}
              </option>

              {/* 动态生成的选项 */}
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.count !== undefined && ` (${option.count})`}
                </option>
              ))}
            </select>

            {/* 下拉箭头图标 */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                className={`w-4 h-4 transition-transform ${
                  isSelected ? "text-white" : "text-slate-500"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        );
      })}

      {/* 重置按钮 */}
      {showResetButton && hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
        >
          <X className="w-4 h-4" />
          重置筛选
        </button>
      )}
    </div>
  );
}
