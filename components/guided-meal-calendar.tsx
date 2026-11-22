"use client";

import { useEffect, useState } from "react";
import { CornerDownRight, Plus, Trash2, Undo2 } from "lucide-react";
import { addDays, formatDateKey, type AppState, type DinnerAttendance, type MealSlot, type PlannedMeal } from "@/lib/domain";
import { attendancePortions, defaultAttendance, dinnerNeedsMeal, recipeAllowedForDinner, scaleMealPortions } from "@/lib/guided-shop";
import { mealCalendarDays, mealSource } from "@/lib/guided-planning";
import type { GuidedDragControls } from "./guided-meal-workspace";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

export function GuidedMealCalendar({ state, updateState, controls, onOpenMeal, onOpenRecipe, onRemove, onAddLeftovers }: {
  state: AppState; updateState: (updater: (state: AppState) => AppState) => void; controls: GuidedDragControls;
  onOpenMeal: (date: string, slot: MealSlot) => void; onOpenRecipe: (id: string) => void;
  onRemove: (id: string) => void; onAddLeftovers: (meal: PlannedMeal) => void;
}) {
  const shop = state.guidedShop!, diners = state.settings.diners ?? [];
  const [today, setToday] = useState(() => formatDateKey(new Date()));
  const [notice, setNotice] = useState("");
  const [deleted, setDeleted] = useState<{ meal: PlannedMeal; excluded: boolean; attendance?: DinnerAttendance } | null>(null);
  useEffect(() => {
    const refresh = () => setToday(formatDateKey(new Date()));
    const timer = setInterval(refresh, 60_000); window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  function undo() {
    if (!deleted) return;
    updateState(current => {
      if (current.plannedMeals.some(meal => meal.id === deleted.meal.id)) return current;
      let meal = deleted.meal;
      if (meal.portionSource === "diners" && meal.slot === "dinner") meal = scaleMealPortions(meal, dinnerNeedsMeal(current.dinnerAttendance?.[meal.date]) ? attendancePortions(current.dinnerAttendance?.[meal.date], current.settings.defaultPeople) + (meal.extraPortions ?? 0) : 0);
      return { ...current, plannedMeals: [...current.plannedMeals, meal],
        dinnerAttendance: meal.notes === "Guided dinner status" && deleted.attendance ? { ...current.dinnerAttendance, [meal.date]: deleted.attendance } : current.dinnerAttendance,
        guidedShop: { ...current.guidedShop!, excludedRecipeIds: deleted.excluded ? current.guidedShop!.excludedRecipeIds : current.guidedShop!.excludedRecipeIds.filter(id => id !== meal.recipeId) } };
    });
    setDeleted(null); setNotice("Meal restored.");
  }
  return <>
    {notice && <div className="meal-calendar-notice" role="status">{notice}{deleted && <button className="text-button" type="button" onClick={undo}><Undo2 size={14} />Undo</button>}</div>}
    <div className="meal-calendar-scroll" tabIndex={0} aria-label="Lunch and dinner calendar">
      <div className="meal-calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div className="meal-calendar-weekday" key={day}>{day}</div>)}
        {mealCalendarDays(shop.startDate, shop.endDate).map(date => {
          const selected = date >= shop.startDate && date <= shop.endDate;
          const attendance = state.dinnerAttendance?.[date] ?? defaultAttendance(diners);
          const names = diners.filter(diner => (attendance.portions[diner.id] ?? 0) > 0).map(diner => diner.name).join(", ");
          const summary = `${names || "No household diners"}${attendance.guests ? ` + ${attendance.guests} guest portions` : ""}`;
          return <section key={date} className={`meal-calendar-day ${selected ? "is-shopping-day" : "outside-shop"} ${selected && date === today ? "is-today" : ""}`} aria-label={dayLabel(date)} aria-current={selected && date === today ? "date" : undefined}>
            <header><time dateTime={date}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`))}</time>{selected && date === today && <span>Today</span>}</header>
            <div className="meal-calendar-day-meta">
              {selected && <small title={`Dinner: ${summary}`}>{summary}</small>}
              {state.dayNotes[date] && <p title={state.dayNotes[date]}>{state.dayNotes[date]}</p>}
            </div>
            {(["lunch", "dinner"] as const).map(slot => {
              const meals = state.plannedMeals.filter(meal => meal.date === date && meal.slot === slot);
              const allowed = selected && (slot === "lunch" || dinnerNeedsMeal(attendance));
              const drop = selected ? controls.dropProps(date, slot) : {};
              return <div {...drop} className={`meal-calendar-slot ${slot} ${drop.className ?? ""}`} key={slot} aria-label={`${slot} on ${date}`}>
                <div className="meal-calendar-slot-heading"><span>{slot === "lunch" ? "Lunch" : "Dinner"}</span>{allowed && <button className="icon-button" type="button" title={`Add ${slot} on ${date}`} onClick={() => onOpenMeal(date, slot)}><Plus size={13} /></button>}</div>
                {meals.map(meal => {
                  const recipe = state.recipes.find(row => row.id === meal.recipeId), title = recipe?.title ?? meal.manualTitle ?? "Meal";
                  const placeholder = meal.notes === "Guided dinner status", source = mealSource(recipe);
                  const tileDrop = selected && !placeholder ? controls.dropProps(date, slot, meal.id) : {};
                  return <article key={meal.id} {...(selected && !placeholder ? controls.mealDragProps(meal) : {})} {...tileDrop} className={`meal-calendar-tile ${tileDrop.className ?? ""}`} aria-label={title}>
                    <button className="meal-calendar-title" type="button" title={title} disabled={!recipe} onClick={() => recipe && onOpenRecipe(recipe.id)}>{title}</button>
                    {!placeholder && (source.href ? <a className="meal-calendar-source" title={source.href} href={source.href} target="_blank" rel="noreferrer" draggable={false}>{source.label}</a> : <small className="meal-calendar-source" title={source.label}>{source.label}</small>)}
                    {meal.notes === "Leftovers" && <small className="meal-calendar-leftovers">Leftovers</small>}
                    {selected && slot === "dinner" && recipe && !recipeAllowedForDinner(recipe, date, state.dinnerAttendance, state.dayNotes) && <small className="meal-calendar-warning">{dinnerNeedsMeal(attendance) ? "Check diners" : "Not shopping for this dinner"}</small>}
                    {selected && <div className="meal-calendar-actions">
                      {!placeholder && controls.moveControl(meal)}
                      {!placeholder && meal.notes !== "Leftovers" && <button className="icon-button" type="button" title={`Add leftovers of ${title} to tomorrow's lunch`} onClick={() => {
                        onAddLeftovers(meal); setDeleted(null);
                        const tomorrow = formatDateKey(addDays(new Date(`${date}T12:00:00`), 1));
                        setNotice(`Leftovers added to lunch on ${dayLabel(tomorrow)}${tomorrow > shop.endDate ? ", outside this shopping period" : ""}. No extra shopping ingredients added.`);
                      }}><CornerDownRight size={14} /></button>}
                      <button className="icon-button danger" type="button" title={`Remove ${title} from ${slot} on ${date}`} onClick={() => { setDeleted({ meal, excluded: shop.excludedRecipeIds.includes(meal.recipeId ?? ""), attendance: state.dinnerAttendance?.[date] }); setNotice(`${title} removed from ${dayLabel(date)} ${slot}.`); onRemove(meal.id); }}><Trash2 size={14} /></button>
                    </div>}
                  </article>;
                })}
                {!meals.length && <span className="meal-calendar-empty">{slot === "dinner" && selected && !allowed ? (attendance.dinnerStatus === "out" ? "Eating out" : attendance.dinnerStatus === "leftovers" ? "Leftovers" : "No dinner needed") : "-"}</span>}
              </div>;
            })}
          </section>;
        })}
      </div>
    </div>
  </>;
}
