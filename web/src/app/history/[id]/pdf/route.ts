import { NextResponse } from "next/server";
import { readSession } from "@/server/auth/session";
import { getExamination } from "@/server/examinations/repository";
import { createExaminationPdf } from "@/server/pdf/examination-report";
import { recordExaminationExport } from "@/server/security/export-audit";
import { getLocale } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session || session.user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const examination = await getExamination(id, session.user);
  if (!examination) return new NextResponse("Not found", { status: 404 });
  try {
    const pdf = await createExaminationPdf(examination, await getLocale());
    await recordExaminationExport("pdf", examination.id, session.user);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="examination-${examination.id}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Export unavailable", { status: 503 });
  }
}
