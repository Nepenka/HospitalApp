import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { getOrganization, listOrganizationMembers } from "@/server/identity/store";
import { TeamConsole } from "./team-console";
import styles from "./organization.module.css";
import { getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const [session, locale] = await Promise.all([requireRole("organization_owner"), getLocale()]);
  if (!session.user.organizationId) throw new Error("Organization is missing from the session");
  const [organization, members] = await Promise.all([getOrganization(session.user.organizationId), listOrganizationMembers(session.user.organizationId)]);
  if (!organization) throw new Error("Organization not found");
  return <main className={styles.page}><header><div><p>АнаФикс · {locale === "en" ? "Organization" : "Организация"}</p><h1>{organization.name}</h1><span>{locale === "en" ? "Manage individual clinician accounts" : "Управление персональными учётными записями врачей"}</span></div><Link href="/">← {locale === "en" ? "Examinations" : "К осмотрам"}</Link></header><TeamConsole members={members} /></main>;
}
