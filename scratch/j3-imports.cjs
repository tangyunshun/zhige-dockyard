// 临时脚本：R0-J3 handler 导入更新
const fs = require("fs");
const p = "src/app/api/studio/handler.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  'import { saveAssetFile, deleteAssetFile, readAssetFile } from "@/lib/file-store";',
  'import { saveAssetFile, deleteAssetFile, readAssetFile, allocateObjectKey, saveAssetFileToKey } from "@/lib/file-store";'
);
s = s.replace(
  `  deleteDocumentsAndReleaseStorage,
  persistOrphanCleanupLead,
  confirmStorageOperation,`,
  `  claimObjectCleanup,
  finalizeObjectCleanup,
  closeClaimWithoutRelease,
  countOtherReferences,
  releaseReservationAtomic,
  confirmStorageOperation,`
);
fs.writeFileSync(p, s);
console.log("imports updated:", /claimObjectCleanup/.test(s), /allocateObjectKey/.test(s));
