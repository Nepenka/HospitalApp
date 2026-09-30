import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { landingPath, readSession } from "@/server/auth/session";
import { getLocale } from "@/i18n/server";

export default async function ForbiddenPage() {
  const [session, locale] = await Promise.all([readSession(), getLocale()]); const e = locale === "en";
  const destination = session ? landingPath(session.user) : "/login";
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><section><p>{e?"Restricted access":"Доступ ограничен"}</p><h1>{e?"Insufficient permissions":"Недостаточно прав"}</h1><p>{e?"This area is unavailable for your account.":"Эта область недоступна для вашей учётной записи."}</p>{destination !== "/forbidden" && <Link href={destination}>{e?"Go back":"Вернуться"}</Link>}<form action={logoutAction}><button type="submit">{e?"Sign out":"Выйти"}</button></form></section></main>;
}
