"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Plus, RefreshCw, Settings, Shuffle, Trash2 } from "lucide-react";
import { addDays, createId, formatDateKey, groceryCategories, type AppState, type DinnerAttendance, type GuidedShop, type HouseholdDiner, type MealSlot, type PlannedMeal, type ShoppingListItem, type SupplyCheck } from "@/lib/domain";
import { attendancePortions, changeDiners as updateDiners, createShop, defaultAttendance, dinnerNeedsMeal, guidedSteps, recipeAllowedForDinner, requiredShopItems, requirementSignature, resolveShop, scaleMealPortions, setAttendance, shopDates, shopIsFinalized, type SupplyResult } from "@/lib/guided-shop";

type UpdateState = (updater: (current: AppState) => AppState) => void;
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

export function ShopDatesEditor({ shop, extrasCount, onApply }: { shop: GuidedShop; extrasCount: number; onApply: (start: string, end: string) => void }) {
  const [start, setStart] = useState(shop.startDate), [end, setEnd] = useState(shop.endDate), [preview, setPreview] = useState(false);
  const dates = shopDates(start, end), changed = start !== shop.startDate || end !== shop.endDate;
  return <div className="shop-dates-editor">
    <div className="button-row">
      <label>From<input type="date" value={start} onChange={event => { setStart(event.target.value); setPreview(false); }} /></label>
      <label>To<input type="date" value={end} onChange={event => { setEnd(event.target.value); setPreview(false); }} /></label>
      <div className="segmented-control" aria-label="Shop duration">{[7, 14].map(count => <button type="button" key={count} className={dates.length === count ? "active" : ""}
        onClick={() => { if (start) setEnd(formatDateKey(addDays(new Date(`${start}T12:00:00`), count - 1))); setPreview(false); }}>{count} days</button>)}</div>
      {changed && <button type="button" className="icon-text-button" disabled={!dates.length} onClick={() => setPreview(true)}>Preview dates</button>}
    </div>
    {!dates.length && <p role="alert">Choose a date range of 1 to 14 days.</p>}
    {preview && changed && dates.length > 0 && <div className="shop-notice" role="status">
      <strong>{dateLabel(start)} to {dateLabel(end)}: {dates.length} dinners</strong>
      <p>{extrasCount} extras kept. Meals and comments stay on their original dates. Changed requirements will need another supply check.</p>
      <div className="button-row"><button type="button" className="primary-button" onClick={() => { onApply(start, end); setPreview(false); }}>Apply dates</button>
        <button type="button" className="text-button" onClick={() => { setStart(shop.startDate); setEnd(shop.endDate); setPreview(false); }}>Cancel</button></div>
    </div>}
  </div>;
}

export function HouseholdDinersEditor({ diners, onChange }: { diners: HouseholdDiner[]; onChange: (diners: HouseholdDiner[]) => void }) {
  return <details className="shop-diners-settings"><summary><Settings size={16} />Household diners</summary>
    {diners.map(diner => <div className="shop-diner-edit" key={diner.id}>
      <label>Name<input aria-label={`Name for ${diner.name}`} value={diner.name} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, name: event.target.value } : row))} /></label>
      <label>Default portions<input type="number" min="0" max="20" step="0.25" value={diner.portions} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, portions: Math.max(0, Number(event.target.value)) } : row))} /></label>
      <label className="toggle-line"><input type="checkbox" checked={diner.usual} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, usual: event.target.checked } : row))} />Usually eating</label>
      <button type="button" className="icon-button danger" title={`Remove diner ${diner.name}`} onClick={() => onChange(diners.filter(row => row.id !== diner.id))}><Trash2 size={16} /></button>
    </div>)}
    <button type="button" className="icon-text-button" onClick={() => onChange([...diners, { id: createId("diner"), name: "New diner", portions: 1, usual: true }])}><Plus size={16} />Add diner</button>
  </details>;
}

