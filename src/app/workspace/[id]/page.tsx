"use client";

import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import WorkspaceKickoutGuard from "@/components/WorkspaceKickoutGuard";

export default function WorkspacePage() {
  return (
    <>
      <WorkspaceInternalLayout />
      <WorkspaceKickoutGuard />
    </>
  );
}
