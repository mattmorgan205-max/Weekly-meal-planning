"use client";

import { RotateCcw } from "lucide-react";
import { emptyRecipeFilters, hasRecipeFilters, type RecipeFilters } from "@/lib/recipe-filters";

export function RecipeFilterControls({ value, onChange, tags }: {
  value: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  tags: string[];
}) {
  return (
    <div className="recipe-search-filters" aria-label="Meal filters">
      <label>Total time
        <select value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value as RecipeFilters["time"] })}>
          <option value="all">Any time</option>
          <option value="quick">Quick: under 30 mins</option>
          <option value="30-60">30-60 mins</option>
          <option value="over-60">Over 60 mins</option>
        </select>
      </label>
      <label>Meal type
        <select value={value.protein} onChange={(event) => onChange({ ...value, protein: event.target.value as RecipeFilters["protein"] })}>
          <option value="all">Any type</option>
          <option value="vegetarian">Vegetarian</option>
          <option value="chicken">Chicken / turkey</option>
          <option value="pork">Pork</option>
          <option value="beef">Beef</option>
          <option value="fish">Fish / seafood</option>
          <option value="lamb">Lamb</option>
          <option value="duck">Duck</option>
        </select>
      </label>
      <label>Tag
        <select value={value.tag} onChange={(event) => onChange({ ...value, tag: event.target.value })}>
          <option value="">Any tag</option>
          {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </label>
      <label className="toggle-line"><input type="checkbox" checked={value.favoritesOnly}
        onChange={(event) => onChange({ ...value, favoritesOnly: event.target.checked })} />Favourites</label>
      <button className="icon-button" type="button" title="Clear meal filters" aria-label="Clear meal filters"
        disabled={!hasRecipeFilters(value)} onClick={() => onChange(emptyRecipeFilters)}><RotateCcw size={17} /></button>
    </div>
  );
}
