"use client";

import { useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { EXPORT_MAX_ROWS } from "@/lib/export-config";

/**
 * 客户端读取「导出条数上限」的实时值（systemconfig.export.maxRows）。
 * - 默认退回编译期常量 5000，加载完成前导出功能即以此兜底，绝不阻塞；
 * - 挂载时拉取一次 /api/export-max-rows，拿到后台设置页写入的值后即时生效；
 * - 任何网络/鉴权失败都静默保留默认值，不影响导出。
 */
export function useExportMaxRows(): number {
  const [maxRows, setMaxRows] = useState<number>(EXPORT_MAX_ROWS);

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    fetch("/api/export-max-rows", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.maxRows === "number" && d.maxRows > 0) {
          setMaxRows(d.maxRows);
        }
      })
      .catch(() => {
        /* 读取失败：保留默认上限 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return maxRows;
}
