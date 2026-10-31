import { redirect } from "next/navigation";
import ExaminationWizard from "@/components/clinical/ExaminationWizard";
import { requireSession } from "@/server/auth/session";

export default async function HomePage() {
  const session = await requireSession();
  if (session.user.role === "platform_admin") redirect("/admin");
  if (session.user.role === "organization_owner") redirect("/organization");
  if (session.user.role === "billing_admin") redirect("/forbidden");
  return <ExaminationWizard />;
}
