import { redirect } from "next/navigation";

/**
 * /components 路由统一重定向至前台组件集市 /studio，杜绝 404 异常
 */
export default function ComponentsRedirectPage() {
  redirect("/studio");
}
