"use client";

import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import { mealSlots, type Recipe } from "@/lib/domain";
import { defaultSnackGroups, snackColumn } from "@/lib/snacks";
import { emptyRecipeFilters, matchesRecipeFilters } from "@/lib/recipe-filters";
import { RecipeFilterControls } from "./recipe-filter-controls";

export function BatchRecipeGroups({ recipes, onAssign, onClose }: {
  recipes: Recipe[]; onAssign: (ids: string[], group: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(""), [group, setGroup] = useState(defaultSnackGroups[0]);
  const [mealType, setMealType] = useState("all"), [column, setColumn] = useState("all");
  const [filters, setFilters] = useState(emptyRecipeFilters), [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const shown = recipes.filter(recipe => (mealType === "all" || recipe.mealTypes.some(type => type === mealType))
    && (column === "all" || (snackColumn(recipe.snackGroup) ?? "unassigned") === column)
    && matchesRecipeFilters(recipe, filters)
    && [recipe.title, recipe.source, ...recipe.tags, ...recipe.ingredients.map(item => item.name)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const selectedIds = selected.filter(id => recipes.some(recipe => recipe.id === id));
  return <div className="modal-backdrop"><section className="modal-panel batch-groups-dialog" role="dialog" aria-modal="true" aria-label="Assign recipe columns" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <div className="section-heading"><h2>Assign recipe columns</h2><button type="button" className="icon-button" title="Close column assignment" onClick={onClose}><X size={18} /></button></div>
    <label className="search-box"><Search size={17} /><input autoFocus aria-label="Search recipes to assign" placeholder="Search recipes" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="batch-group-filters"><label>Meal slot<select value={mealType} onChange={event => setMealType(event.target.value)}><option value="all">All meals</option>{mealSlots.map(slot => <option key={slot}>{slot}</option>)}</select></label>
      <label>Current column<select value={column} onChange={event => setColumn(event.target.value)}><option value="all">All columns</option><option value="unassigned">Unassigned</option>{defaultSnackGroups.map(name => <option key={name}>{name}</option>)}</select></label></div>
    <RecipeFilterControls value={filters} onChange={setFilters} tags={[...new Set(recipes.flatMap(recipe => recipe.tags))].sort()} />
    <div className="button-row"><strong>{selectedIds.length} selected / {shown.length} shown</strong><button type="button" className="text-button" onClick={() => setSelected([...new Set([...selectedIds, ...shown.map(recipe => recipe.id)])])} disabled={!shown.length}>Select all filtered</button><button type="button" className="text-button" onClick={() => setSelected([])} disabled={!selectedIds.length}>Clear selection</button></div>
    <div className="batch-group-recipes">{shown.map(recipe => <label key={recipe.id}><input type="checkbox" aria-label={`Select ${recipe.title}`} checked={selectedIds.includes(recipe.id)} onChange={event => setSelected(event.target.checked ? [...selectedIds, recipe.id] : selectedIds.filter(id => id !== recipe.id))} /><span>{recipe.title}</span><small>{snackColumn(recipe.snackGroup) ?? "Unassigned"}</small></label>)}{!shown.length && <p>No matching recipes.</p>}</div>
    <div className="batch-group-apply"><label>Assign to<select value={group} onChange={event => setGroup(event.target.value)}>{defaultSnackGroups.map(name => <option key={name}>{name}</option>)}<option value="">No column</option></select></label><button type="button" className="primary-button" disabled={!selectedIds.length} onClick={() => { onAssign(selectedIds, group); setMessage(`${selectedIds.length} ${selectedIds.length === 1 ? "recipe" : "recipes"} ${group ? `assigned to ${group}` : "removed from columns"}.`); setSelected([]); }}><Check size={16} />Apply to {selectedIds.length} {selectedIds.length === 1 ? "recipe" : "recipes"}</button></div>
    {message && <p role="status">{message}</p>}
  </section></div>;
}
