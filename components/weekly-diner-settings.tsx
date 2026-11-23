"use client";

import { RotateCcw, UserMinus, UserPlus } from "lucide-react";
import type { AppSettings, WeeklyDayDefault } from "@/lib/domain";
import { weekdays } from "@/lib/guided-shop";

export function WeeklyDinerSettings({ settings, onChange }: {
  settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void;
}) {
  const diners = settings.diners ?? [];
  return <section className="settings-section weekly-diner-settings" aria-label="Weekly diner defaults">
    <h2>Weekly diners &amp; notes</h2>
    <div className="weekly-defaults-scroll" tabIndex={0} aria-label="Weekly defaults calendar">
      <div className="weekly-defaults-grid">
        {weekdays.map(day => {
          const defaults = settings.weeklyDefaults?.[day] ?? {};
          const label = day.charAt(0).toUpperCase() + day.slice(1);
          function change(patch: Partial<WeeklyDayDefault>) {
            onChange({ weeklyDefaults: { ...settings.weeklyDefaults, [day]: { ...defaults, ...patch } } });
          }
          return <section className="weekly-default-day" key={day} aria-label={`${label} defaults`}>
            <header><h3>{label}</h3><button className="icon-button" type="button" title={`Reset ${label} defaults`} disabled={!settings.weeklyDefaults?.[day]} onClick={() => {
              const next = { ...settings.weeklyDefaults }; delete next[day]; onChange({ weeklyDefaults: next });
            }}><RotateCcw size={14} /></button></header>
            {(["lunch", "dinner"] as const).map(slot => {
              const ids = defaults[slot] ?? (slot === "dinner" ? diners.filter(diner => diner.usual).map(diner => diner.id) : []);
              const all = diners.length > 0 && diners.every(diner => ids.includes(diner.id));
              return <div className={`diner-calendar-slot ${slot}`} key={slot}>
                <div className="diner-calendar-slot-heading"><strong>{slot === "lunch" ? "Lunch" : "Dinner"}</strong><button className="icon-button" type="button" title={`${all ? "Deselect" : "Select"} all ${label} ${slot} defaults`} disabled={!diners.length} onClick={() => change({ [slot]: all ? [] : diners.map(diner => diner.id) })}>{all ? <UserMinus size={14} /> : <UserPlus size={14} />}</button></div>
                <div className="diner-calendar-people">{diners.map(diner => <label key={diner.id}><input type="checkbox" aria-label={`${diner.name} default ${slot} on ${label}`} checked={ids.includes(diner.id)} onChange={event => change({ [slot]: event.target.checked ? [...ids, diner.id] : ids.filter(id => id !== diner.id) })} />{diner.name || "Unnamed diner"}</label>)}</div>
              </div>;
            })}
            <label className="weekly-note-label">Day note<textarea rows={3} aria-label={`Recurring note for ${label}`} value={defaults.note ?? ""} onChange={event => change({ note: event.target.value })} /></label>
          </section>;
        })}
      </div>
    </div>
  </section>;
}
