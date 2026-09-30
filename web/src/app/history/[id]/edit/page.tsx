import { notFound } from "next/navigation";
import ExaminationWizard from "@/components/clinical/ExaminationWizard";
import { requireRole } from "@/server/auth/session";
import { getExamination } from "@/server/examinations/repository";

export const dynamic = "force-dynamic";

export default async function EditExaminationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("clinician", "organization_owner");
  const { id } = await params;
  const examination = await getExamination(id, session.user);
  if (!examination) notFound();
  return <ExaminationWizard initialExamination={examination} />;
}
