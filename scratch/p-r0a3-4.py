# -*- coding: utf-8 -*-
# R0-A3 C4：两个 UpgradeModal 统一状态判断（真实免费才显示成功，无 payUrl/free 不得当已开通）
import io

# ── studio/UpgradeModal.tsx ──
p = "src/components/studio/UpgradeModal.tsx"
s = io.open(p, encoding="utf-8").read()

old = """      const data = await res.json();
      if (res.ok && data.success) {
        // 付费套餐：跳转收银台完成支付，支付成功后服务端才真正开通
        if (data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }
        toast.success(data.message || "空间升级成功！");
        onSuccess?.();
        onClose();
        return;
      }
      toast.error(data.message || data.error || "升级失败，请稍后重试");"""
new = """      const data = await res.json();
      if (res.ok && data.success) {
        // [R0-A3 C4] 后端成功且有 payUrl → 待支付：跳转收银台，不写已开通标记、不触发完成回调
        if (data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }
        // [R0-A3 C4] 仅后端明确 free===true 才视为真实免费开通完成
        if (data.free === true) {
          toast.success(data.message || "空间升级成功！");
          onSuccess?.();
          onClose();
          return;
        }
        // [R0-A3 C4] success:true 但缺 payUrl/free → 待处理/异常响应，不当已开通
        toast.info(data.message || "升级请求已受理，请稍后确认结果");
        return;
      }
      // [R0-A3 C4] success:false 或 HTTP 错误：显示错误说明
      toast.error(data.message || data.error || "升级失败，请稍后重试");"""
assert old in s, "studio modal"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("studio modal OK")

# ── workspace-hub/modals/UpgradeModal.tsx ──
p = "src/components/workspace-hub/modals/UpgradeModal.tsx"
s = io.open(p, encoding="utf-8").read()

old = """      const data = await res.json();
      if (res.ok && data.success) {
        // 付费套餐：跳转到收银台完成支付，支付成功后服务端才会真正开通企业空间
        if (data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }
        // 免费套餐：无需支付，直接开通
        toast.success(data.message || "空间升级成功！");

        // 写入客户端 localStorage 升级标记
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        if (option === "retain") {
          localStorage.setItem("upgradeMode", "parallel");
        } else if (option === "upgrade") {
          // 原地升级：个人空间直接转企业，不新建、不删除
          localStorage.setItem("upgradeMode", "relabel");
        } else if (option === "delete") {
          // 迁移模式：原个人空间转为只读归档（非删除）
          localStorage.setItem("upgradeMode", "migrate");
          localStorage.setItem("personalWorkspaceArchived", "true");
        }

        onUpgradeSuccess();
        onClose();
      } else {
        toast.error(data.message || data.error || "升级失败，请重试");
      }"""
new = """      const data = await res.json();
      if (res.ok && data.success) {
        // [R0-A3 C4] 后端成功且有 payUrl → 待支付：跳转收银台，不写已开通标记、不触发完成回调
        if (data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }
        // [R0-A3 C4] 仅后端明确 free===true 才视为真实免费开通完成
        if (data.free === true) {
          toast.success(data.message || "空间升级成功！");

          // 写入客户端 localStorage 升级标记（仅真实免费开通时）
          localStorage.setItem("personalWorkspaceUpgraded", "true");
          if (option === "retain") {
            localStorage.setItem("upgradeMode", "parallel");
          } else if (option === "upgrade") {
            localStorage.setItem("upgradeMode", "relabel");
          } else if (option === "delete") {
            localStorage.setItem("upgradeMode", "migrate");
            localStorage.setItem("personalWorkspaceArchived", "true");
          }

          onUpgradeSuccess();
          onClose();
          return;
        }
        // [R0-A3 C4] success:true 但缺 payUrl/free → 待处理/异常响应，不当已开通
        toast.info(data.message || "升级请求已受理，请稍后确认结果");
        return;
      }
      // [R0-A3 C4] success:false 或 HTTP 错误：显示错误说明
      toast.error(data.message || data.error || "升级失败，请重试");"""
assert old in s, "hub modal"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("hub modal OK")
