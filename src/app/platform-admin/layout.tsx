import { redirect } from "next/navigation";

export default function PlatformAdminLayout() {
  redirect("/admin");
  return null;
}
