import { redirect } from "next/navigation";

// 该路由统一重定向至 /studio
export default function MarketPagePlaceholder() {
  redirect("/studio");
}

