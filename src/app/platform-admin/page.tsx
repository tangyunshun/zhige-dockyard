import { redirect } from "next/navigation";

export default function PlatformAdminPage() {
  redirect("/admin");
  return null;
}
