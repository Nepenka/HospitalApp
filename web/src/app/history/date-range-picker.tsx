"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import styles from "./date-range-picker.module.css";

type Props = { locale: Locale } & (
  | { mode?: "range"; initialFrom: string; initialTo: string; today: string }
  | { mode: "single"; value: string; onChange: (value: string) => void; label: string; disabled?: boolean; describedBy?: string; today?: string }
);

const dateFromKey = (value: string) => new Date(`${value}T00:00:00.000Z`);
const keyFromDate = (value: Date) => value.toISOString().slice(0, 10);
const monthStart = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
const addMonths = (value: Date, amount: number) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));

export function DateRangePicker(props: Props) {
  const { locale } = props;
  const today = props.today ?? "2000-01-01";
  const single = props.mode === "single";
  const initialFrom = single ? props.value : props.initialFrom;
  const initialTo = single ? "" : props.initialTo;
  const disabled = single && Boolean(props.disabled);
  const e = locale === "en";
  const labelId = useId();
  const dialogId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rangeFrom, setFrom] = useState(initialFrom);
  const from = single ? props.value : rangeFrom;
  const [to, setTo] = useState(initialTo);
  const [month, setMonth] = useState(() => monthStart(dateFromKey(initialFrom || initialTo || today)));
  const formatter = useMemo(() => new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }), [e]);
  const triggerText = single ? (from ? formatter.format(dateFromKey(from)) : e ? "Select a date" : "Выберите дату") : from && to ? `${formatter.format(dateFromKey(from))} — ${formatter.format(dateFromKey(to))}` : from ? `${e ? "From" : "С"} ${formatter.format(dateFromKey(from))}` : e ? "Select a date range" : "Выберите период";

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  const choose = (day: string) => {
    if (single) { props.onChange(day); return; }
    if (!from || to) { setFrom(day); setTo(""); return; }
    if (day < from) { setTo(from); setFrom(day); return; }
    setTo(day);
  };
  const toggle = () => {
    if (!open && single) {
      // Read the device clock only on interaction, never during SSR/hydration.
      const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      setMonth(monthStart(dateFromKey(from || props.today || `${date.year}-${date.month}-${date.day}`)));
    }
    setOpen((value) => !value);
  };

  return <div className={styles.datePicker} data-appearance={single ? "form" : "filter"} ref={rootRef}>
    <span className={styles.datePickerLabel} id={labelId}>{single ? props.label : e ? "Period" : "Период"}</span>
    {!single && <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></>}
    <button className={styles.dateTrigger} ref={triggerRef} type="button" disabled={disabled} aria-labelledby={labelId} aria-describedby={single ? props.describedBy : undefined} aria-haspopup="dialog" aria-controls={open && !disabled ? dialogId : undefined} aria-expanded={open && !disabled} onClick={toggle}>
      <CalendarIcon /><span>{triggerText}</span><ChevronIcon open={open} />
    </button>
    {open && !disabled && <div className={styles.calendarPopover} id={dialogId} role="dialog" aria-label={single ? props.label : e ? "Select a date range" : "Выбор периода"}>
      <header className={styles.calendarHeader}>
        <div><strong>{single ? props.label : e ? "Date range" : "Период осмотров"}</strong><span>{from ? triggerText : single ? (e ? "Choose the reaction onset day" : "Выберите день начала реакции") : e ? "Choose the first and last day" : "Выберите первый и последний день"}</span></div>
        {(from || to) && <button type="button" onClick={() => { if (single) props.onChange(""); else { setFrom(""); setTo(""); } }}>{e ? "Clear" : "Сбросить"}</button>}
      </header>
      <div className={styles.calendarNavigation}>
        <button type="button" aria-label={e ? "Previous month" : "Предыдущий месяц"} onClick={() => setMonth((value) => addMonths(value, -1))}>‹</button>
        <button type="button" aria-label={e ? "Next month" : "Следующий месяц"} onClick={() => setMonth((value) => addMonths(value, 1))}>›</button>
      </div>
      <div className={styles.calendars}>
        <CalendarMonth month={month} from={from} to={single ? "" : to} locale={locale} choose={choose} />
        <CalendarMonth month={addMonths(month, 1)} from={from} to={single ? "" : to} locale={locale} choose={choose} secondary />
      </div>
      <footer className={styles.calendarFooter}>
        <span>{single ? (from ? (e ? "Date selected" : "Дата выбрана") : (e ? "Select a date" : "Выберите дату")) : !from ? (e ? "Select a start date" : "Выберите начальную дату") : !to ? (e ? "Now select an end date" : "Теперь выберите конечную дату") : (e ? "Range selected" : "Период выбран")}</span>
        <button type="button" disabled={!from} onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>{e ? "Done" : "Готово"}</button>
      </footer>
    </div>}
  </div>;
}

function CalendarMonth({ month, from, to, locale, choose, secondary = false }: { month: Date; from: string; to: string; locale: Locale; choose: (day: string) => void; secondary?: boolean }) {
  const e = locale === "en";
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const leading = (month.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Array.from({ length: leading + days }, (_, index) => index < leading ? null : new Date(Date.UTC(year, monthIndex, index - leading + 1)));
  const weekdays = e ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const title = new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
  return <section className={styles.calendarMonth} data-secondary={secondary}>
    <h3>{title}</h3>
    <div className={styles.weekdays}>{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className={styles.days}>{cells.map((date, index) => {
      if (!date) return <span key={`blank-${index}`} />;
      const key = keyFromDate(date);
      const edge = key === from || key === to;
      const inRange = Boolean(from && to && key > from && key < to);
      return <button type="button" key={key} data-edge={edge} data-range={inRange} aria-label={new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle: "full", timeZone: "UTC" }).format(date)} aria-pressed={edge || inRange} onClick={() => choose(key)}>{date.getUTCDate()}</button>;
    })}</div>
  </section>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" data-open={open} width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
