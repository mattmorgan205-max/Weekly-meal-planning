"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ImportDraft } from "@/lib/domain";
import { canonicalTag, householdTagNames, inferredRecipeTags, preferenceTags, sourceTags, standardRecipeTags, tagGroups, tagLabel, uniqueTags } from "@/lib/recipe-tags";

export function RecipeTagEditor({ draft, setDraft, tagInput, setTagInput }: { draft: ImportDraft; setDraft: Dispatch<SetStateAction<ImportDraft>>; tagInput: string; setTagInput: (value: string) => void }) {
  const active = standardRecipeTags([], draft);
  const inferred = inferredRecipeTags(draft);
  const preferences = preferenceTags(draft);
  function toggle(tag: string, checked: boolean) {
    setDraft(current => ({ ...current,
      confirmedTags: checked ? uniqueTags([...(current.confirmedTags ?? []), tag]) : uniqueTags(current.confirmedTags ?? []).filter(item => item !== tag),
      suppressedAutoTags: checked ? uniqueTags(current.suppressedAutoTags ?? []).filter(item => item !== tag) : uniqueTags([...(current.suppressedAutoTags ?? []), tag])
    }));
  }
  function setPreference(group: string[], selected: string[]) {
    setDraft(current => ({ ...current, tags: current.tags.filter(tag => !householdTagNames.includes(canonicalTag(tag))), householdTags: uniqueTags([...preferenceTags(current).filter(tag => !group.includes(tag)), ...selected]) }));
  }
  return <section className="recipe-tag-editor" aria-label="Recipe tags">
    <h3>Recipe tags</h3>
    {Object.entries(tagGroups).map(([group, tags]) => <fieldset key={group}><legend>{group}</legend><div className="tag-options">{tags.map(tag => <label key={tag} className={active.includes(tag) ? "is-selected" : ""}>
      <input type="checkbox" checked={active.includes(tag)} onChange={event => toggle(tag, event.target.checked)} />{tagLabel(tag)}
      {active.includes(tag) && inferred.includes(tag) && !draft.confirmedTags?.includes(tag) && <small>Auto</small>}
    </label>)}</div></fieldset>)}
    <label>Custom tags<input value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="Comma-separated tags" /></label>
    <fieldset><legend>Household preferences</legend><div className="household-tag-controls">
      <label className="toggle-line"><input type="checkbox" checked={preferences.includes("familiar")} onChange={event => setPreference(["familiar"], event.target.checked ? ["familiar"] : [])} />Familiar</label>
      <label>Sophia suitability<select aria-label="Sophia suitability" value={preferences.includes("not sophia friendly") ? "not sophia friendly" : preferences.includes("sophia friendly") ? "sophia friendly" : ""} onChange={event => setPreference(["sophia friendly", "not sophia friendly"], event.target.value ? [event.target.value] : [])}>
        <option value="">Not specified</option><option value="sophia friendly">Sophia friendly</option><option value="not sophia friendly">Not Sophia friendly</option>
      </select></label>
    </div></fieldset>
    {!!sourceTags(draft).length && <div className="recipe-source-labels"><strong>Source</strong>{sourceTags(draft).map(tag => <span key={tag}>{tagLabel(tag)}</span>)}</div>}
  </section>;
}
