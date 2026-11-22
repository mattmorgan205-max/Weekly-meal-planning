"use client";

import { useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { displayQuantity, type AppState } from "@/lib/domain";
import { setSnackSelection, snackRecipeGroups } from "@/lib/snacks";

export function SnackSelections({ state, updateState, onAddRecipe, onOpenRecipe }: {
  state: AppState; updateState: (updater: (state: AppState) => AppState) => void;
  onAddRecipe: () => void; onOpenRecipe: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selections = state.guidedShop?.snackSelections ?? [];
  const groups = snackRecipeGroups(state.recipes, selections.map(row => row.recipeId));
  const query = search.trim().toLowerCase();
  const visible = groups.map(group => ({ ...group, recipes: group.recipes.filter(recipe =>
    `${group.name} ${recipe.title} ${recipe.ingredients.map(item => item.name).join(" ")}`.toLowerCase().includes(query)) })).filter(group => group.recipes.length);
  const update = (recipeId: string, servings: number, ingredientIds?: string[]) => updateState(current => setSnackSelection(current, recipeId, servings, ingredientIds));
  return <section className="snack-selections" aria-label="Snack selections">
    <div className="section-heading"><div><h3>Snacks</h3><span className="muted">{selections.length} selected for this shop</span></div>
      <button className="icon-text-button" type="button" onClick={onAddRecipe}><Plus size={16} />Add snack recipe</button></div>
    {groups.length > 0 && <label className="snack-search"><Search size={16} /><input aria-label="Search snacks" placeholder="Search snacks or groups" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {!groups.length && <p className="muted">No snack recipes yet.</p>}
    {groups.length > 0 && !visible.length && <p className="muted">No matching snacks.</p>}
    <div className="snack-groups">{visible.map(group => <section className="snack-group" key={group.name.toLowerCase()} aria-label={group.name}>
      <h4>{group.name}</h4>
      <div className="snack-group-recipes">{group.recipes.map(recipe => {
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
      })}</div>
    </section>)}</div>
    {selections.filter(selection => !state.recipes.some(recipe => recipe.id === selection.recipeId)).map(selection => <div className="shop-warning" key={selection.recipeId}>A selected snack recipe is no longer available.<button type="button" className="text-button" onClick={() => update(selection.recipeId, 0)}>Remove selection</button></div>)}
  </section>;
}
