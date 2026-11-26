"use client";

import { useEffect, useRef, useState } from "react";
import { Merge, Pencil, Unlink, X } from "lucide-react";
import type { AppSettings, ShoppingListItem } from "@/lib/domain";
import { compatibleMatch, matchName, matchParts } from "@/lib/shopping-matches";

export function ShoppingMatchDialog({ source, items, settings, onChange, onEdit, onClose }: {
  source: ShoppingListItem; items: ShoppingListItem[]; settings: AppSettings;
  onChange: (target: ShoppingListItem | string) => void;
  onEdit: (part: ShoppingListItem) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<ShoppingListItem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const options = items.filter(row => row.id !== source.id).sort((a, b) => a.name.localeCompare(b.name));
  const matches = Object.entries(settings.shoppingMatches ?? {}).filter(([, to]) => to === matchName(source));
  function apply(choice: ShoppingListItem | string) {
    try { onChange(choice); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this match."); }
  }
  return <dialog className="modal-panel shopping-edit-dialog" ref={dialog} onCancel={onClose} aria-labelledby="shopping-match-title">
    <form onSubmit={event => { event.preventDefault(); if (target) apply(target); }}>
      <div className="modal-heading"><div><p className="eyebrow">Shopping ingredient</p><h2 id="shopping-match-title">{source.name}</h2></div>
        <button className="icon-button" type="button" title="Close merge options" onClick={onClose}><X size={18} /></button></div>
      <label>Merge with<select aria-label="Merge with" value={target?.id ?? ""} onChange={event => {
        setTarget(options.find(row => row.id === event.target.value) ?? null); setError("");
      }}><option value="">Choose an ingredient</option>{options.map(row => {
        const compatible = compatibleMatch(source, row, settings);
        return <option key={row.id} value={row.id} disabled={!compatible}>{row.name} · {row.displayQuantity || "As needed"}{!compatible ? " (different units or amount basis)" : ""}</option>;
      })}</select></label>
      {target ? <p role="status">{source.displayQuantity || "As needed"} {source.name} + {target.displayQuantity || "as needed"} {target.name}. Future household shops will use <strong>{target.name}</strong> for this match. Recheck the combined amount before ticking it off.</p>
        : !options.some(row => compatibleMatch(source, row, settings)) && <p className="muted">No compatible ingredient on this list. Check the amounts and units before merging.</p>}
      <div className="button-row"><button type="submit" className="primary-button" disabled={!target}><Merge size={16} />Merge and remember</button>
        <button type="button" className="text-button" onClick={onClose}>Cancel</button></div>
      {source.matchedParts && <fieldset><legend>Ingredients in this row</legend>
        {matchParts(source).map(part => <button className="text-button" key={part.id} type="button" onClick={() => onEdit(part)}>
          <Pencil size={14} />{part.name} · {part.displayQuantity || "As needed"}</button>)}</fieldset>}
      {matches.length > 0 && <fieldset><legend>Remembered matches</legend>
        {matches.map(([from, to]) => <button key={from} type="button" className="text-button" onClick={() => apply(from)}>
          <Unlink size={14} />Forget {from === to ? from : `${from} to ${to}`}</button>)}</fieldset>}
      {error && <p role="alert">{error}</p>}
    </form>
  </dialog>;
}
