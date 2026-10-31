import {redirect} from "next/navigation";
import {readSession,landingPath} from "@/server/auth/session";
import {requiresMfa} from "@/server/auth/mfa";
import {getLocale} from "@/i18n/server";
import {MfaForm} from "./mfa-form";
import styles from "../login/login.module.css";
export default async function MfaPage(){
 const session=await readSession(true);if(!session)redirect("/login");if(!requiresMfa(session.user.role)||session.mfaVerifiedAt)redirect(session.user.mustChangePassword?"/change-password":landingPath(session.user));
 const locale=await getLocale();return <main className={styles.page}><section className={styles.card}><div className={styles.brand}><span>АФ</span><h1>АнаФикс</h1></div><h2>{locale==="en"?"Two-factor authentication":"Двухфакторный вход"}</h2><p>{locale==="en"?"Required for platform and hospital administrators. The verification session expires after 10 minutes.":"Обязательно для администратора платформы и больницы. На подтверждение отведено 10 минут."}</p><MfaForm locale={locale}/></section></main>;
}