function AttendanceRow({ date, diners, attendance, note, onChange, onNote, onApplyAll, compact = false }: {
  date: string; diners: HouseholdDiner[]; attendance: DinnerAttendance; note: string;
  onChange: (value: DinnerAttendance) => void; onNote: (value: string) => void; onApplyAll: () => void;
  compact?: boolean;
}) {
  const update = (patch: Partial<DinnerAttendance>) => {
    const next = { ...attendance, ...patch, confirmed: true };
    next.sophiaEating = diners.some(diner => diner.name.trim().toLowerCase() === "sophia" && (next.portions[diner.id] ?? 0) > 0);
    onChange(next);
  };
  return <div className="attendance-row">
    <div className="attendance-heading"><strong>{dateLabel(date)}</strong><span>{attendancePortions(attendance, 0)} portions</span>
      {!attendance.confirmed && <button className="text-button" type="button" onClick={() => update({})}><Check size={14} />Confirm diners</button>}
      <button type="button" className="icon-button" title={`Apply ${dateLabel(date)} diners to all days`} onClick={onApplyAll}><Copy size={15} /></button>
    </div>
    <details className={compact ? "attendance-details" : "attendance-details expanded"} open={!compact}>
    <summary>{diners.filter(diner => (attendance.portions[diner.id] ?? 0) > 0).map(diner => diner.name).join(", ") || "No household diners"}{attendance.guests > 0 ? ` + ${attendance.guests} guest portions` : ""}</summary>
    <div className="attendance-people">{diners.map(diner => <div className="attendance-person" key={diner.id}>
      <label className="toggle-line"><input type="checkbox" checked={Object.hasOwn(attendance.portions, diner.id)} onChange={event => {
        const portions = { ...attendance.portions }; if (event.target.checked) portions[diner.id] = diner.portions; else delete portions[diner.id]; update({ portions });
      }} />{diner.name || "Unnamed diner"}</label>
      {Object.hasOwn(attendance.portions, diner.id) && <input type="number" min="0" max="20" step="0.25" aria-label={`${diner.name} portions on ${date}`} value={attendance.portions[diner.id]}
        onChange={event => update({ portions: { ...attendance.portions, [diner.id]: Math.max(0, Number(event.target.value)) } })} />}
    </div>)}
      <label className="guest-portions">Guest portions<input type="number" min="0" max="50" step="0.5" value={attendance.guests} onChange={event => update({ guests: Math.max(0, Number(event.target.value)) })} /></label>
    </div></details>
    <label className="attendance-note">Day comment<input value={note} aria-label={`Day comment for ${date}`} onChange={event => onNote(event.target.value)} /></label>
  </div>;
}

