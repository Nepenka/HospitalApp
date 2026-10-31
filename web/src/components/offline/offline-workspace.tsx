"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExaminationWizard from "@/components/clinical/ExaminationWizard";
import { LocaleProvider, useLocale } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import { conclusionLabel, clinicalSystemLabel, diagnosticPresentation, symptomLabel, optionLabel } from "@/i18n/clinical";
import { EncryptedOfflineVault } from "@/client/offline/vault";
import { requestGrant, renewAccess, synchronizeVault, loadServerConflicts } from "@/client/offline/sync";
import { accessAllowed, type LocalExamination, type OfflineVault, type LocalDraft, type ServerConflict } from "@/domain/offline/types";
import type { ExaminationDraft } from "@/domain/examinations/draft";
import { saveLocalDraft, queueOfflineExport } from "@/domain/offline/maintenance";
import { offlineExportText, offlinePdfBlob, downloadOfflinePdf, printOfflineText } from "@/client/offline/export";
import { queueExamination, queueDeletion, resolveConflict } from "@/domain/offline/queue";
import { paginateExaminations } from "@/domain/examinations/history-query";
import { reactionDateLabel } from "@/domain/examinations/annotations";
import type { StoredExamination } from "@/domain/examinations/types";
import { resultSystems } from "@/domain/clinical/types";
import { DateRangePicker } from "@/app/history/date-range-picker";
import styles from "./offline-workspace.module.css";

function failureMessage(error: unknown, e: boolean): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [string, string]> = {
    OFFLINE_POLICY_PENDING: ["Offline-доступ не включён для этой организации или сервера. Согласованы 48 часов доступа и 7 дней хранения синхронизированных копий; требуется настройка.", "Offline access is not enabled for this organization or server. Approved policy: 48 hours access and 7 days for synchronized copies; configuration is required."],
    DRAFT_CONFLICT: ["Черновик изменён в другой вкладке. Эта форма не перезаписала сохранённую версию. Не закрывайте её: сравните данные с сохранённым черновиком.", "Another tab changed this draft. This form did not overwrite the saved version. Keep it open and compare with the saved draft."],
    ONLINE_LOGIN_REQUIRED: ["Войдите по сети под своей учётной записью врача. Очередь сохранена; другой пользователь её отправить не сможет.", "Sign in online with your own clinician account. The queue is retained; another user cannot send it."],
    DIFFERENT_ACCOUNT: ["Локальное хранилище принадлежит другому врачу. Войдите под его учётной записью или используйте отдельный профиль браузера.", "This vault belongs to another clinician. Use that account or a separate browser profile."],
    ACCESS_EXPIRED: ["Offline-доступ истёк или часы компьютера изменены. Подключитесь к сети и разблокируйте хранилище для проверки доступа.", "Offline access expired or the computer clock changed. Reconnect and unlock the vault to verify access."],
    WRONG_PASSPHRASE_OR_DAMAGED_VAULT: ["Неверная парольная фраза или повреждённое хранилище. Данные не удалены.", "Incorrect passphrase or damaged vault. No data was deleted."],
    PASSPHRASE_LENGTH: ["Используйте отдельную парольную фразу длиной от 16 символов, например несколько случайных слов.", "Use a separate passphrase of at least 16 characters, such as several random words."],
    PASSPHRASE_CONFIRMATION: ["Повтор парольной фразы должен совпадать; подтвердите, что это разрешённый компьютер больницы.", "Passphrases must match; confirm that this is an authorized hospital computer."],
    SHELL_NOT_READY: ["Дождитесь подготовки оболочки для запуска без сети.", "Wait for the offline launch shell to be prepared."],
    UNSYNCED_DATA: ["Очистка запрещена: есть черновики, неотправленные осмотры, события экспорта или конфликты без подтверждённого сервером решения.", "Cannot clear the vault: drafts, unsent examinations, export events or unacknowledged conflict decisions remain."],
    RECORD_PENDING: ["Сначала завершите синхронизацию этой записи или разрешите конфликт. Локальные данные сохранены.", "Synchronize this record or resolve its conflict first. Local data is retained."],
    ALGORITHM_REVIEW_REQUIRED: ["Версия клинического алгоритма изменилась. Локальные данные сохранены; нужна проверка перед отправкой.", "The clinical algorithm version changed. Local data is retained and needs review before sending."],
    SERVER_RECORD_DELETED: ["Запись удалена на сервере. Автоматическое восстановление запрещено; локальная версия сохранена в конфликте.", "The server record was deleted. Automatic restoration is forbidden; the local version is retained in the conflict."],
    UNSUPPORTED_BROWSER: ["Нужен современный браузер с Web Crypto, IndexedDB и Web Locks через HTTPS (localhost разрешён для теста).", "A modern browser with Web Crypto, IndexedDB and Web Locks over HTTPS is required (localhost is allowed for testing)."],
    INVALID_INPUT: ["Проверьте обязательные данные, симптомы и диапазоны показателей.", "Check required details, symptoms and vital sign ranges."],
  };
  return messages[code]?.[e ? 1 : 0] ?? (e ? "The operation failed. Saved data and the synchronization queue are retained. Check the connection and available browser storage." : "Операция не выполнена. Сохранённые данные и очередь не удалены. Проверьте связь и свободное место в хранилище браузера.");
}

