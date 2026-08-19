"use client";

import LegalDocumentPage from "@/components/LegalDocumentPage";
import { ScrollText } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      category="terms-of-service"
      fallbackTitle="服务条款"
      notFoundMessage="服务条款未找到，请联系管理员"
      loadFailedMessage="加载服务条款失败，请稍后重试"
      icon={<ScrollText className="w-6 h-6 md:w-7 md:h-7 text-white" />}
    />
  );
}
