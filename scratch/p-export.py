# -*- coding: utf-8 -*-
import io

p = "src/app/workspace-hub/settings/page.tsx"
s = io.open(p, encoding="utf-8").read()

old = """  const handleExportData = () => {
    setLoading(true);
    setTimeout(() => {
      toast.success("数据导出成功，正在下载...");
      setLoading(false);
    }, 1000);
  };"""

new = """  const handleExportData = () => {
    setLoading(true);
    try {
      const exportData = {
        workspace: workspaceData,
        quota: quotaData,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspace-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("数据导出成功，正在下载...");
    } catch (err: any) {
      toast.error(err?.message || "导出失败，请重试");
    } finally {
      setLoading(false);
    }
  };"""

assert old in s, "fake export"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("real export OK")
