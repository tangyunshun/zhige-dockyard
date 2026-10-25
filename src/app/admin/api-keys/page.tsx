import { notFound } from "next/navigation";

/**
 * 开发者 API Keys 页面已根据管理规范下线废弃
 * 用户或管理员访问将直接呈现 404 页面不存在状态
 */
export default function AdminApiKeysPage() {
  notFound();
}