export function OfflineWorkspace() {
  const initialLocale = useLocale();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  return <LocaleProvider locale={locale}><Workspace locale={locale} setLocale={setLocale} /></LocaleProvider>;
}

function Workspace({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  const e = locale === "en";
  const m = (ru: string, en: string) => e ? en : ru;
  const vault = useRef(new EncryptedOfflineVault());
  const [value, setValue] = useState<OfflineVault | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const unlocked = useRef(false);
  const lockEpoch = useRef(0);
  const publish = useCallback((state: OfflineVault) => { if (unlocked.current) setValue(state); }, []);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"history" | "new" | "details" | "edit">("history");
  const [selected, setSelected] = useState("");
  const [editRecord, setEditRecord] = useState<StoredExamination | undefined>(undefined);
  const [initialDraft, setInitialDraft] = useState<ExaminationDraft>();
  const [draftKey, setDraftKey] = useState("");
  const activeDraft = useRef<Omit<LocalDraft, "snapshot" | "updatedAt"> | null>(null);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const [serverConflicts, setServerConflicts] = useState<ServerConflict[]>([]);
  const onDraft = useCallback((snapshot: ExaminationDraft): Promise<void> => {
    if (!unlocked.current) return Promise.reject(new Error("ACCESS_EXPIRED"));
    const epoch = lockEpoch.current;
    const draft = activeDraft.current ?? { id: crypto.randomUUID(), mode: "new" as const, revision: 0 };
    activeDraft.current = draft;
    const operation = draftWrites.current.then(async () => {
      if (!unlocked.current || epoch !== lockEpoch.current) throw new Error("ACCESS_EXPIRED");
      const updated = await vault.current.mutate(state => saveLocalDraft(state, { ...draft, snapshot, updatedAt: Date.now() }, draft.revision, Date.now()));
      draft.revision += 1;
      publish(updated);
    });
    draftWrites.current = operation;
    return operation;
  }, [publish]);
  const startDraft = (draft?: LocalDraft, record?: StoredExamination) => {
    activeDraft.current = draft ? { id: draft.id, mode: draft.mode, examinationId: draft.examinationId, expectedVersion: draft.expectedVersion, revision: draft.revision } : { id: crypto.randomUUID(), mode: record ? "edit" : "new", examinationId: record?.id, expectedVersion: record?.rowVersion, revision: 0 };
    draftWrites.current = Promise.resolve();
    setDraftKey(activeDraft.current.id); setInitialDraft(draft?.snapshot); setEditRecord(record); setSelected(record?.id ?? draft?.examinationId ?? ""); setView(activeDraft.current.mode);
  };
  const [filters, setFilters] = useState({ search: "", from: "", to: "", page: 1 });
  const lock = useCallback(() => { lockEpoch.current += 1; vault.current.lock(); unlocked.current = false; activeDraft.current = null; setServerConflicts([]); setInitialDraft(undefined); setValue(null); setView("history"); setSelected(""); setEditRecord(undefined); setFilters({ search: "", from: "", to: "", page: 1 }); }, []);
  const perform = useCallback(async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await task(); } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (["ACCESS_EXPIRED", "ONLINE_LOGIN_REQUIRED", "DIFFERENT_ACCOUNT", "INVALID_GRANT", "OFFLINE_POLICY_PENDING"].includes(code)) lock();
      setError(failureMessage(err, locale === "en"));
    } finally { busyRef.current = false; setBusy(false); }
  }, [locale, lock]);
  const sync = useCallback(() => perform(async () => {
    const epoch = lockEpoch.current;
    const progress = (state: OfflineVault) => { if (epoch === lockEpoch.current) publish(state); };
    progress(await synchronizeVault(vault.current, progress));
    setMessage(locale === "en" ? "Synchronization completed. Conflicts, if any, require your decision." : "Синхронизация завершена. Конфликты, если они есть, требуют вашего решения.");
  }), [perform, locale, publish]);
  const syncRef = useRef(sync);
  useEffect(() => { syncRef.current = sync; }, [sync]);

  useEffect(() => {
    const controller = vault.current;
    EncryptedOfflineVault.exists().then(setExists).catch(() => setError("Локальное хранилище недоступно / Local storage unavailable"));
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine && unlocked.current && !busyRef.current) void syncRef.current(); };
    const timer = setTimeout(connection, 0);
    const pageHide = () => lock();
    window.addEventListener("online", connection); window.addEventListener("offline", connection); window.addEventListener("pagehide", pageHide);
    if (process.env.NODE_ENV !== "production") setTimeout(() => setReady(true), 0);
    const workerReady = () => { if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistration("/").then((r) => setReady(Boolean(r?.active && new URL(r.active.scriptURL).pathname === "/offline-worker"))).catch(() => undefined); };
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) { navigator.serviceWorker.ready.then(workerReady).catch(() => undefined); navigator.serviceWorker.addEventListener("controllerchange", workerReady); }
    return () => { clearTimeout(timer); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); window.removeEventListener("pagehide", pageHide); if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", workerReady); controller.lock(); unlocked.current = false; };
  }, [lock]);
  useEffect(() => {
    if (!value) return;
    const timer = setInterval(() => { if (!accessAllowed(value)) { lock(); setError(failureMessage(new Error("ACCESS_EXPIRED"), e)); } }, 10_000);
    return () => clearInterval(timer);
  }, [value, lock, e]);

  const local = value?.records.find((r) => r.record.id === selected);
  const history = useMemo(() => paginateExaminations((value?.records ?? []).filter((r) => !r.record.deletedAt || r.state !== "synced").map(({ record: r }) => ({ id: r.id, patientName: r.patient.fullName, examinedAt: r.examinedAt, probableAllergen: r.probableAllergen, severityGrade: r.severity.grade, diagnosis: r.conclusion.text, anaphylaxisConfirmed: r.conclusion.anyConfirmed })), filters), [value, filters]);
  const todayParts = value ? new Intl.DateTimeFormat("en", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value.access.issuedAt)) : [];
  const todayMap = Object.fromEntries(todayParts.map((p) => [p.type, p.value]));
  const today = value ? `${todayMap.year}-${todayMap.month}-${todayMap.day}` : "2000-01-01";
  const stateLabel = (r: LocalExamination) => r.state === "conflict" ? m("Конфликт версий", "Version conflict") : r.state === "pending" ? (r.record.deletedAt ? m("Удаление ожидает отправки", "Deletion pending") : m("Ожидает отправки", "Pending synchronization")) : m("Синхронизировано", "Synchronized");
  const back = () => { void perform(async () => { if (["new", "edit"].includes(view)) await draftWrites.current; setView("history"); }); };
  const exportRecord = (kind: "copy" | "print" | "pdf") => {
    if(!local || local.record.deletedAt || !window.confirm(m("Документ содержит персональные медицинские данные. Экспорт разрешён только для работы в больнице. Скачанный PDF, печать и буфер обмена не защищены парольной фразой хранилища. Продолжить?","This document contains personal medical data. Export only for authorized hospital work. Downloaded PDFs, printouts and the clipboard are not protected by the vault passphrase. Continue?"))) return;
    void perform(async () => {
      const text = offlineExportText(local,locale);
      const saved = await vault.current.mutate(state => queueOfflineExport(state,{id:crypto.randomUUID(),examinationId:local.record.id,kind,occurredAt:Date.now(),rowVersion:local.record.rowVersion,grant:state.grant},Date.now()));
      publish(saved);
      if(kind === "copy") await navigator.clipboard.writeText(text);
      else if(kind === "print") await printOfflineText(text);
      else downloadOfflinePdf(await offlinePdfBlob(text));
      setMessage(m("Запрос экспорта записан локально. Аудит будет отправлен при синхронизации.","Export request logged locally. The audit will be uploaded during synchronization."));
    });
  };

  return <div className={styles.page}>
    <header className={styles.header}><div><p>АНАФИКС · OFFLINE</p><h1>{m("Работа без интернета", "Offline workspace")}</h1><span>{value ? `${value.access.principal.displayName} · ${online ? m("Сеть доступна", "Connected") : m("Без сети", "Offline")}` : m("Только на компьютере больницы. Локальные данные защищены парольной фразой.", "Hospital computers only. Local data is protected by a passphrase.")}</span></div><div className={styles.actions}><div className={styles.languages} role="group" aria-label={m("Язык интерфейса", "Interface language")}><button aria-pressed={!e} onClick={() => setLocale("ru")}>RU</button><button aria-pressed={e} onClick={() => setLocale("en")}>EN</button></div><a className={styles.secondary} href="/login" onClick={(event) => { if (["new", "edit"].includes(view) && !window.confirm(m("Перейти ко входу? Несохранённая форма будет закрыта.", "Open sign-in? The unsaved form will close."))) { event.preventDefault(); return; } lock(); }}>{m("Вход по сети", "Online sign-in")}</a></div></header>
    {error && <div className={styles.error} role="alert">{error}</div>}{message && <div className={styles.message} role="status">{message}</div>}
    {!value ? <section className={styles.card}><h2>{exists ? m("Разблокировать локальное хранилище", "Unlock local vault") : m("Подключить компьютер больницы", "Enroll hospital computer")}</h2><p>{m("Парольная фраза не отправляется на сервер и не хранится на компьютере. Без неё восстановить локальные данные нельзя. На другом компьютере доступна только уже синхронизированная история.", "The passphrase is neither sent to the server nor stored on this computer. Local data cannot be recovered without it. Another computer can access only synchronized history.")}</p><p>{m("Включение доступно после входа по сети и разрешения организации. Доступ без сети — 48 часов; синхронизированные копии — 7 дней. Черновики и неотправленные данные автоматически не удаляются.", "Enrollment requires online sign-in and organization approval. Access: 48 hours; synchronized copies: 7 days. Drafts and unsent data are never automatically deleted.")}</p>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        const passphrase = String(data.get("passphrase") ?? "");
        void perform(async () => {
          const epoch = lockEpoch.current;
          if (!crypto.subtle || !navigator.locks || !window.indexedDB) throw new Error("UNSUPPORTED_BROWSER");
          let opened: OfflineVault;
          if (exists) {
            await vault.current.unlock(passphrase, navigator.onLine);
            try { opened = navigator.onLine ? await renewAccess(vault.current) : await vault.current.read(); } catch (err) { vault.current.lock(); throw err; }
          } else {
            if (!navigator.onLine) throw new Error("ONLINE_LOGIN_REQUIRED");
            if (data.get("hospital") !== "on" || data.get("confirmation") !== passphrase) throw new Error("PASSPHRASE_CONFIRMATION");
            if (!ready) throw new Error("SHELL_NOT_READY");
            const granted = await requestGrant(crypto.randomUUID());
            opened = await vault.current.create(passphrase, granted.grant, granted.access);
            setExists(true);
          }
          if (epoch !== lockEpoch.current) { vault.current.lock(); return; }
          form.reset(); unlocked.current = true; publish(opened);
          const progress = (state: OfflineVault) => { if (epoch === lockEpoch.current) publish(state); };
          if (navigator.onLine) progress(await synchronizeVault(vault.current, progress));
        });
      }}><label><span>{m("Отдельная парольная фраза", "Separate passphrase")}</span><input name="passphrase" type="password" autoComplete="off" minLength={16} maxLength={1024} required disabled={busy || exists === null} /></label>{!exists && <><label><span>{m("Повторите парольную фразу", "Repeat passphrase")}</span><input name="confirmation" type="password" autoComplete="off" minLength={16} maxLength={1024} required disabled={busy} /></label><label className={styles.checkbox}><input name="hospital" type="checkbox" required /><span>{m("Это компьютер больницы; сохранение медицинских данных на нём разрешено организацией.", "This is a hospital computer authorized by the organization to store medical data.")}</span></label></>}<button className={styles.primary} type="submit" disabled={busy || exists === null || (!exists && (!online || !ready))}>{busy ? m("Проверка…", "Checking…") : exists ? m("Разблокировать", "Unlock") : m("Подключить защищённое хранение", "Enable encrypted storage")}</button></form>
      <p className={styles.note}>{process.env.NODE_ENV !== "production" ? m("В режиме разработки можно проверить хранилище и очередь; offline-перезагрузка проверяется в production-сборке.", "Development mode supports vault and queue testing; offline reload requires a production build.") : ready ? m("Оболочка для запуска без сети подготовлена.", "Offline launch shell is ready.") : m("Подготавливается оболочка для запуска без сети. Дождитесь завершения перед подключением.", "Preparing the offline launch shell. Wait before enrolling.")}</p></section> : <>
      <div className={styles.message} role="status">{m("Ожидают отправки", "Pending")}: {value.outbox.length} · {m("Конфликты", "Conflicts")}: {value.records.filter((r) => r.state === "conflict").length} · {m("Доступ до", "Access until")}: {new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(value.access.expiresAt))} ({m("Минск", "Minsk")})</div>
      <nav className={styles.actions} aria-label={m("Offline-действия", "Offline actions")}><button className={styles.primary} disabled={busy} onClick={() => void perform(async () => { if (["new", "edit"].includes(view)) await draftWrites.current; startDraft(); })}>{m("Новый осмотр", "New examination")}</button><button className={styles.secondary} onClick={back}>{m("История на компьютере", "Local history")}</button><button className={styles.secondary} disabled={busy || !online || view === "new" || view === "edit"} onClick={() => void sync()}>{busy ? m("Синхронизация…", "Synchronizing…") : m("Синхронизировать", "Synchronize")}</button><button className={styles.secondary} disabled={busy} onClick={() => void perform(async () => { if (view === "new" || view === "edit") await draftWrites.current; lock(); })}>{m("Заблокировать", "Lock")}</button></nav>
      {(view === "new" || view === "edit") && <ExaminationWizard key={draftKey} initialDraft={initialDraft} onDraft={onDraft} initialExamination={view === "edit" ? editRecord : undefined} onPersist={async (input) => {
        const id = view === "edit" ? selected : crypto.randomUUID();
        try {
          await draftWrites.current;
          const draft = activeDraft.current;
          const saved = await vault.current.mutate((state) => {
            const current = state.drafts?.find(row => row.id === draft?.id);
            if (draft && current?.revision !== draft.revision) throw new Error("DRAFT_CONFLICT");
            queueExamination(state, input, id, crypto.randomUUID(), Date.now(), view === "edit" ? draft?.expectedVersion ?? editRecord?.rowVersion : undefined);
            state.drafts = (state.drafts ?? []).filter(row => row.id !== draft?.id);
          });
          activeDraft.current = null;
          publish(saved);
          return { ok: true, examinationId: id, message: m("Осмотр сохранён на этом компьютере в зашифрованном виде и ожидает отправки на сервер.", "Examination saved encrypted on this computer; server synchronization is pending.") };
        } catch (err) { return { ok: false, message: failureMessage(err, e) }; }
      }} onOpenSaved={(id) => { setSelected(id); setView("details"); }} />}
      {view === "history" && Boolean(value.drafts?.length) && <section className={styles.card}><h2>{m("Незавершённые осмотры", "Unfinished examinations")}</h2><p>{m("Черновики зашифрованы и автоматически не удаляются. Перед сохранением результата требуется повторное подтверждение врача.", "Drafts are encrypted and never automatically deleted. Saving the result requires renewed physician confirmation.")}</p>{value.drafts!.map(draft => <div className={styles.actions} key={draft.id}><span>{draft.snapshot.fullName || m("Без имени", "Unnamed")} · {draft.snapshot.step}</span><button className={styles.secondary} disabled={busy} onClick={() => { const record = draft.examinationId ? value.records.find(row => row.record.id === draft.examinationId)?.record : undefined; startDraft(draft, record); }}>{m("Продолжить", "Resume")}</button><button className={styles.danger} disabled={busy} onClick={() => { if (window.confirm(m("Удалить этот незавершённый черновик без возможности восстановления?", "Permanently remove this unfinished draft?"))) void perform(async () => { publish(await vault.current.mutate(state => { state.drafts = (state.drafts ?? []).filter(row => row.id !== draft.id); })); }); }}>{m("Удалить черновик", "Delete draft")}</button></div>)}</section>}
      {view === "history" && <section className={styles.card}><h2>{m("История пациентов на компьютере", "Patient history on this computer")}</h2><p>{m("Показаны только уже загруженные и локально сохранённые осмотры. Во время загрузки история может быть неполной. Для обновления подключитесь к сети и выполните синхронизацию.", "Only downloaded and locally saved examinations are shown. History may be incomplete while downloading. Reconnect and synchronize to update it.")}</p><form className={styles.filters} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setFilters({ search: String(data.get("q") ?? ""), from: String(data.get("from") ?? ""), to: String(data.get("to") ?? ""), page: 1 }); }}><label><span>{m("Поиск", "Search")}</span><input name="q" maxLength={200} placeholder={m("ФИО или аллерген", "Patient name or allergen")} /></label><DateRangePicker initialFrom="" initialTo="" today={today} locale={locale} /><button className={styles.primary} type="submit">{m("Найти", "Search")}</button></form>{history.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{m("Пациент", "Patient")}</th><th>{m("Дата", "Date")}</th><th>{m("Степень", "Grade")}</th><th>{m("Состояние", "Status")}</th><th>{m("Действие", "Action")}</th></tr></thead><tbody>{history.items.map((item) => { const entry = value.records.find((r) => r.record.id === item.id)!; return <tr key={item.id}><td>{item.patientName}</td><td>{new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(item.examinedAt))}</td><td>{item.severityGrade}</td><td><span className={styles.badge} data-state={entry.state}>{stateLabel(entry)}</span></td><td><button className={styles.secondary} onClick={() => { setSelected(item.id); setView("details"); }}>{m("Открыть", "Open")}</button></td></tr>; })}</tbody></table></div> : <div className={styles.empty}>{m("Осмотров не найдено", "No examinations found")}</div>}<div className={styles.actions}><button className={styles.secondary} disabled={history.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: history.page - 1 }))}>←</button><span>{history.page}/{history.totalPages || 1}</span><button className={styles.secondary} disabled={history.page >= history.totalPages} onClick={() => setFilters((f) => ({ ...f, page: history.page + 1 }))}>→</button></div></section>}
      {view === "details" && local && <><RecordView record={local.record} locale={locale} title={m("Локальный осмотр", "Local examination")} /><div className={styles.actions}><span className={styles.badge} data-state={local.state}>{stateLabel(local)}</span><button className={styles.secondary} disabled={busy || Boolean(local.record.deletedAt) || (local.state !== "synced" && !(local.state === "pending" && value.outbox.some((o) => o.examinationId === selected && !o.attempted && o.kind !== "delete")))} onClick={() => startDraft(undefined, structuredClone(local.record))}>{m("Редактировать", "Edit")}</button><button className={styles.danger} disabled={busy || local.state !== "synced" || Boolean(local.record.deletedAt)} onClick={() => { if (!window.confirm(m("Удалить осмотр? Удаление будет отправлено на сервер при синхронизации.", "Delete examination? The deletion will be sent to the server during synchronization."))) return; void perform(async () => { publish(await vault.current.mutate((state) => queueDeletion(state, selected, crypto.randomUUID(), Date.now()))); }); }}>{m("Удалить", "Delete")}</button></div><p className={styles.note}>{m("PDF, печать и копирование доступны ниже. Ещё не отправленные осмотры можно исправлять. Если отправка уже началась, дождитесь её подтверждения перед новыми правками.", "PDF, printing and copying are available below. Unsent examinations can be corrected. Once sending starts, wait for acknowledgement before editing again.")}</p>{local.state === "conflict" && local.serverRecord && <section className={styles.card}><h2>{m("Выберите версию — обе будут сохранены", "Choose a version — both will be retained")}</h2><div className={styles.comparison}><RecordView record={local.record} locale={locale} title={m("Ваши изменения", "Your changes")} /><RecordView record={local.serverRecord} locale={locale} title={m("Версия сервера", "Server version")} /></div><div className={styles.actions}>{(["server", "local"] as const).map((choice) => <button key={choice} className={choice === "local" ? styles.primary : styles.secondary} disabled={busy || (choice === "local" && Boolean(local.serverRecord?.deletedAt))} onClick={() => { if (!window.confirm(m("Подтвердить выбор? Обе версии останутся в локальном архиве конфликтов.", "Confirm choice? Both versions remain in the local conflict archive."))) return; void perform(async () => { setValue(await vault.current.mutate((state) => resolveConflict(state, selected, choice, crypto.randomUUID(), Date.now()))); }); }}>{choice === "local" ? m("Отправить мою версию", "Send my version") : m("Принять версию сервера", "Accept server version")}</button>)}</div></section>}</>}
      {value.resolvedConflicts.length > 0 && <section className={`${styles.card} ${styles.versions}`}><h2>{m("Архив разрешённых конфликтов", "Resolved conflict archive")}</h2>{value.resolvedConflicts.map((c, i) => <details key={i}><summary>{c.local.patient.fullName} · {c.resolvedAt.slice(0, 10)}</summary><div className={styles.comparison}><RecordView record={c.local} locale={locale} title={m("Локальная версия", "Local version")} /><RecordView record={c.server} locale={locale} title={m("Версия сервера", "Server version")} /></div></details>)}</section>}
      {view === "details" && local && !local.record.deletedAt && <section className={styles.card}><h2>{m("Экспорт локальной копии","Export local copy")}</h2><p>{m("Это копия на этом компьютере, а не подтверждение актуальности серверной версии. Запросы экспорта сохраняются зашифрованно и отправляются в аудит при подключении.","This is a copy on this computer, not proof of the current server version. Export requests are queued encrypted and uploaded to the audit when connected.")}</p><div className={styles.actions}>{(["copy","print","pdf"] as const).map(kind => <button className={styles.secondary} key={kind} disabled={busy} onClick={()=>exportRecord(kind)}>{kind === "copy" ? m("Копировать","Copy") : kind === "print" ? m("Печать","Print") : "PDF"}</button>)}</div></section>}
      <section className={`${styles.card} ${styles.versions}`}><h2>{m("Серверный архив конфликтов","Server conflict archive")}</h2><p>{m("Доступны последние 100 конфликтов вашей учётной записи. Обе версии остаются на сервере; выбор локальной версии применяется только после успешной отправки осмотра.","The latest 100 conflicts for your account. Both versions remain on the server; choosing the local version applies only after successful examination synchronization.")}</p><button className={styles.secondary} disabled={busy || !online || view === "new" || view === "edit"} onClick={()=>void perform(async()=>{ await draftWrites.current; const state=await vault.current.read(); setServerConflicts(await loadServerConflicts(state.grant)); })}>{m("Загрузить архив","Load archive")}</button>{serverConflicts.map(row=><details key={row.id}><summary>{row.local.patient.fullName} · {row.createdAt.slice(0,10)} · {row.decision ? row.decision === "local" ? m("Выбрана локальная версия","Local version chosen") : m("Выбрана серверная версия","Server version chosen") : m("Без решения","No decision")}</summary><div className={styles.comparison}><RecordView record={row.local} locale={locale} title={m("Локальная версия","Local version")}/><RecordView record={row.server} locale={locale} title={m("Версия сервера","Server version")}/></div></details>)}</section>
      <section className={styles.card}><h2>{m("Отключить локальное хранение", "Disable local storage")}</h2><p>{m("Удалит локальную копию и архив конфликтов только с этого компьютера, не с сервера. Очистка запрещена, пока есть неотправленные записи или нерешённые конфликты.", "Removes the local copy and conflict archive from this computer only, not the server. Unsent records and unresolved conflicts prevent clearing.")}</p><button className={styles.danger} disabled={busy || view === "new" || view === "edit"} onClick={() => { if (!window.confirm(m("Удалить зашифрованную локальную копию с этого компьютера?", "Remove the encrypted local copy from this computer?"))) return; void perform(async () => { await vault.current.clear(); lock(); setExists(false); setMessage(m("Локальная копия удалена. Серверная история не изменена.", "Local copy removed. Server history is unchanged.")); }); }}>{m("Очистить этот компьютер", "Clear this computer")}</button></section>
    </>}
  </div>;
}

