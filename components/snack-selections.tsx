"use client";

import { useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { displayQuantity, type AppState } from "@/lib/domain";
import { defaultSnackGroups, setSnackSelection, snackColumn, snackRecipeGroups } from "@/lib/snacks";

export function SnackSelections({ state, updateState, onAddRecipe, onOpenRecipe }: {
  state: AppState; updateState: (updater: (state: AppState) => AppState) => void;
  onAddRecipe: (group: string) => void; onOpenRecipe: (id: string) => void;
}) {
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState(defaultSnackGroups[0]);
  const selections = state.guidedShop?.snackSelections ?? [];
  const groups = snackRecipeGroups(state.recipes);
  const unassigned = state.recipes.filter(recipe => !snackColumn(recipe.snackGroup) && (recipe.snackGroup?.trim() || recipe.mealTypes.includes("snack") || selections.some(row => row.recipeId === recipe.id)));
  const update = (recipeId: string, servings: number, ingredientIds?: string[]) => updateState(current => setSnackSelection(current, recipeId, servings, ingredientIds));
  return <section className="snack-selections" aria-label="Snack selections">
    <div className="section-heading"><span className="muted" role="status">{selections.length} selected for this shop</span></div>
    <div className="snack-column-tabs" role="tablist" aria-label="Snack columns">{groups.map((group, index) => <button type="button" role="tab" id={`snack-tab-${index}`} aria-controls={`snack-column-${index}`} aria-selected={activeGroup === group.name} tabIndex={activeGroup === group.name ? 0 : -1} key={group.name}
      onKeyDown={event => { const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (!delta) return; event.preventDefault(); const next = (index + delta + groups.length) % groups.length; setActiveGroup(groups[next].name); document.getElementById(`snack-tab-${next}`)?.focus(); }}
      onClick={() => setActiveGroup(group.name)}>{group.name}<small>{selections.filter(row => group.recipes.some(recipe => recipe.id === row.recipeId)).length}</small></button>)}</div>
    <div className="snack-groups">{groups.map((group, index) => <section className={`snack-group ${activeGroup === group.name ? "is-active" : ""}`} id={`snack-column-${index}`} key={group.name} aria-label={group.name}>
      <div className="snack-group-heading"><h4>{group.name}</h4><button className="icon-button" type="button" title={`Add recipe to ${group.name}`} onClick={() => onAddRecipe(group.name)}><Plus size={16} /></button></div>
      <label className="snack-search"><Search size={15} /><input aria-label={`Search ${group.name}`} placeholder="Search recipes" value={searches[group.name] ?? ""} onChange={event => setSearches(current => ({ ...current, [group.name]: event.target.value }))} /></label>
      <div className="snack-group-recipes" tabIndex={0} aria-label={`${group.name} recipes`}>{group.recipes.filter(recipe => `${recipe.title} ${recipe.ingredients.map(item => item.name).join(" ")}`.toLowerCase().includes((searches[group.name] ?? "").trim().toLowerCase())).map(recipe => {
        const selection = selections.find(row => row.recipeId === recipe.id);
        const portions = selection?.servings ?? Math.max(1, recipe.servings);
        return <article className={`snack-choice ${selection ? "is-selected" : ""}`} key={recipe.id}>
          <button type="button" className="icon-button snack-select" aria-label={`${selection ? "Remove" : "Add"} ${recipe.title} ${selection ? "from" : "to"} this shop`} aria-pressed={Boolean(selection)} title={selection ? "Remove from this shop" : "Add to this shop"} onClick={() => update(recipe.id, selection ? 0 : portions)}>{selection ? <Check size={17} /> : <Plus size={17} />}</button>
          <div className="snack-choice-name"><button type="button" onClick={() => onOpenRecipe(recipe.id)}>{recipe.title}</button>
            <small>{recipe.ingredients.filter(item => (item.role ?? "required") === "required" || selection?.selectedIngredientIds?.includes(item.id)).map(item => item.name).join(", ")}</small></div>
          {selection ? <div className="snack-portions"><span>Portions</span><div>
            <button className="icon-button" type="button" title={`Fewer portions of ${recipe.title}`} disabled={portions <= 0.5} onClick={() => update(recipe.id, Math.max(0.5, portions - 1))}><Minus size={14} /></button>
            <input type="number" min="0.5" max="100" step="0.5" aria-label={`Portions of ${recipe.title}`} value={portions} onChange={event => { if (event.target.value) update(recipe.id, Number(event.target.value)); }} />
            <button className="icon-button" type="button" title={`More portions of ${recipe.title}`} disabled={portions >= 100} onClick={() => update(recipe.id, portions + 1)}><Plus size={14} /></button>
          </div></div> : <span className="snack-yield">Serves {recipe.servings}</span>}
          {selection && recipe.ingredients.some(item => item.role === "optional" || item.role === "side") && <details className="snack-optional"><summary>Optional ingredients & sides</summary>
            {recipe.ingredients.filter(item => item.role === "optional" || item.role === "side").map(item => <label key={item.id}>
              <input type="checkbox" checked={selection.selectedIngredientIds?.includes(item.id) ?? false} onChange={event => update(recipe.id, portions, event.target.checked ? [...(selection.selectedIngredientIds ?? []), item.id] : selection.selectedIngredientIds?.filter(id => id !== item.id))} />
              {item.name}<small>{displayQuantity(typeof item.quantity === "number" ? item.quantity * portions / Math.max(1, recipe.servings) : undefined, item.unit)}</small>
            </label>)}
          </details>}
        </article>;
      })}{!group.recipes.length && <p className="muted snack-empty">No recipes assigned.</p>}
      {group.recipes.length > 0 && !group.recipes.some(recipe => `${recipe.title} ${recipe.ingredients.map(item => item.name).join(" ")}`.toLowerCase().includes((searches[group.name] ?? "").trim().toLowerCase())) && <p className="muted snack-empty">No matching recipes.</p>}</div>
    </section>)}</div>
    {unassigned.length > 0 && <details className="snack-unassigned"><summary>Needs a column ({unassigned.length})</summary>{unassigned.map(recipe => <div key={recipe.id}><button type="button" className="text-button" onClick={() => onOpenRecipe(recipe.id)}>{recipe.title}</button>
      <select aria-label={`Column for ${recipe.title}`} value="" onChange={event => { const group = event.target.value; updateState(current => ({ ...current, recipes: current.recipes.map(row => row.id === recipe.id ? { ...row, snackGroup: group, updatedAt: new Date().toISOString() } : row) })); }}><option value="" disabled>Choose column</option>{defaultSnackGroups.map(group => <option key={group}>{group}</option>)}</select>
      {selections.some(row => row.recipeId === recipe.id) && <button type="button" className="text-button" onClick={() => update(recipe.id, 0)}>Remove from shop</button>}
    </div>)}</details>}
    {selections.filter(selection => !state.recipes.some(recipe => recipe.id === selection.recipeId)).map(selection => <div className="shop-warning" key={selection.recipeId}>A selected snack recipe is no longer available.<button type="button" className="text-button" onClick={() => update(selection.recipeId, 0)}>Remove selection</button></div>)}
  </section>;
}
