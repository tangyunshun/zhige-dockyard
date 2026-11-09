# -*- coding: utf-8 -*-
# settings/permissions 页：真实角色门禁（OWNER/ADMIN 才可编辑；成员只读+提示）+ 失败横幅 + console 清理
import io

P = "src/app/workspace/[id]/settings/permissions/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 权限检查：调 workspacemember 真实角色（/api/workspace/update 返回 workspace.ownerId + 当前用户）
old = """        if (typeRes.ok) {
          const typeData = await typeRes.json();
          if (typeData?.workspace?.type === "PERSONAL") {
            setIsPersonalSpace(true);
            return;
          }
        }
        setWorkspaceType('enterprise');
        setUserRole('Owner');
        await loadWorkspacePosts();"""
new = """        let isOwnerOrAdmin = false;
        if (typeRes.ok) {
          const typeData = await typeRes.json();
          if (typeData?.workspace?.type === "PERSONAL") {
            setIsPersonalSpace(true);
            return;
          }
          // KN-SEC：真实角色门禁——仅空间所有者/管理员可编辑岗位权限（自查清单：前端隐藏+后端双校验）
          const wsOwnerId = typeData?.workspace?.ownerId;
          const meRes = await fetch(`/api/workspace/members?workspaceId=${workspaceId}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json().catch(() => ({}));
            const me = (meData.members || meData.data?.members || []).find(
              (x: { userId?: string }) => x.userId === (typeData?.user?.id || localStorage.getItem("userId"))
            );
            const myRole = (me?.role || "").toUpperCase();
            isOwnerOrAdmin = wsOwnerId === localStorage.getItem("userId") || myRole === "ADMIN" || myRole === "OWNER";
            setUserRole(
              wsOwnerId === localStorage.getItem("userId")
                ? 'Owner'
                : myRole === "ADMIN"
                  ? 'Admin'
                  : 'Member'
            );
          }
        }
        setWorkspaceType('enterprise');
        if (!isOwnerOrAdmin) {
          // KN-SEC：普通成员不渲染编辑矩阵与保存入口（只读提示）
          setIsPersonalSpace(true);
          return;
        }
        await loadWorkspacePosts();"""
assert old in s, "perm check"
s = s.replace(old, new, 1)

# 2. loadWorkspacePosts 失败横幅
old = """        } catch (e) {
          console.warn("[岗位权限页] 岗位列表加载失败:", e);
        }"""
new = """        } catch (e) {
          setLoadErrorPosts("岗位列表加载失败，请重试");
        }"""
if old not in s:
    # fallback：定位 loadWorkspacePosts 的 catch
    import re
    m = re.search(r"console\.warn\(\"(\[岗位权限页\][^\"]*)\"", s)
    print("warn anchor:", m.group(1) if m else "not found")
else:
    s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("permissions gating OK")
