"use client";

import { RotateCcw } from "lucide-react";
import { emptyRecipeFilters, hasRecipeFilters, type RecipeFilters } from "@/lib/recipe-filters";
import { customRecipeTags, sourceTagNames, tagGroups, tagLabel } from "@/lib/recipe-tags";

export function RecipeFilterControls({ value, onChange, tags }: {
  value: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  tags: string[];
}) {
  const select = (label: string, key: "diet" | "dish" | "method" | "practical" | "source" | "tag" | "sophia", options: string[]) => <label>{label}<select aria-label={label} value={value[key] ?? ""} onChange={event => onChange({ ...value, [key]: event.target.value })}><option value="">Any</option>{options.map(tag => <option key={tag} value={tag}>{tagLabel(tag)}</option>)}</select></label>;
  const extraCount = [value.method, value.practical, value.source, value.tag, value.familiarOnly, value.sophia].filter(Boolean).length;
  return <div className="recipe-filter-groups">
    <div className="recipe-search-filters" aria-label="Meal filters">
      <label>Total time
        <select aria-label="Total time" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value as RecipeFilters["time"] })}>
          <option value="all">Any time</option>
          <option value="15">Up to 15 mins</option>
          <option value="30">Up to 30 mins</option>
          <option value="60">Up to 60 mins</option>
          <option value="over-60">Over 60 mins</option>
        </select>
      </label>
      {select("Diet", "diet", tagGroups.Diet)}
      <label>Main ingredient
        <select aria-label="Main ingredient" value={value.protein} onChange={(event) => onChange({ ...value, protein: event.target.value as RecipeFilters["protein"] })}>
          <option value="all">Any type</option>
          <option value="chicken">Chicken / turkey</option>
          <option value="pork">Pork</option>
          <option value="beef">Beef</option>
          <option value="fish">Fish / seafood</option>
          <option value="lamb">Lamb</option>
          <option value="other meat">Other meat</option>
        </select>
      </label>
      {select("Dish", "dish", tagGroups.Dish)}
      <label className="toggle-line"><input type="checkbox" checked={value.favoritesOnly}
        onChange={(event) => onChange({ ...value, favoritesOnly: event.target.checked })} />Favourites</label>
      <button className="icon-button" type="button" title="Clear meal filters" aria-label="Clear meal filters"
        disabled={!hasRecipeFilters(value)} onClick={() => onChange(emptyRecipeFilters)}><RotateCcw size={17} /></button>
    </div>
    <details className="recipe-extra-filters"><summary>More filters{extraCount ? ` (${extraCount})` : ""}</summary><div className="recipe-search-filters">
      {select("Cooking method", "method", tagGroups["Cooking method"])}{select("Practical", "practical", tagGroups.Practical)}{select("Source", "source", sourceTagNames)}
      {select("Custom tag", "tag", customRecipeTags(tags).sort())}{select("Sophia suitability", "sophia", ["sophia friendly", "not sophia friendly"])}
      <label className="toggle-line"><input type="checkbox" checked={value.familiarOnly ?? false} onChange={event => onChange({ ...value, familiarOnly: event.target.checked })} />Familiar</label>
    </div></details>
  </div>;
}
