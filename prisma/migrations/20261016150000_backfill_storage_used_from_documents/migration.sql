-- 存量数据回填：空间文件存储用量（storageUsed）
-- 统计口径与运行时记账一致：document 表中真实文件字节数（file_size）按空间汇总。
-- 运行时已在「资料上传 / 资料删除 / 空间数据重置」三条链路维护该字段，本迁移只对齐历史数据。

UPDATE workspacequota q
LEFT JOIN (
  SELECT workspaceId, SUM(file_size) AS total_size
  FROM document
  WHERE file_size IS NOT NULL
    AND file_size > 0
  GROUP BY workspaceId
) d ON d.workspaceId = q.workspaceId
SET q.storageUsed = COALESCE(d.total_size, 0);
