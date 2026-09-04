"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import CompleteOAuthProfileModal from "@/components/workspace-hub/modals/CompleteOAuthProfileModal";

/**
 * 全局第三方登录用户完善资料引导。
 *
 * 触发逻辑：
 * 1. OAuth/扫码登录成功后的回调页（/auth/oauth-callback）在首次登录时写入
 *    sessionStorage.show_oauth_profile_modal = "true"。
 * 2. 本组件检测到当前用户 needsProfileCompletion 且 flag 存在时，立即弹窗。
 * 3. 弹窗只会因本次首次登录触发一次；用户关闭后降级为 AvatarDropdown 中的提示卡片。
 * 4. 用户保存成功后调用 refreshUserState，needsProfileCompletion 变为 false，
 *    弹窗与提示卡片同时消失。
 */
export default function OAuthProfilePrompt() {
  const { userState, refreshUserState } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userState.isLoggedIn || !userState.userInfo?.needsProfileCompletion) {
      setIsOpen(false);
      return;
    }

    const shouldShow = sessionStorage.getItem("show_oauth_profile_modal") === "true";
    if (shouldShow) {
      // 立即消费 flag，避免刷新页面后重复弹窗
      sessionStorage.removeItem("show_oauth_profile_modal");
      setIsOpen(true);
    }
  }, [userState.isLoggedIn, userState.userInfo?.needsProfileCompletion]);

  if (!userState.isLoggedIn || !userState.userInfo?.needsProfileCompletion) {
    return null;
  }

  const handleSuccess = async () => {
    await refreshUserState();
    setIsOpen(false);
  };

  return (
    <CompleteOAuthProfileModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      currentUser={userState.userInfo}
      onSuccess={handleSuccess}
    />
  );
}
