"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { Recipe } from "@/lib/domain";
import { cleanRecipeTags, customRecipeTags, preferenceTags, sourceTags, tagCleanupChanged, tagLabel, type TagDecisions } from "@/lib/recipe-tags";

export function RecipeTagCleanup({ recipes, onApply, onClose }: { recipes: Recipe[]; onApply: (ids: string[], decisions: TagDecisions) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [decisions, setDecisions] = useState<TagDecisions>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const custom = customRecipeTags(recipes.flatMap(recipe => recipe.tags)).sort();
  const previews = recipes.map(before => ({ before, after: cleanRecipeTags(before, decisions) })).filter(({ before, after }) => tagCleanupChanged(before, after));
  const selected = previews.filter(({ before }) => !excluded.includes(before.id));
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialogRef} className="modal-panel tag-cleanup-dialog" aria-labelledby="tag-cleanup-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading"><h2 id="tag-cleanup-title">Review tag cleanup</h2><button autoFocus type="button" className="icon-button" title="Cancel tag cleanup" onClick={onClose}><X size={18} /></button></div>
    {!!custom.length && <details><summary>Custom tags ({custom.length})</summary><div className="tag-cleanup-custom">{custom.map(tag => <div key={tag}>
      <strong>{tagLabel(tag)}</strong><select aria-label={`Action for ${tag}`} value={decisions[tag] === null ? "remove" : decisions[tag] === undefined ? "keep" : "rename"} onChange={event => setDecisions(current => { const next = { ...current }; if (event.target.value === "keep") delete next[tag]; else next[tag] = event.target.value === "remove" ? null : tag; return next; })}><option value="keep">Keep</option><option value="rename">Rename / merge</option><option value="remove">Remove</option></select>
      {typeof decisions[tag] === "string" && <input aria-label={`New name for ${tag}`} value={decisions[tag] ?? ""} onChange={event => setDecisions(current => ({ ...current, [tag]: event.target.value }))} />}
    </div>)}</div></details>}
    <div className="button-row"><strong>{previews.length} {previews.length === 1 ? "recipe" : "recipes"} with changes</strong><button type="button" className="text-button" onClick={() => setExcluded([])}>Select all</button><button type="button" className="text-button" onClick={() => setExcluded(recipes.map(recipe => recipe.id))}>Deselect all</button></div>
    <div className="tag-cleanup-recipes">{previews.map(({ before, after }) => <section key={before.id}>
      <label className="toggle-line"><input type="checkbox" checked={!excluded.includes(before.id)} onChange={event => setExcluded(current => event.target.checked ? current.filter(id => id !== before.id) : [...current, before.id])} /><strong>{before.title}</strong></label>
      <dl><dt>Before</dt><dd>{before.tags.join(", ") || "No tags"}</dd><dt>After</dt><dd>{after.tags.join(", ") || "No tags"}</dd>
        {!!sourceTags(after).length && <><dt>Source</dt><dd>{sourceTags(after).map(tagLabel).join(", ")}</dd></>}
        {!!preferenceTags(after).length && <><dt>Household</dt><dd>{preferenceTags(after).map(tagLabel).join(", ")}</dd></>}
        {after.favorite !== before.favorite && <><dt>Favourite</dt><dd>Yes</dd></>}
      </dl>
    </section>)}{!previews.length && <p>No tag changes needed.</p>}</div>
    <div className="tag-cleanup-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!selected.length || Object.values(decisions).some(value => value !== null && !value.trim())} onClick={() => onApply(selected.map(({ before }) => before.id), decisions)}><Check size={16} />Apply to {selected.length} {selected.length === 1 ? "recipe" : "recipes"}</button></div>
  </dialog>;
}
