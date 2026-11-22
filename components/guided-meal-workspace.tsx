"use client";

import { useEffect, useMemo, useState, type DragEvent, type HTMLAttributes, type ReactNode } from "react";
import { CalendarPlus, Check, GripVertical, Plus, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import { createId, type AppState, type PlannedMeal, type RecipeReaction } from "@/lib/domain";
import { buildAutoDinnerPlan, type AutoDinnerPlanEntry, type AutoDinnerPlanMode, type AutoDinnerPlanResult } from "@/lib/dinner-planner";
import { dinnerNeedsMeal, recipeAllowedForDinner, shopDates } from "@/lib/guided-shop";
import { applyGuidedDinnerPreview, mealFromDinnerEntry, placeGuidedMeal, type GuidedMealSource } from "@/lib/guided-planning";

type Payload = { kind: "planned" | "parked" | "recipe" | "preview"; id: string };
type Suggestion = { recipeIds: string[]; coveredIngredients: string[]; missingIngredients: string[] };
type UpdateState = (updater: (state: AppState) => AppState) => void;
export type GuidedDragControls = {
  dropProps: (date: string | null) => HTMLAttributes<HTMLElement>;
  moveControl: (meal: PlannedMeal) => ReactNode;
  parkMeal: (meal: PlannedMeal) => void;
};
const dragType = "application/x-weekwise-guided-meal";
const dayLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

export function GuidedMealWorkspace({ state, updateState, suggestions, preferenceScores, reactions, onOpenRecipe, children }: {
  state: AppState; updateState: UpdateState; suggestions: Suggestion[]; preferenceScores: Record<string, number>;
  reactions: Record<string, RecipeReaction>; onOpenRecipe: (id: string) => void; children: (controls: GuidedDragControls) => ReactNode;
}) {
  const shop = state.guidedShop!, dates = shopDates(shop.startDate, shop.endDate);
  const [start, setStart] = useState(shop.startDate), [end, setEnd] = useState(shop.endDate);
  const [mode, setMode] = useState<AutoDinnerPlanMode>("fill"), [variation, setVariation] = useState(0);
  const [preview, setPreview] = useState<AutoDinnerPlanResult | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [dragging, setDragging] = useState<Payload | null>(null), [over, setOver] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Payload | null>(null), [message, setMessage] = useState("");
  // Invalidate suggestions when planning rules change, not on unrelated shopping updates.
  const context = JSON.stringify([state.recipes, state.dinnerAttendance, state.dayNotes, state.useUpIngredients, state.settings.ingredientAliases, preferenceScores, reactions]);
  useEffect(() => { setPreview(null); setExcluded([]); }, [context]);
  const previewDates = shopDates(start, end);
  const missingDates = preview ? previewDates.filter(date => dinnerNeedsMeal(state.dinnerAttendance?.[date]) && !preview.entries.some(entry => entry.date === date) && !preview.preservedDinners.some(row => row.meal.date === date)) : [];
  const enabled = !state.settings.hiddenSlots.includes("dinner") && previewDates.length > 0;
  const request = { startDate: start, endDate: end, mode, recipes: state.recipes, plannedMeals: state.plannedMeals,
    peopleCount: state.settings.defaultPeople, ingredientAliases: state.settings.ingredientAliases, useUpIngredients: state.useUpIngredients,
    dayNotes: state.dayNotes, dinnerAttendance: state.dinnerAttendance, recipePreferenceScores: preferenceScores, recipeReactions: reactions };
  function build(nextVariation: number) {
    setVariation(nextVariation); setExcluded([]); setMessage("");
    setPreview(buildAutoDinnerPlan({ ...request, variationSeed: nextVariation, excludedRecipeIds: shop.excludedRecipeIds }));
  }
  function removeEntry(entry: AutoDinnerPlanEntry) {
    setExcluded(current => [...new Set([...current, entry.recipeId])]);
    setPreview(current => current && ({ ...current, entries: current.entries.filter(row => row !== entry), summary: { ...current.summary,
      categoryCounts: { ...current.summary.categoryCounts, [entry.category]: Math.max(0, current.summary.categoryCounts[entry.category] - 1) },
      quickCount: current.summary.quickCount - Number(entry.quick), familiarCount: current.summary.familiarCount - Number(entry.familiar), recipeDinnerCount: current.summary.recipeDinnerCount - 1 } }));
  }
  function refill() {
    if (!preview) return;
    const draftMeals = preview.entries.map(entry => mealFromDinnerEntry(entry, state.settings.defaultPeople));
    const retained = mode === "replace" ? state.plannedMeals.filter(meal => meal.slot !== "dinner" || meal.date < start || meal.date > end || !dinnerNeedsMeal(state.dinnerAttendance?.[meal.date])) : state.plannedMeals;
    const result = buildAutoDinnerPlan({ ...request, mode: "fill", plannedMeals: [...retained, ...draftMeals], variationSeed: variation + 1, excludedRecipeIds: [...shop.excludedRecipeIds, ...excluded] });
    const draftIds = new Set(draftMeals.map(meal => meal.id));
    setVariation(variation + 1); setPreview({ ...result, mode, entries: [...preview.entries, ...result.entries].sort((a, b) => a.date.localeCompare(b.date)), preservedDinners: result.preservedDinners.filter(row => !draftIds.has(row.meal.id)) });
  }
  function sourceFor(payload: Payload, current = state): GuidedMealSource | null {
    if (payload.kind === "planned" || payload.kind === "parked") {
      const meal = (payload.kind === "planned" ? current.plannedMeals : current.guidedShop?.unplannedMeals ?? []).find(row => row.id === payload.id);
      return meal ? { kind: payload.kind, meal } : null;
    }
    if (payload.kind === "preview") {
      const entry = preview?.entries.find(row => `${row.date}:${row.recipeId}` === payload.id);
      return entry ? { kind: "new", meal: mealFromDinnerEntry(entry, current.settings.defaultPeople) } : null;
    }
    const recipe = current.recipes.find(row => row.id === payload.id);
    return recipe ? { kind: "new", meal: { id: createId("meal"), date: start, slot: "dinner", recipeId: recipe.id, peopleCount: current.settings.defaultPeople, portionSource: "diners", notes: "Uses food already at home" } } : null;
  }
  function place(payload: Payload, date: string | null) {
    const source = sourceFor(payload);
    if (!source) return;
    const result = placeGuidedMeal(state, source, date);
    if (result.error) { setMessage(result.error); return; }
    if (result.state === state) { setPlacement(null); return; }
    // Keep the rest of a preview as saved, unassigned meals after an individual placement.
    const remaining = (preview?.entries ?? []).filter(entry => payload.kind !== "preview" || `${entry.date}:${entry.recipeId}` !== payload.id).map(entry => mealFromDinnerEntry(entry, state.settings.defaultPeople));
    updateState(current => {
      const freshSource = payload.kind === "planned" || payload.kind === "parked" ? sourceFor(payload, current) : source;
      if (!freshSource) return current;
      const next = placeGuidedMeal(current, freshSource, date);
      if (next.error) return current;
      return { ...next.state, guidedShop: { ...next.state.guidedShop!, unplannedMeals: [...(next.state.guidedShop!.unplannedMeals ?? []), ...remaining] } };
    });
    setPreview(null); setPlacement(null); setDragging(null); setOver(null);
    setMessage(`${date ? "Dinner scheduled." : "Dinner moved to Unscheduled."}${remaining.length ? ` ${remaining.length} remaining suggestions kept in Unscheduled.` : ""}`);
  }
  function dragProps(payload: Payload): HTMLAttributes<HTMLElement> {
    return { draggable: true, onDragStart: event => { event.dataTransfer.setData(dragType, JSON.stringify(payload)); event.dataTransfer.effectAllowed = payload.kind === "recipe" ? "copy" : "move"; setDragging(payload); }, onDragEnd: () => { setDragging(null); setOver(null); } };
  }
  function dropProps(date: string | null): HTMLAttributes<HTMLElement> {
    const key = date ?? "parked";
    return { className: over === key ? "is-drop-target" : undefined,
      onDragOver: event => { if (!event.dataTransfer.types.includes(dragType)) return; event.preventDefault(); event.dataTransfer.dropEffect = dragging?.kind === "recipe" ? "copy" : "move"; setOver(key); },
      onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null); },
      onDrop: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setOver(null); try { const payload = JSON.parse(event.dataTransfer.getData(dragType)) as Payload; if (["planned", "parked", "recipe", "preview"].includes(payload.kind) && typeof payload.id === "string") place(payload, date); } catch { setMessage("That item cannot be moved here."); } } };
  }
  function handle(payload: Payload, title: string) {
    return <button type="button" className="icon-button meal-drag-handle" title={`Move ${title}`} {...dragProps(payload)} onClick={() => { setPlacement(payload); setMessage(""); }}><GripVertical size={16} /></button>;
  }
  const suggestionRows = useMemo(() => suggestions.slice(0, 3), [suggestions]);
  function recipeRow(payload: Payload, recipeId: string | undefined, title: string, detail?: string, remove?: () => void) {
    const recipe = state.recipes.find(row => row.id === recipeId);
    return <article className="guided-recipe-option" {...dragProps(payload)} key={`${payload.kind}:${payload.id}`}>
      {handle(payload, title)}
      <div className="guided-option-title"><button type="button" onClick={() => recipeId ? onOpenRecipe(recipeId) : setPlacement(payload)}>{title}</button>{detail && <small>{detail}</small>}</div>
      {recipe?.mealImageUrl && <img src={recipe.mealImageUrl} alt="" loading="lazy" className="guided-recipe-thumb" />}
      <button type="button" className="icon-button" title={`Schedule ${title}`} onClick={() => { setPlacement(payload); setMessage(""); }}><CalendarPlus size={16} /></button>
      {remove && <button type="button" className="icon-button danger" title={`Remove ${title} from suggestions`} onClick={remove}><X size={15} /></button>}
    </article>;
  }
  const selectedSource = placement ? sourceFor(placement) : null;
  return <div className={`guided-meal-workspace ${dragging ? "is-dragging" : ""}`}>
    <aside className="guided-planning-tools" aria-label="Dinner planning tools">
      <section className="guided-tool-section">
        <div className="guided-tool-heading"><h3>Food to use up</h3>{state.useUpIngredients.some(value => value.trim()) && <button type="button" className="icon-button" title="Clear food to use up" onClick={() => updateState(current => ({ ...current, useUpIngredients: [] }))}><Trash2 size={16} /></button>}</div>
        <textarea aria-label="Food to use up" rows={3} value={state.useUpIngredients.join("\n")} onChange={event => updateState(current => ({ ...current, useUpIngredients: event.target.value.split("\n") }))} />
        {suggestionRows.map((suggestion, index) => <div className="guided-use-up-match" key={suggestion.recipeIds.join(":")}>
          <small>{index === 0 ? "Best match" : "Alternative"} · {suggestion.coveredIngredients.join(", ")}</small>
          {suggestion.recipeIds.map(id => { const recipe = state.recipes.find(row => row.id === id); return recipe ? recipeRow({ kind: "recipe", id }, id, recipe.title) : null; })}
          {suggestion.missingIngredients.length > 0 && <small>Still to use: {suggestion.missingIngredients.join(", ")}</small>}
        </div>)}
        {state.useUpIngredients.some(value => value.trim()) && !suggestionRows.length && <p className="muted">No matching dinners.</p>}
      </section>
      <section className="guided-tool-section guided-auto-plan">
        <h3>Auto-plan dinners</h3>
        <div className="guided-auto-dates"><label>From<select aria-label="Auto-plan start date" value={start} onChange={event => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); setPreview(null); }}>{dates.map(date => <option key={date} value={date}>{dayLabel(date)}</option>)}</select></label>
          <label>To<select aria-label="Auto-plan end date" value={end} onChange={event => { setEnd(event.target.value); setPreview(null); }}>{dates.filter(date => date >= start).map(date => <option key={date} value={date}>{dayLabel(date)}</option>)}</select></label></div>
        <div className="segmented-control" role="group" aria-label="Existing dinner behavior">{(["fill", "replace"] as const).map(value => <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setPreview(null); setExcluded([]); }}>{value === "fill" ? "Fill empty" : "Replace dinners"}</button>)}</div>
        <button className="primary-button" type="button" disabled={!enabled} onClick={() => build(0)}><Wand2 size={16} />Build plan</button>
        {!enabled && <p className="muted">Enable Dinner in Settings to auto-plan.</p>}
        {preview && <div className="guided-plan-preview">
          <div className="guided-tool-heading"><strong>{preview.entries.length} suggestions</strong><button className="icon-button" type="button" title="Try another mix" onClick={() => build(variation + 1)}><RefreshCw size={16} /></button></div>
          {preview.entries.map(entry => recipeRow({ kind: "preview", id: `${entry.date}:${entry.recipeId}` }, entry.recipeId, state.recipes.find(row => row.id === entry.recipeId)?.title ?? "Dinner", dayLabel(entry.date), () => removeEntry(entry)))}
          {missingDates.length > 0 && <button className="icon-text-button" type="button" onClick={refill}><Plus size={16} />Fill {missingDates.length} empty {missingDates.length === 1 ? "meal" : "meals"}</button>}
          <details className="guided-plan-details"><summary>Plan balance{preview.warnings.length ? ` · ${preview.warnings.length} notes` : ""}</summary>
            <dl>{(["vegetarian", "chicken", "fish", "pork-beef"] as const).map(category => <div key={category}><dt>{category}</dt><dd>{preview.summary.categoryCounts[category]} / {preview.summary.categoryTargets[category]}</dd></div>)}
              <div><dt>Quick</dt><dd>{preview.summary.quickCount} / {preview.summary.quickTarget}</dd></div><div><dt>Familiar</dt><dd>{preview.summary.familiarCount} / {preview.summary.familiarTarget}</dd></div></dl>
            {preview.preservedDinners.length > 0 && <p>{preview.preservedDinners.length} existing dinners kept.</p>}
            {preview.warnings.map(warning => <p key={warning}>{warning}</p>)}
          </details>
          <button type="button" className="primary-button" disabled={!preview.entries.length} onClick={() => { updateState(current => applyGuidedDinnerPreview(current, preview)); setPreview(null); setMessage("Dinner plan applied."); }}><Check size={16} />Apply dinner plan</button>
        </div>}
      </section>
      <section {...dropProps(null)} className={`guided-unscheduled guided-tool-section ${over === "parked" ? "is-drop-target" : ""}`} aria-label="Unscheduled dinners">
        <h3>Unscheduled <span>{shop.unplannedMeals?.length ?? 0}</span></h3>
        {!shop.unplannedMeals?.length && <p className="muted">No unscheduled meals</p>}
        {shop.unplannedMeals?.map(meal => recipeRow({ kind: "parked", id: meal.id }, meal.recipeId, state.recipes.find(row => row.id === meal.recipeId)?.title ?? meal.manualTitle ?? "Dinner", undefined,
          () => updateState(current => ({ ...current, guidedShop: { ...current.guidedShop!, unplannedMeals: current.guidedShop!.unplannedMeals?.filter(row => row.id !== meal.id),
            excludedRecipeIds: [...new Set([...current.guidedShop!.excludedRecipeIds, ...(meal.recipeId ? [meal.recipeId] : [])])] } }))))}
      </section>
    </aside>
    <div className="guided-selected-days"><div className="guided-tool-heading"><h3>Selected days</h3><span>{dates.length} days</span></div>
      {message && <p role="status" className="shop-notice">{message}</p>}
      {children({ dropProps, moveControl: meal => handle({ kind: "planned", id: meal.id }, state.recipes.find(row => row.id === meal.recipeId)?.title ?? meal.manualTitle ?? "Dinner"), parkMeal: meal => place({ kind: "planned", id: meal.id }, null) })}
    </div>
    {placement && selectedSource && <div className="modal-backdrop"><section className="modal small-modal guided-place-dialog" role="dialog" aria-modal="true" aria-label="Choose dinner day" onKeyDown={event => { if (event.key === "Escape") setPlacement(null); }}>
      <div className="section-heading"><h2>Choose dinner day</h2><button autoFocus className="icon-button" type="button" title="Close day chooser" onClick={() => setPlacement(null)}><X size={18} /></button></div>
      <strong>{state.recipes.find(row => row.id === selectedSource.meal.recipeId)?.title ?? selectedSource.meal.manualTitle}</strong>
      {message && <p role="status">{message}</p>}
      <div className="guided-destination-list">{dates.map(date => { const error = placeGuidedMeal(state, selectedSource, date).error; const existing = state.plannedMeals.filter(row => row.date === date && row.slot === "dinner"); return <button type="button" disabled={Boolean(error)} title={error ?? undefined} key={date} onClick={() => place(placement, date)}><strong>{dayLabel(date)}</strong><small>{error ?? (existing.map(meal => state.recipes.find(row => row.id === meal.recipeId)?.title ?? meal.manualTitle).join(", ") || "Empty")}</small></button>; })}</div>
      <button className="text-button" type="button" onClick={() => place(placement, null)}>Keep unscheduled</button>
    </section></div>}
  </div>;
}
