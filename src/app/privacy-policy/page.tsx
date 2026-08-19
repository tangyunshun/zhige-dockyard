"use client";

import LegalDocumentPage from "@/components/LegalDocumentPage";
import { ShieldCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      category="privacy-policy"
      fallbackTitle="隐私政策"
      notFoundMessage="隐私政策未找到，请联系管理员"
      loadFailedMessage="加载隐私政策失败，请稍后重试"
      icon={<ShieldCheck className="w-6 h-6 md:w-7 md:h-7 text-white" />}
    />
  );
}
