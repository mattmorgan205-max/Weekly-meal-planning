"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Settings, Undo2, UserMinus, X } from "lucide-react";
import { formatDateKey, type AppState, type DinnerAttendance } from "@/lib/domain";
import { attendanceForSlot, attendancePortions, copyAttendanceToDates, setAttendance, shopDates } from "@/lib/guided-shop";
import { mealCalendarDays } from "@/lib/guided-planning";

type Slot = "lunch" | "dinner";
type Target = { date: string; slot: Slot };
const label = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

export function DinerCalendar({ state, updateState, children }: {
  state: AppState; updateState: (updater: (state: AppState) => AppState) => void; children: ReactNode;
}) {
  const shop = state.guidedShop!, diners = state.settings.diners ?? [], dates = shopDates(shop.startDate, shop.endDate);
  const [today, setToday] = useState(() => formatDateKey(new Date()));
  const [copy, setCopy] = useState<Target | null>(null), [targets, setTargets] = useState<string[]>([]);
  const [editing, setEditing] = useState<Target | null>(null);
  const [cleared, setCleared] = useState<Record<string, { lunch: DinnerAttendance; dinner: DinnerAttendance }>>({});
  useEffect(() => { const refresh = () => setToday(formatDateKey(new Date())); const timer = setInterval(refresh, 60000); window.addEventListener("focus", refresh); return () => { clearInterval(timer); window.removeEventListener("focus", refresh); }; }, []);
  function change(date: string, slot: Slot, patch: Partial<DinnerAttendance>) {
    updateState(current => {
      const next = { ...attendanceForSlot(current, date, slot), ...patch, confirmed: true };
      next.sophiaEating = (current.settings.diners ?? []).some(diner => diner.name.trim().toLowerCase() === "sophia" && (next.portions[diner.id] ?? 0) > 0);
      return setAttendance(current, date, next, slot);
    });
  }
  const editAttendance = editing && attendanceForSlot(state, editing.date, editing.slot);
  return <section className="guided-diners-schedule" aria-label="Lunch and dinner attendance">
    <div className="guided-tool-heading"><h3>Who is eating?</h3><button className="text-button" type="button" onClick={() => updateState(current => dates.reduce((next, date) => (["lunch", "dinner"] as const).reduce((result, slot) => setAttendance(result, date, { ...attendanceForSlot(result, date, slot), confirmed: true }, slot), next), current))}><Check size={15} />Confirm all</button></div>
    <div className="meal-calendar-scroll" tabIndex={0} aria-label="Diners calendar"><div className="meal-calendar-grid diner-calendar-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div className="meal-calendar-weekday" key={day}>{day}</div>)}
      {mealCalendarDays(shop.startDate, shop.endDate).map(date => {
        const selected = dates.includes(date);
        const empty = (["lunch", "dinner"] as const).every(slot => attendancePortions(attendanceForSlot(state, date, slot), 0) === 0);
        return <section key={date} className={`meal-calendar-day diner-calendar-day ${selected ? "is-shopping-day" : "outside-shop"} ${selected && date === today ? "is-today" : ""}`} aria-label={label(date)} aria-current={selected && date === today ? "date" : undefined}>
          <header><time dateTime={date}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`))}</time>{selected && date === today && <span>Today</span>}
            {selected && <button className="icon-button" type="button" title={`${cleared[date] && empty ? "Undo clear" : "Clear all"} diners for ${label(date)}`} disabled={empty && !cleared[date]} onClick={() => {
              if (cleared[date] && empty) { updateState(current => setAttendance(setAttendance(current, date, cleared[date].lunch, "lunch"), date, cleared[date].dinner)); setCleared(current => { const next = { ...current }; delete next[date]; return next; }); }
              else { setCleared(current => ({ ...current, [date]: { lunch: attendanceForSlot(state, date, "lunch"), dinner: attendanceForSlot(state, date, "dinner") } })); updateState(current => (["lunch", "dinner"] as const).reduce((next, slot) => setAttendance(next, date, { ...attendanceForSlot(next, date, slot), confirmed: true, portions: {}, guests: 0, sophiaEating: false }, slot), current)); }
            }}>{cleared[date] && empty ? <Undo2 size={13} /> : <UserMinus size={13} />}</button>}
          </header>
          {(["lunch", "dinner"] as const).map(slot => {
            const attendance = attendanceForSlot(state, date, slot), portions = attendancePortions(attendance, 0);
            return <div key={slot} className={`diner-calendar-slot ${slot}`} aria-label={`${slot} diners on ${date}`}>
              <div className="diner-calendar-slot-heading"><strong>{slot === "lunch" ? "Lunch" : "Dinner"}</strong>{selected && <span>{portions ? `${portions} portions` : "No diners"}</span>}</div>
              {selected && <><div className="diner-calendar-people">{diners.map(diner => <label key={diner.id}><input type="checkbox" aria-label={`${diner.name} eating ${slot} on ${date}`} checked={Object.hasOwn(attendance.portions, diner.id)} onChange={event => { const next = { ...attendance.portions }; if (event.target.checked) next[diner.id] = diner.portions; else delete next[diner.id]; change(date, slot, { portions: next }); }} />{diner.name || "Unnamed diner"}</label>)}</div>
                {attendance.guests > 0 && <small>{attendance.guests} guest portions</small>}
                <div className="diner-calendar-actions"><button className="icon-button" type="button" title={`Clear ${slot} diners on ${date}`} disabled={!portions} onClick={() => change(date, slot, { portions: {}, guests: 0 })}><UserMinus size={13} /></button><button className="icon-button" type="button" title={`Edit ${slot} portions and guests on ${date}`} onClick={() => setEditing({ date, slot })}><Settings size={13} /></button><button className="icon-button" type="button" title={`Copy ${slot} diners from ${date}`} onClick={() => { setCopy({ date, slot }); setTargets(dates.filter(day => day !== date)); }}><Copy size={13} /></button></div>
              </>}
            </div>;
          })}
          <div className="diner-calendar-comment">{selected && <textarea rows={2} aria-label={`Day comment for ${date}`} placeholder="Day comment" value={state.dayNotes[date] ?? ""} onChange={event => updateState(current => ({ ...current, dayNotes: { ...current.dayNotes, [date]: event.target.value } }))} />}</div>
        </section>;
      })}
    </div></div>
    {children}
    {copy && <div className="modal-backdrop diner-dialog-backdrop"><section className="modal-panel diner-copy-dialog" role="dialog" aria-modal="true" aria-label="Apply diners to selected days" onKeyDown={event => { if (event.key === "Escape") setCopy(null); }}>
      <div className="section-heading"><h2>Copy {copy.slot} diners</h2><button autoFocus type="button" className="icon-button" title="Close copy diners" onClick={() => setCopy(null)}><X size={18} /></button></div>
      <p>Use {label(copy.date)}'s {copy.slot} diners on the selected days? Existing {copy.slot} selections will be replaced. Other meals and comments stay unchanged.</p>
      <div className="button-row"><button className="text-button" type="button" onClick={() => setTargets(dates.filter(date => date !== copy.date))}>Select all days</button><button className="text-button" type="button" onClick={() => setTargets([])}>Clear selection</button></div>
      <div className="diner-copy-days">{dates.filter(date => date !== copy.date).map(date => <label key={date}><input type="checkbox" checked={targets.includes(date)} onChange={event => setTargets(current => event.target.checked ? [...current, date] : current.filter(day => day !== date))} />{label(date)}</label>)}</div>
      <button type="button" className="primary-button" disabled={!targets.length} onClick={() => { updateState(current => copyAttendanceToDates(current, copy.date, copy.slot, targets)); setCopy(null); }}>Apply to {targets.length} selected days</button>
    </section></div>}
    {editing && editAttendance && <div className="modal-backdrop diner-dialog-backdrop"><section className="modal-panel diner-copy-dialog" role="dialog" aria-modal="true" aria-label="Edit diner portions" onKeyDown={event => { if (event.key === "Escape") setEditing(null); }}>
      <div className="section-heading"><h2>{label(editing.date)} {editing.slot}</h2><button autoFocus className="icon-button" type="button" title="Close portions" onClick={() => setEditing(null)}><X size={18} /></button></div>
      {diners.filter(diner => Object.hasOwn(editAttendance.portions, diner.id)).map(diner => <label key={diner.id}>{diner.name} portions<input type="number" min="0" max="20" step="0.25" value={editAttendance.portions[diner.id]} onChange={event => change(editing.date, editing.slot, { portions: { ...editAttendance.portions, [diner.id]: Math.max(0, Number(event.target.value)) } })} /></label>)}
      <label>Guest portions<input type="number" min="0" max="50" step="0.5" value={editAttendance.guests} onChange={event => change(editing.date, editing.slot, { guests: Math.max(0, Number(event.target.value)) })} /></label>
      <button type="button" className="primary-button" onClick={() => setEditing(null)}>Done</button>
    </section></div>}
  </section>;
}
