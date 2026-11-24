"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Plus, Settings, Trash2 } from "lucide-react";
import { addDays, createId, formatDateKey, groceryCategories, type AppState, type GuidedShop, type HouseholdDiner, type MealSlot, type PlannedMeal, type RecipeReaction, type ShoppingListItem, type SupplyCheck } from "@/lib/domain";
import { changeDiners as updateDiners, createShop, guidedSteps, requiredShopItems, requirementSignature, resolveShop, shopDates, shopIsFinalized, type SupplyResult } from "@/lib/guided-shop";
import { ShopCalendar } from "./shop-calendar";
import { GuidedMealWorkspace } from "./guided-meal-workspace";
import { GuidedMealCalendar } from "./guided-meal-calendar";
import { DinerCalendar } from "./diner-calendar";
import { dinerColor, nextDinerColor } from "@/lib/diner-colors";

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
    {diners.map((diner, index) => <div className="shop-diner-edit" key={diner.id}>
      <label>Name<input aria-label={`Name for ${diner.name}`} value={diner.name} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, name: event.target.value } : row))} /></label>
      <label className="diner-color-control">Colour<input type="color" aria-label={`Colour for ${diner.name || "Unnamed diner"}`} title={`Colour for ${diner.name || "Unnamed diner"}`} value={dinerColor(diner, index)} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, color: event.target.value } : row))} /></label>
      <label>Default portions<input type="number" min="0" max="20" step="0.25" value={diner.portions} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, portions: Math.max(0, Number(event.target.value)) } : row))} /></label>
      <label className="toggle-line"><input type="checkbox" checked={diner.usual} onChange={event => onChange(diners.map(row => row.id === diner.id ? { ...row, usual: event.target.checked } : row))} />Usually eating</label>
      <button type="button" className="icon-button danger" title={`Remove diner ${diner.name}`} onClick={() => onChange(diners.filter(row => row.id !== diner.id))}><Trash2 size={16} /></button>
    </div>)}
    <button type="button" className="icon-text-button" onClick={() => onChange([...diners, { id: createId("diner"), name: "New diner", portions: 1, usual: true, color: nextDinerColor(diners) }])}><Plus size={16} />Add diner</button>
  </details>;
}

