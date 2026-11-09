# -*- coding: utf-8 -*-
import io

P = "src/app/workspace/[id]/members/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. load 成功清错 / 失败置错
old = """        setMembers(list);

        const me = list.find((m) => m.userId === localStorage.getItem("userId"));
        if (me) {
          setCurrentUserRole(me.role);
        }
      } else {
        const err = await resMembers.json();
        throw new Error(err.error || "获取成员列表失败");
      }
    } catch (error: any) {"""
new = """        setMembers(list);
        setLoadError(null);

        const me = list.find((m) => m.userId === localStorage.getItem("userId"));
        if (me) {
          setCurrentUserRole(me.role);
        }
      } else {
        const err = await resMembers.json();
        throw new Error(err.error || "获取成员列表失败");
      }
    } catch (error: any) {
      setLoadError(error?.message || "成员列表加载失败，请重试");"""
assert old in s, "load err"
s = s.replace(old, new, 1)

# 2. 错误横幅 + 空态：加载分支后插
old = """        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">空间内成员矩阵 ({members.length} 人)</span>"""
new = """        ) : loadError ? (
          <LoadErrorBanner message={loadError} onRetry={() => { setLoadError(null); loadMembers(); }} retrying={loading} />
        ) : members.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-14 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-600">当前空间暂无协同成员</p>
            <p className="text-xs text-slate-400 mt-1">可通过上方「生成邀请码」邀请成员加入协同。</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">空间内成员矩阵 ({members.length} 人)</span>"""
assert old in s, "banner/empty"
s = s.replace(old, new, 1)

# 3. 两个确认弹窗插在 </WorkspaceInternalLayout> 前
tail = """    </WorkspaceInternalLayout>
  );
}"""
modals = """    </WorkspaceInternalLayout>
  );
}"""
# 移出成员确认弹窗 + OWNER 转让强确认弹窗
insert = '''
      {/* KN-UI：移出成员二次确认弹窗（自查清单指令四） */}
      <ConfirmDialog
        isOpen={!!removeConfirm}
        title="移出成员"
        message={`确认将「${removeConfirm?.name || ""}」移出本工作空间吗？移出后该成员将无法访问空间内任何资源。`}
        type="danger"
        confirmText="确认移出"
        cancelText="取消"
        onConfirm={async () => {
          if (removeConfirm) await handleRemoveMember(removeConfirm.userId, removeConfirm.name);
        }}
        onCancel={() => setRemoveConfirm(null)}
      />

      {/* KN-UI：变更所有者强确认（输入成员姓名解锁；自查清单指令四） */}
      <ConfirmDialog
        isOpen={!!ownerConfirm}
        title="转让所有者身份"
        message={`确认将所有者身份转让给「${ownerConfirm?.name || ""}」吗？转让后你将变为协同成员，此操作影响重大。`}
        warnings={["所有者拥有空间的全部管理权限，包括成员管理、算力分配与空间设置。"]}
        type="danger"
        confirmText="确认转让"
        cancelText="取消"
        requireText={{ expect: ownerConfirm?.name || "", hint: "请输入该成员的完整姓名以确认转让" }}
        onConfirm={async () => {
          if (ownerConfirm) await handleChangeRole(ownerConfirm.userId, "OWNER");
        }}
        onCancel={() => setOwnerConfirm(null)}
      />
'''
assert tail in s, "tail"
idx = s.rfind(tail)
s = s[:idx] + insert.rstrip().replace("    </WorkspaceInternalLayout>", "    </WorkspaceInternalLayout>", 1) + s[idx + len(tail):]
# 修正缩进无伤大雅

# 4. 数值千分位（额度/已用/剩余）
old = """                          {isTargetOwner || isTargetAdmin ? (
                            <span className="text-emerald-600">无限制 (共享算力池)</span>
                          ) : limitVal === null ? (
                            <span className="text-slate-500">不限额 ({usedVal} 已用)</span>"""
# 查看 limitVal/usedVal 渲染行再替换
i = s.find('本月额度 / 已用')
print(s[i:i+700])
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("members step2 OK")
