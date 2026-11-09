// 临时脚本：upload_doc 清理协议重排
const fs = require("fs");
const p = "src/app/api/studio/handler.ts";
let s = fs.readFileSync(p, "utf8");

// ── 1. multipart 保存段：拆分预留/保存/确认，失败按协议处理 ──
const oldSave = `      // [R0-J S03] multipart 物理文件：原子预留 → 保存 → 提取；失败统一清理（文件+预留）
      // [R0-J S01] JSON 文本兼容路径没有物理文件：不预留、不按客户端伪造 fileSize 入账
      if (isMultipart && uploadBufferForSave) {
        const storageOpId = crypto.randomUUID();
        let reserved = false;
        let saved: { filePath: string; size: number; mimeType: string } | null = null;
        try {
          await reserveStorageBytes(targetWorkspaceId, uploadBufferForSave.length, storageOpId);
          reserved = true;
          saved = await saveAssetFile(targetWorkspaceId, originalName || title, uploadBufferForSave, fileExt);
          filePath = saved.filePath;
          fileSize = saved.size;
          mimeType = saved.mimeType;
          // 统一走可取消超时入口：超时会真正终止 OCR worker，避免资料导入卡死
          content = await extractTextFromBufferWithTimeout(uploadBufferForSave, originalName || "", uploadFileType || "", TEXT_EXTRACT_TIMEOUT_MS);
        } catch (flowErr) {
          // 失败清理：删除已保存文件并释放预留；文件删除失败则保留预留并返回可追踪 opId
          let fileDeleted = false;
          if (saved?.filePath) {
            const del = await deleteAssetFile(saved.filePath);
            fileDeleted = del.ok;
          }
          if (reserved && (fileDeleted || !saved?.filePath)) {
            await releaseStorageBytes(targetWorkspaceId, saved?.size ?? uploadBufferForSave.length);
          }
          if (flowErr instanceof StorageQuotaError) {
            return NextResponse.json({ success: false, code: flowErr.code, error: flowErr.message, storageOpId }, { status: flowErr.status });
          }
          if (flowErr instanceof StorageQuotaError === false && fileDeleted === false && saved?.filePath) {
            return NextResponse.json({
              success: false,
              code: "STORAGE_CLEANUP_PENDING",
              error: "上传失败且临时文件清理未完成，已保留占用与恢复信息，请稍后重试或联系管理员。",
              storageOpId,
            }, { status: 500 });
          }
          if (flowErr instanceof ContractValidationError) throw flowErr;
          return NextResponse.json({ success: false, error: (flowErr as Error)?.message || "文件处理失败，请稍后重试" }, { status: 500 });
        }
      }`;
const newSave = `      // [R0-J S03 + R0-J1 J-UPLOAD] multipart 物理文件：预留 → 保存 → 确认 → doc.create 全在同一清理协议内
      // [R0-J S01] JSON 文本兼容路径没有物理文件：不预留、不按客户端伪造 fileSize 入账
      const storageOpId = crypto.randomUUID();
      let reserved = false;
      let saved: { filePath: string; size: number; mimeType: string } | null = null;
      let saveAttempted = false;
      if (isMultipart && uploadBufferForSave) {
        try {
          await reserveStorageBytes(targetWorkspaceId, uploadBufferForSave.length, storageOpId);
          reserved = true;
          saved = await saveAssetFile(targetWorkspaceId, originalName || title, uploadBufferForSave, fileExt);
          saveAttempted = true;
          filePath = saved.filePath;
          fileSize = saved.size;
          mimeType = saved.mimeType;
        } catch (flowErr) {
          // [R0-J1 B2] saved=null 不代表没有对象：底层写入可能已产生字节（未知保存结果）
          if (saveAttempted && saved?.filePath) {
            const del = await deleteAssetFile(saved.filePath);
            if (del.ok && reserved) await releaseStorageBytes(targetWorkspaceId, saved.size);
          }
          // [R0-J1 B2] 保存结果未知 → 不释放；持久化 PENDING_CLEANUP 状态
          if (!saveAttempted || !saved?.filePath) {
            await markStorageOperationPendingCleanup(storageOpId, "保存结果未知: " + (flowErr as Error)?.message);
            return NextResponse.json({ success: false, code: "STORAGE_OP_PENDING", error: "上传失败且保存结果未知，已保留占用与恢复信息（操作 ID: " + storageOpId + "），请勿重复上传。", storageOpId }, { status: 500 });
          }
          if (flowErr instanceof StorageQuotaError) {
            return NextResponse.json({ success: false, code: flowErr.code, error: flowErr.message, storageOpId }, { status: flowErr.status });
          }
          if (flowErr instanceof ContractValidationError) throw flowErr;
          return NextResponse.json({ success: false, error: (flowErr as Error)?.message || "文件处理失败，请稍后重试" }, { status: 500 });
        }
      }`;