export function GuidedShopView({ state, updateState, onDates, onOpenMeal, onRemove, onAddLeftovers, extras, supplies, review, suggestions, preferenceScores, reactions, onOpenRecipe }: {
  state: AppState; updateState: UpdateState; onDates: (start: string, end: string) => void;
  onOpenMeal: (date: string, slot: MealSlot) => void; onAddLeftovers: (meal: PlannedMeal) => void;
  onRemove: (id: string) => void;
  extras: ReactNode; supplies: ReactNode; review: ReactNode;
  suggestions: { recipeIds: string[]; coveredIngredients: string[]; missingIngredients: string[] }[];
  preferenceScores: Record<string, number>; reactions: Record<string, RecipeReaction>; onOpenRecipe: (id: string) => void;
}) {
  const shop = state.guidedShop!, diners = state.settings.diners ?? [], dates = shopDates(shop.startDate, shop.endDate);
  const [newShop, setNewShop] = useState(false);
  const [pendingDates, setPendingDates] = useState(false);
  const step = Math.min(4, Math.max(0, shop.step));
  const finalised = shopIsFinalized(requiredShopItems(state, shop), shop);
  const setStep = (value: number) => updateState(current => ({ ...current, guidedShop: { ...current.guidedShop!, step: value } }));
  function changeDiners(next: HouseholdDiner[]) {
    updateState(current => updateDiners(current, next));
  }
  return <div className="guided-shop view-stack">
    <div className="guided-shop-heading"><div><strong>{dateLabel(shop.startDate)} to {dateLabel(shop.endDate)}</strong><span className="muted">{shop.completedAt && finalised ? "Shopping complete" : finalised ? "List prepared" : shop.finalizedAt ? "List needs updating" : "Shop in progress"}</span></div>
      <button className="text-button" type="button" onClick={() => setNewShop(true)}><Plus size={16} />New shop</button></div>
    {newShop && <div className="shop-notice"><strong>Start the next shop?</strong><p>This shop's inclusion history is kept. The next shop starts with fresh supply and basket checks.</p><div className="button-row">
      <button className="primary-button" type="button" onClick={() => { const start = formatDateKey(addDays(new Date(`${shop.endDate}T12:00:00`), 1)); updateState(current => ({ ...current, guidedShop: { ...createShop(start, formatDateKey(addDays(new Date(`${start}T12:00:00`), 6))), unplannedMeals: current.guidedShop?.unplannedMeals } })); setNewShop(false); }}>Start next shop</button>
      <button className="text-button" type="button" onClick={() => setNewShop(false)}>Cancel</button></div></div>}
    <nav className="guided-steps" aria-label="Guided shop steps">{guidedSteps.map((label, index) => <button type="button" key={label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined}
      disabled={pendingDates && index !== 0} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    {step > 1 && <h2 tabIndex={-1}>{guidedSteps[step]}</h2>}
    {step === 0 && <div className="guided-dates-workspace">
      <ShopCalendar key={`${shop.startDate}:${shop.endDate}`} shop={shop} plannedMeals={state.plannedMeals} extrasCount={state.manualShoppingItems.filter(item => item.shoppingRangeKey === `${shop.startDate}__${shop.endDate}`).length} onApply={onDates} onPending={setPendingDates} />
      {!pendingDates && dates.length > 0 && <DinerCalendar key={shop.startDate + ":" + shop.endDate} state={state} updateState={updateState}><HouseholdDinersEditor diners={diners} onChange={changeDiners} /></DinerCalendar>}
    </div>}
    {step === 1 && <GuidedMealWorkspace key={`${shop.id}:${shop.startDate}:${shop.endDate}`} state={state} updateState={updateState} suggestions={suggestions} preferenceScores={preferenceScores} reactions={reactions} onOpenRecipe={onOpenRecipe}>
      {controls => <GuidedMealCalendar state={state} updateState={updateState} controls={controls} onOpenMeal={onOpenMeal} onOpenRecipe={onOpenRecipe} onRemove={onRemove} onAddLeftovers={onAddLeftovers} />}
    </GuidedMealWorkspace>}
    {step === 2 && extras}{step === 3 && supplies}{step === 4 && review}
    <footer className="guided-footer"><button type="button" className="icon-text-button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Back</button>
      {step < 4 && <button type="button" className="primary-button" disabled={pendingDates} onClick={() => setStep(step + 1)}>{guidedSteps[step + 1]}<ArrowRight size={16} /></button>}
    </footer>
  </div>;
}

export function SupplyCheckList({ items, shop, onChange, renderCategory }: {
  items: ShoppingListItem[]; shop: GuidedShop; onChange: (item: ShoppingListItem, check: SupplyCheck) => void; renderCategory: (item: ShoppingListItem) => ReactNode;
}) {
  const [hideCovered, setHideCovered] = useState(false);
  const results = resolveShop(items, shop);
  const groups = groceryCategories.map(category => ({ category, rows: results.filter(row => row.required.category === category) })).filter(group => group.rows.length);
  const columns = Array.from({ length: 5 }, () => ({ weight: 0, groups: [] as typeof groups }));
  for (const group of groups) {
    const column = columns.reduce((shortest, next) => next.weight < shortest.weight ? next : shortest);
    column.groups.push(group);
    column.weight += group.rows.length + 1;
  }
  return <div className="supply-check-list"><div className="supply-list-heading"><p className="muted" role="status">{results.filter(row => !row.buy).length} already got · {results.filter(row => row.buy).length} to buy</p>
    <label className="toggle-line"><input type="checkbox" checked={hideCovered} onChange={event => setHideCovered(event.target.checked)} />Hide already got</label></div><div className="supply-category-columns">{columns.map((column, index) => <div className="supply-category-column" key={index}>{column.groups.map(({ category, rows: allRows }) => {
      const rows = allRows.filter(row => !hideCovered || row.buy || row.reviewReason);
      return rows.length ? <section className="supply-category" key={category}><h3>{category}</h3>{rows.map(row => <SupplyRow key={row.required.id} row={row} onChange={onChange} category={renderCategory(row.required)} />)}</section> : null;
    })}</div>)}</div>{!items.length ? <p className="muted">No ingredients or extras for these dates.</p> : hideCovered && !results.some(row => row.buy || row.reviewReason) && <p className="muted">All supplies already covered.</p>}</div>;
}

function SupplyRow({ row, onChange, category }: { row: SupplyResult; onChange: (item: ShoppingListItem, check: SupplyCheck) => void; category: ReactNode }) {
  const item = row.required, covered = !row.buy && !row.reviewReason;
  const save = (status: "need" | "enough") => onChange(item, { status, requirement: requirementSignature(item) });
  return <article className={`supply-row ${covered ? "is-covered" : ""} ${row.reviewReason ? "needs-review" : ""}`}>
    <button type="button" className="supply-toggle" aria-label={`Already got ${item.name}`} aria-pressed={covered} title={covered ? "Need to buy" : "Already got"} onClick={() => save(covered ? "need" : "enough")}><Check size={17} /></button>
    <div className="supply-item-name"><strong>{item.name}</strong>{item.staple && <small>Staple</small>}
      <small className="supply-meal-sources">{item.manual ? "Manual extra" : item.sourceMeals.join(", ")}</small></div>
    <span className="supply-quantity">{item.displayQuantity || "As needed"}</span>{category}
    {row.reviewReason && <div className="shop-warning" role="alert">{row.reviewReason}<button className="text-button" type="button" onClick={() => save("need")}>Need to buy</button></div>}
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