export function GuidedShopView({ state, updateState, onDates, onOpenMeal, onSwap, onGenerate, onRemove, renderMeal, extras, supplies, review }: {
  state: AppState; updateState: UpdateState; onDates: (start: string, end: string) => void;
  onOpenMeal: (date: string, slot: MealSlot) => void; onSwap: (meal: PlannedMeal) => void; onGenerate: () => void;
  onRemove: (id: string) => void; renderMeal: (meal: PlannedMeal) => ReactNode;
  extras: ReactNode; supplies: ReactNode; review: ReactNode;
}) {
  const shop = state.guidedShop!, diners = state.settings.diners ?? [], dates = shopDates(shop.startDate, shop.endDate);
  const [applyAllDate, setApplyAllDate] = useState<string | null>(null);
  const [newShop, setNewShop] = useState(false);
  const step = Math.min(4, Math.max(0, shop.step));
  const finalised = shopIsFinalized(requiredShopItems(state, shop), shop);
  const today = formatDateKey(new Date());
  const attendanceFor = (date: string) => state.dinnerAttendance?.[date] ?? defaultAttendance(diners);
  const setStep = (value: number) => updateState(current => ({ ...current, guidedShop: { ...current.guidedShop!, step: value } }));
  function changeDiners(next: HouseholdDiner[]) {
    updateState(current => updateDiners(current, next));
  }
  function statusForDay(date: string, dinnerStatus: DinnerAttendance["dinnerStatus"]) {
    updateState(current => {
      const next = setAttendance(current, date, { ...attendanceFor(date), dinnerStatus });
      const plannedMeals = next.plannedMeals.filter(meal => !(meal.date === date && meal.slot === "dinner" && !meal.recipeId && meal.notes === "Guided dinner status"));
      if (dinnerStatus && dinnerStatus !== "plan") plannedMeals.push({ id: createId("meal"), date, slot: "dinner", peopleCount: 0, manualTitle: dinnerStatus === "out" ? "Eating out" : dinnerStatus === "none" ? "No meal needed" : "Leftovers", notes: "Guided dinner status" });
      return { ...next, plannedMeals };
    });
  }
  const renderAttendance = (date: string) => <AttendanceRow date={date} diners={diners} attendance={attendanceFor(date)} note={state.dayNotes[date] ?? ""} compact={step === 1}
    onChange={value => updateState(current => setAttendance(current, date, value))}
    onNote={value => updateState(current => ({ ...current, dayNotes: { ...current.dayNotes, [date]: value } }))}
    onApplyAll={() => setApplyAllDate(date)} />;
  return <div className="guided-shop view-stack">
    <div className="guided-shop-heading"><div><strong>{dateLabel(shop.startDate)} to {dateLabel(shop.endDate)}</strong><span className="muted">{shop.completedAt && finalised ? "Shopping complete" : finalised ? "List prepared" : shop.finalizedAt ? "List needs updating" : "Shop in progress"}</span></div>
      <button className="text-button" type="button" onClick={() => setNewShop(true)}><Plus size={16} />New shop</button></div>
    {newShop && <div className="shop-notice"><strong>Start the next shop?</strong><p>This shop's inclusion history is kept. The next shop starts with fresh supply and basket checks.</p><div className="button-row">
      <button className="primary-button" type="button" onClick={() => { const start = formatDateKey(addDays(new Date(`${shop.endDate}T12:00:00`), 1)); updateState(current => ({ ...current, guidedShop: createShop(start, formatDateKey(addDays(new Date(`${start}T12:00:00`), 6))) })); setNewShop(false); }}>Start next shop</button>
      <button className="text-button" type="button" onClick={() => setNewShop(false)}>Cancel</button></div></div>}
    <nav className="guided-steps" aria-label="Guided shop steps">{guidedSteps.map((label, index) => <button type="button" key={label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined}
      onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <h2 tabIndex={-1}>{guidedSteps[step]}</h2>
    {step === 0 && <>
      <ShopDatesEditor key={`${shop.startDate}:${shop.endDate}`} shop={shop} extrasCount={state.manualShoppingItems.filter(item => item.shoppingRangeKey === `${shop.startDate}__${shop.endDate}`).length} onApply={onDates} />
      <HouseholdDinersEditor diners={diners} onChange={changeDiners} />
      <div className="guided-days">{dates.map(date => <section className={`guided-day ${date === today ? "is-today" : ""}`} key={date} aria-current={date === today ? "date" : undefined}>
        {date === today && <small className="today-label">Today</small>}{renderAttendance(date)}
      </section>)}</div>
    </>}
    {step === 1 && <>
      <div className="guided-meals-tools"><label>Food to use up<textarea rows={2} value={state.useUpIngredients.join("\n")} onChange={event => updateState(current => ({ ...current, useUpIngredients: event.target.value.split("\n") }))} /></label>
        <button type="button" className="primary-button" onClick={onGenerate}><Shuffle size={16} />Fill empty dinners</button></div>
      <div className="guided-days">{dates.map(date => {
        const attendance = attendanceFor(date), meals = state.plannedMeals.filter(meal => meal.date === date && meal.slot === "dinner");
        return <section className={`guided-day ${date === today ? "is-today" : ""}`} key={date} aria-current={date === today ? "date" : undefined}>
          {date === today && <small className="today-label">Today</small>}{renderAttendance(date)}
          <div className="guided-dinner-status"><label>Dinner<select value={attendance.dinnerStatus ?? "plan"} onChange={event => statusForDay(date, event.target.value as DinnerAttendance["dinnerStatus"])}>
            <option value="plan">Plan a meal</option><option value="out">Eating out</option><option value="none">No meal needed</option><option value="leftovers">Leftovers</option>
          </select></label>{dinnerNeedsMeal(attendance) && <button type="button" className="icon-text-button" onClick={() => onOpenMeal(date, "dinner")}><Plus size={16} />Choose dinner</button>}</div>
          {meals.map(meal => {
            const recipe = state.recipes.find(row => row.id === meal.recipeId);
            const expected = dinnerNeedsMeal(attendance) ? attendancePortions(attendance, state.settings.defaultPeople) + (meal.extraPortions ?? 0) : 0;
            return <div className="guided-planned-meal" key={meal.id}>
              {recipe && !recipeAllowedForDinner(recipe, date, state.dinnerAttendance, state.dayNotes) && <p role="alert" className="shop-warning">This meal does not match the current diners or dinner status.</p>}
              {renderMeal(meal)}
              <div className="guided-meal-actions"><button type="button" className="icon-button" title={`Swap ${recipe?.title ?? meal.manualTitle}`} onClick={() => onSwap(meal)}><RefreshCw size={16} /></button>
                <button type="button" className="icon-button danger" title={`Remove ${recipe?.title ?? meal.manualTitle} and allow refill`} onClick={() => onRemove(meal.id)}><Trash2 size={16} /></button>
                <label>Cook extra portions<input type="number" min="0" max="50" step="0.5" disabled={!dinnerNeedsMeal(attendance) || !recipe} value={meal.extraPortions ?? 0} onChange={event => {
                  const extra = Math.max(0, Number(event.target.value)); updateState(current => ({ ...current, plannedMeals: current.plannedMeals.map(row => row.id === meal.id
                    ? { ...scaleMealPortions(row, Math.max(0, row.peopleCount - (row.extraPortions ?? 0)) + extra), extraPortions: extra } : row) }));
                }} /></label>
                {meal.portionSource !== "diners" && <button type="button" className="text-button" onClick={() => updateState(current => ({ ...current, plannedMeals: current.plannedMeals.map(row => row.id === meal.id ? { ...scaleMealPortions(row, expected), portionSource: "diners" } : row) }))}>Use diner portions ({expected})</button>}
              </div>
            </div>;
          })}
          {!meals.length && !dinnerNeedsMeal(attendance) && <p className="muted">{attendance.dinnerStatus === "out" ? "Eating out" : attendance.dinnerStatus === "leftovers" ? "Leftovers: no new ingredients" : "No dinner to plan"}</p>}
          <details className="guided-other-meals"><summary>Breakfast, lunch & snacks</summary>{(["breakfast", "lunch", "snack"] as MealSlot[]).map(slot => <div key={slot}>
            <div className="section-heading"><strong>{slot[0].toUpperCase() + slot.slice(1)}</strong><button type="button" className="icon-button" title={`Add ${slot} on ${date}`} onClick={() => onOpenMeal(date, slot)}><Plus size={16} /></button></div>
            {state.plannedMeals.filter(meal => meal.date === date && meal.slot === slot).map(meal => <div key={meal.id}>{renderMeal(meal)}</div>)}
          </div>)}</details>
        </section>;
      })}</div>
    </>}
    {step === 2 && extras}{step === 3 && supplies}{step === 4 && review}
    {applyAllDate && <div className="modal-backdrop"><section className="modal small-modal" role="dialog" aria-modal="true" aria-label="Apply diners to all days">
      <h2>Use these diners for every dinner?</h2><p>Individual day selections in this shop will be replaced. Comments stay unchanged.</p>
      <div className="button-row"><button className="primary-button" type="button" onClick={() => { const source = attendanceFor(applyAllDate); updateState(current => dates.reduce((next, date) => setAttendance(next, date, { ...source, confirmed: true, dinnerStatus: next.dinnerAttendance?.[date]?.dinnerStatus }), current)); setApplyAllDate(null); }}>Apply to all days</button>
        <button className="text-button" type="button" onClick={() => setApplyAllDate(null)}>Cancel</button></div>
    </section></div>}
    <footer className="guided-footer"><button type="button" className="icon-text-button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Back</button>
      {step < 4 && <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>{guidedSteps[step + 1]}<ArrowRight size={16} /></button>}
    </footer>
  </div>;
}

export function SupplyCheckList({ items, shop, onChange, renderCategory }: {
  items: ShoppingListItem[]; shop: GuidedShop; onChange: (item: ShoppingListItem, check: SupplyCheck) => void; renderCategory: (item: ShoppingListItem) => ReactNode;
}) {
  const results = resolveShop(items, shop);
  return <div className="supply-check-list">{groceryCategories.map(category => {
    const rows = results.filter(row => row.required.category === category);
    return rows.length ? <section className="supply-category" key={category}><h3>{category}</h3>{rows.map(row => <SupplyRow key={row.required.id} row={row} onChange={onChange} category={renderCategory(row.required)} />)}</section> : null;
  })}{!items.length && <p className="muted">No ingredients or extras for these dates.</p>}</div>;
}

function SupplyRow({ row, onChange, category }: { row: SupplyResult; onChange: (item: ShoppingListItem, check: SupplyCheck) => void; category: ReactNode }) {
  const item = row.required, check = row.check;
  const save = (patch: Partial<SupplyCheck>) => onChange(item, { status: check?.status ?? "need", ...check, ...patch, requirement: requirementSignature(item) });
  return <article className={`supply-row ${row.reviewReason ? "needs-review" : ""}`}>
    <div className="supply-item-name"><strong>{item.name}</strong><small>Required: {item.displayQuantity || "amount not specified"}{item.staple ? " · staple" : ""}</small>{category}</div>
    <div className="supply-inputs"><label>Supplies<select aria-label={`Supplies for ${item.name}`} value={check?.status ?? "need"} onChange={event => save({ status: event.target.value as SupplyCheck["status"] })}>
      <option value="need">Need to buy</option><option value="enough">Have enough</option><option value="some">Have some</option>
    </select></label>
    {check?.status === "some" && <><label>At home<input type="number" min="0" step="any" aria-label={`Amount at home for ${item.name}`} value={check.quantity ?? ""} onChange={event => save({ quantity: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
      <label>Unit<select aria-label={`Stock unit for ${item.name}`} value={check.unit ?? item.unit ?? ""} onChange={event => save({ unit: event.target.value })}>
        {Array.from(new Set([item.unit ?? "", "", "item", "g", "kg", "ml", "l", "tsp", "tbsp", "pack", "tin"])).map(unit => <option value={unit} key={unit}>{unit || "No unit"}</option>)}
      </select></label></>}
    <strong className="supply-buy">{row.buy ? `Buy ${row.buy.displayQuantity || "as needed"}` : "Covered at home"}</strong></div>
    {row.reviewReason && <div className="shop-warning" role="alert">{row.reviewReason}<button className="text-button" type="button" onClick={() => save({})}>Recheck current amount</button></div>}
  </article>;
}

export function ShopReviewActions({ items, shop, onFinish, onComplete, onMethod, onCopy, onPrint }: {
  items: ShoppingListItem[]; shop: GuidedShop; onFinish: () => void; onComplete: () => void;
  onMethod: (method: GuidedShop["method"]) => void; onCopy: () => void; onPrint: () => void;
}) {
  const results = resolveShop(items, shop), unresolved = results.filter(row => row.reviewReason).length, ready = shopIsFinalized(items, shop);
  const [confirmComplete, setConfirmComplete] = useState(false);
  return <section className="shop-review-actions">
    <div className="section-heading"><div><h3>{results.filter(row => row.buy).length} items to buy</h3><p role="status">{unresolved ? `${unresolved} supply checks need attention` : ready ? "List finalised" : shop.finalizedAt ? "List changed since finalising" : "Ready to finalise"}</p></div>
      <label>Shopping method<select value={shop.method} onChange={event => onMethod(event.target.value as GuidedShop["method"])}><option value="checklist">Checklist</option><option value="asda">Asda</option><option value="tesco">Tesco list</option></select></label></div>
    {shop.method === "tesco" && <p className="muted">Tesco list only. Basket filling is manual.</p>}
    <div className="button-row"><button className="primary-button" type="button" disabled={Boolean(unresolved) || ready} onClick={onFinish}><Check size={16} />{shop.finalizedAt ? "Update finalised list" : "Finish list"}</button>
      <button className="icon-text-button" type="button" disabled={Boolean(unresolved)} onClick={onCopy}><Copy size={16} />Copy buy list</button>
      <button className="text-button" type="button" disabled={Boolean(unresolved)} onClick={onPrint}>Print</button>
      <button className="text-button" type="button" disabled={!ready || Boolean(shop.completedAt)} onClick={() => setConfirmComplete(true)}>{shop.completedAt && ready ? "Shopping complete" : "Shopping complete..."}</button></div>
    {confirmComplete && <div className="shop-notice"><strong>Have you finished this shop?</strong><p>This confirms shopping is done, separately from preparing or sending the list.</p>
      <div className="button-row"><button className="primary-button" type="button" onClick={() => { onComplete(); setConfirmComplete(false); }}>Confirm shopping complete</button><button className="text-button" type="button" onClick={() => setConfirmComplete(false)}>Not yet</button></div></div>}
  </section>;
}