if (!s.includes(oldSave)) throw new Error("old save block not found");
s = s.replace(oldSave, newSave, 1);

// ── 2. doc.create + 单次解析 移入清理协议 ──
const oldDoc = `      // 真实文件元信息：fileSize 取文件真实字节数（仅接受正整数），
      // fileExt 规范化为小写无点扩展名，summary 为前端基于原文生成的智能总结。
      const normalizedFileSize =
        typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize > 0
          ? Math.round(fileSize)
          : null;
      const normalizedFileExt =
        typeof fileExt === "string" && fileExt.trim()
          ? fileExt.trim().toLowerCase().replace(/^\\./, "").slice(0, 32)
          : null;
      const normalizedSummary =
        typeof summary === "string" && summary.trim() ? summary.trim() : null;

      const doc = await prisma.document.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: targetWorkspaceId,
          title,
          content: content || "",
          type: type || "doc",
          status: initialStatus,
          uploaderId: userId,
          visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          fileSize: normalizedFileSize,
          fileExt: normalizedFileExt,
          summary: normalizedSummary,
          filePath,
          mimeType,
          originalName,
          updatedAt: new Date(),
        },
      });

      // [R0-J S02] 存储占用已在原子预留段入账（文档创建 = 确认记录），此处不再重复累加。
      // 资料上传同样需要留痕审计`;
const newDoc = `      // [R0-J1 J-UPLOAD] doc.create 纳入清理协议：单次解析 + normalized + 创建 + 确认
      try {
        if (isMultipart && uploadBufferForSave && !content) {
          // [R0-J1 B5] 单次解析（去重）：鉴权/容量准入后仅此一次
          content = await extractTextFromBufferWithTimeout(uploadBufferForSave, originalName || "", uploadFileType || "", TEXT_EXTRACT_TIMEOUT_MS);
          if (!summary) summary = generateSmartSummary(content, originalName).overview;
        }
        // [R0-J1 B6] multipart 0 字节文件保留 0（不归一为未知）；JSON 文本路径 fileSize 恒 null
        const normalizedFileSize =
          isMultipart && saved
            ? saved.size
            : (typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize > 0 ? Math.round(fileSize) : null);
        const normalizedFileExt =
          typeof fileExt === "string" && fileExt.trim()
            ? fileExt.trim().toLowerCase().replace(/^\\./, "").slice(0, 32)
            : null;
        const normalizedSummary =
          typeof summary === "string" && summary.trim() ? summary.trim() : null;

        doc = await prisma.document.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: targetWorkspaceId,
            title,
            content: content || "",
            type: type || "doc",
            status: initialStatus,
            uploaderId: userId,
            visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
            fileSize: normalizedFileSize,
            fileExt: normalizedFileExt,
            summary: normalizedSummary,
            filePath,
            mimeType,
            originalName,
            updatedAt: new Date(),
          },
        });
        if (storageOpId && saved) await confirmStorageOperation(storageOpId, saved.filePath, doc.id);
      } catch (docErr) {
        // [R0-J1 J-UPLOAD] doc.create/确认失败 → 清理文件 + 释放预留（或保留 PENDING_CLEANUP）
        let fileDeleted = false;
        if (saved?.filePath) {
          const del = await deleteAssetFile(saved.filePath);
          fileDeleted = del.ok;
        }
        if (reserved && fileDeleted) {
          await releaseStorageBytes(targetWorkspaceId, saved?.size ?? 0);
        }
        if (!fileDeleted && saved?.filePath) {
          await markStorageOperationPendingCleanup(storageOpId, "doc.create 失败且文件清理未完成");
          return NextResponse.json({ success: false, code: "STORAGE_CLEANUP_PENDING", error: "上传失败且清理未完成，已保留占用与恢复信息（操作 ID: " + storageOpId + "）。", storageOpId }, { status: 500 });
        }
        return NextResponse.json({ success: false, error: (docErr as Error)?.message || "资料创建失败，请稍后重试" }, { status: 500 });
      }

      // 资料上传同样需要留痕审计`;
if (!s.includes(oldDoc)) throw new Error("old doc block not found");
s = s.replace(oldDoc, newDoc, 1);

// ── 3. 变量声明调整（doc / saved / saveAttempted / storageOpId 在外层） ──
s = s.replace(
`      let uploadBufferForSave: Buffer | null = null; // [R0-J] multipart 待保存物理内容（鉴权/预留后落盘）
      let uploadFileType = "";`,
`      let uploadBufferForSave: Buffer | null = null; // [R0-J] multipart 待保存物理内容（鉴权/预留后落盘）
      let uploadFileType = "";
      let doc: any = null; // [R0-J1] doc 提升到外层（清理协议引用）`);

fs.writeFileSync(p, s);
console.log("upload_doc restructured");
