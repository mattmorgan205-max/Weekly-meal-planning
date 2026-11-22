"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { addDays, formatDateKey, type GuidedShop, type PlannedMeal } from "@/lib/domain";
import { calendarDays, calendarRange } from "@/lib/guided-planning";

const label = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));

export function ShopCalendar({ shop, plannedMeals, extrasCount, onApply, onPending }: {
  shop: GuidedShop; plannedMeals: PlannedMeal[]; extrasCount: number; onApply: (start: string, end: string) => void; onPending?: (pending: boolean) => void;
}) {
  const [month, setMonth] = useState(shop.startDate.slice(0, 7));
  const [start, setStart] = useState(shop.startDate), [end, setEnd] = useState(shop.endDate);
  const [anchor, setAnchor] = useState<string | null>(null), [hover, setHover] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [today, setToday] = useState(() => formatDateKey(new Date()));
  const calendarRef = useRef<HTMLDivElement>(null);
  const pending = start !== shop.startDate || end !== shop.endDate || anchor !== null;
  useEffect(() => { onPending?.(pending); }, [pending, onPending]);
  useEffect(() => {
    const refresh = () => setToday(formatDateKey(new Date()));
    const timer = setInterval(refresh, 60_000); window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const preview = anchor && hover ? calendarRange(anchor, hover) : null;
  const shownStart = preview?.start ?? start, shownEnd = preview?.end ?? end;
  const days = calendarDays(`${month}-01`);
  const mealsOn = (date: string) => (["lunch", "dinner"] as const).filter(slot => plannedMeals.some(meal =>
    meal.date === date && meal.slot === slot && meal.notes !== "Guided dinner status" && (meal.recipeId || meal.manualTitle?.trim())));
  function choose(date: string) {
    setError("");
    if (!anchor) { setAnchor(date); setStart(date); setEnd(date); return; }
    const range = calendarRange(anchor, date);
    if (!range) { setError("A shop can cover up to 14 days."); return; }
    setStart(range.start); setEnd(range.end); setAnchor(null); setHover(null);
  }
  function shiftMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() + offset);
    setMonth(formatDateKey(date).slice(0, 7));
  }
  return <section className="shop-calendar" aria-label="Shopping dates">
    <div className="calendar-heading"><h3><CalendarDays size={18} />Shopping dates</h3>
      <button className="text-button" type="button" onClick={() => setMonth(today.slice(0, 7))}>Today</button></div>
    <div className="calendar-month"><button className="icon-button" type="button" title="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button>
      <strong aria-live="polite">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</strong>
      <button className="icon-button" type="button" title="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></div>
    <div className="calendar-weekdays" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div>
    <div className="calendar-grid" ref={calendarRef} onMouseLeave={() => setHover(null)}>
      {days.map(date => <button type="button" key={date} data-date={date} aria-label={label(date)} aria-description={mealsOn(date).length ? `${mealsOn(date).join(" and ")} planned` : "No lunch or dinner planned"} aria-pressed={date >= shownStart && date <= shownEnd} aria-current={date === today ? "date" : undefined}
        className={[date.slice(0, 7) !== month ? "outside-month" : "", date >= shownStart && date <= shownEnd ? "in-range" : "", date === shownStart ? "range-start" : "", date === shownEnd ? "range-end" : "", date === today ? "is-today" : ""].join(" ")}
        onClick={() => choose(date)} onMouseEnter={() => { if (anchor) setHover(date); }} onFocus={() => { if (anchor) setHover(date); }}
        onKeyDown={event => { const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!delta) return; event.preventDefault(); const next = formatDateKey(addDays(new Date(`${date}T12:00:00`), delta)); calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(); }}>
        <span className="calendar-day-number">{Number(date.slice(-2))}</span><span className="calendar-meal-dots" aria-hidden="true">{mealsOn(date).map(slot => <i key={slot} className={`meal-dot ${slot}`} />)}</span></button>)}
    </div>
    <div className="calendar-meal-legend"><span><i className="meal-dot lunch" />Lunch</span><span><i className="meal-dot dinner" />Dinner</span></div>
    {anchor && <p className="muted" role="status">Select the end date</p>}
    {error && <p className="shop-warning" role="alert">{error}</p>}
    {pending && <div className="calendar-apply"><small>{extrasCount} extras kept. Meals and notes stay on their dates.</small><div className="button-row">
      <button type="button" className="primary-button" disabled={Boolean(anchor)} onClick={() => { onApply(start, end); onPending?.(false); }}><Check size={16} />Apply dates</button>
      <button type="button" className="icon-button" title="Cancel date changes" onClick={() => { setStart(shop.startDate); setEnd(shop.endDate); setAnchor(null); setHover(null); setError(""); }}><X size={16} /></button></div></div>}
  </section>;
}