function RecordView({ record, locale, title }: { record: StoredExamination; locale: Locale; title: string }) {
  const e = locale === "en";
  const m = (ru: string, en: string) => e ? en : ru;
  return <section className={styles.card}><h2>{title}: {record.patient.fullName}</h2><h3>{conclusionLabel(locale, record.severity, record.conclusion.anyConfirmed)}</h3>{record.deletedAt && <div className={styles.error}>{m("Удалённая запись", "Deleted record")}</div>}<dl className={styles.details}><div><dt>{m("Осмотр / версия", "Examination / version")}</dt><dd>{new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(record.examinedAt))} ({m("Минск", "Minsk")}) · {record.rowVersion}</dd></div><div><dt>{m("Аллерген", "Allergen")}</dt><dd>{record.probableAllergen ?? m("Не указан", "Not specified")}</dd></div><div><dt>{m("Контакт / острое начало", "Exposure / acute onset")}</dt><dd>{record.allergenContact === "yes" ? m("Да", "Yes") : record.allergenContact === "no" ? m("Нет", "No") : m("Неизвестно", "Unknown")} / {record.acuteOnset === "yes" ? m("Да", "Yes") : record.acuteOnset === "no" ? m("Нет", "No") : m("Неизвестно", "Unknown")}</dd></div><div><dt>{m("Начало реакции", "Reaction onset")}</dt><dd>{reactionDateLabel(record.reactionDate, record.reactionTime, locale)}</dd></div><div><dt>{m("Возраст", "Age")}</dt><dd>{record.vitals.age.years} {m("лет", "years")}, {record.vitals.age.months} {m("мес.", "months")}</dd></div><div><dt>{m("Показатели", "Vitals")}</dt><dd>{m("АД", "BP")} {record.vitals.systolicBP}/{record.vitals.diastolicBP} · SpO₂ {record.vitals.spO2}% · {m("ЧСС", "HR")} {record.vitals.heartRate} · {m("ЧД", "RR")} {record.vitals.respiratoryRate} · GCS {record.vitals.gcs}{record.vitals.baselineSystolicBP !== undefined ? ` · ${m("Исходное САД", "Baseline SBP")} ${record.vitals.baselineSystolicBP}` : ""}</dd></div></dl><h3>{m("Комментарий/уточнение врача", "Physician comment / clarification")}</h3><p className={styles.comment}>{record.physicianComment ?? m("Не указано", "Not specified")}</p>{resultSystems.map((system) => { const selected = record.selectedSymptoms.filter((s) => s.system === system); return selected.length ? <div key={system}><h3>{clinicalSystemLabel(locale, system)}</h3><ul>{selected.map((s) => <li key={s.id}>{symptomLabel(locale, s)}{s.selectedOptionLabel ? ` — ${optionLabel(locale, s.selectedOptionLabel)}` : ""}</li>)}</ul></div> : null; })}{[record.conclusion.primary, record.conclusion.niaid, record.conclusion.wao].map((source) => diagnosticPresentation(locale, source)).map((check) => <details key={check.key}><summary>{check.title}: {check.summary}</summary><ul>{check.criteria.map((c) => <li key={c.id}>{c.met ? "✓" : "—"} {c.label}: {c.details}</li>)}</ul></details>)}<p className={styles.note}>{m("Результат требует клинической проверки. Невыполнение критериев не исключает анафилаксию и не должно задерживать помощь.", "The result requires clinical review. Not meeting the criteria does not exclude anaphylaxis and must not delay care.")}</p></section>;
}
