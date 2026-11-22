"use client";

import { useState } from "react";
import { Check, ListPlus, X } from "lucide-react";
import { canonicalizeIngredientName, groceryCategories, parseIngredientLine, type GroceryCategory, type ShoppingListItem } from "@/lib/domain";
import { batchExtraDuplicates, createManualShoppingItemFromLine, splitManualShoppingLines } from "@/lib/shopping-extras";

export function BatchExtras({ value, onChange, rangeKey, existing, aliases, onAdd }: {
  value: string; onChange: (value: string) => void; rangeKey: string; existing: ShoppingListItem[];
  aliases: Record<string, string>; onAdd: (items: ShoppingListItem[]) => void;
}) {
  const [rows, setRows] = useState<ShoppingListItem[] | null>(null), [included, setIncluded] = useState<string[]>([]);
  const [confirmedDuplicates, setConfirmedDuplicates] = useState<string[]>([]), [message, setMessage] = useState("");
  const duplicates = batchExtraDuplicates(rows ?? [], existing, aliases);
  const chosen = (rows ?? []).filter((row, index) => row.name.trim() && included.includes(row.id) && (!duplicates[index] || confirmedDuplicates.includes(row.id)));
  function edit(id: string, patch: Partial<ShoppingListItem>) {
    setRows(current => current?.map(row => row.id === id ? { ...row, ...patch } : row) ?? null);
    setConfirmedDuplicates(current => current.filter(value => value !== id));
  }
  return <section className="batch-extras">
    {!rows ? <form onSubmit={event => { event.preventDefault(); const parsed = splitManualShoppingLines(value).map(line => createManualShoppingItemFromLine(line, rangeKey)).filter((item): item is ShoppingListItem => Boolean(item)); const matches = batchExtraDuplicates(parsed, existing, aliases); setRows(parsed); setIncluded(parsed.filter((_, index) => !matches[index]).map(row => row.id)); setConfirmedDuplicates([]); setMessage(""); }}>
      <label>Batch add extras<textarea aria-label="Batch extra items" value={value} onChange={event => onChange(event.target.value)} placeholder={"Milk\n2 onions\nBread"} rows={4} /></label>
      <button className="primary-button" type="submit" disabled={!value.trim()}><ListPlus size={17} />Review items</button>
    </form> : <form onSubmit={event => { event.preventDefault(); if (!chosen.length) return; onAdd(chosen.map(row => ({ ...row, shoppingRangeKey: rangeKey, additional: true }))); setMessage(`${chosen.length} ${chosen.length === 1 ? "item" : "items"} added.`); setRows(null); onChange(""); }}>
      <div className="section-heading"><h3>Review extras</h3><button className="icon-button" type="button" title="Back to batch text" onClick={() => setRows(null)}><X size={16} /></button></div>
      <div className="batch-extra-rows">{rows.map((row, index) => <div className="batch-extra-row" key={row.id}>
        <input type="checkbox" aria-label={`Include ${row.name}`} checked={chosen.some(item => item.id === row.id)} onChange={event => { setIncluded(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setConfirmedDuplicates(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); }} />
        <input aria-label={`Item ${index + 1} name`} value={row.name} onChange={event => edit(row.id, { name: event.target.value, canonicalName: canonicalizeIngredientName(event.target.value).canonicalName })} />
        <input aria-label={`Item ${index + 1} quantity`} placeholder="Quantity" value={row.displayQuantity} onChange={event => { const parsed = parseIngredientLine(`${event.target.value} ${row.name}`, { strict: false }); edit(row.id, { displayQuantity: event.target.value, quantity: parsed.quantity, unit: parsed.unit }); }} />
        <select aria-label={`Item ${index + 1} category`} value={row.category} onChange={event => edit(row.id, { category: event.target.value as GroceryCategory })}>{groceryCategories.map(category => <option key={category}>{category}</option>)}</select>
        {duplicates[index] && <small className="batch-extra-warning">Already on list or repeated in this batch. {confirmedDuplicates.includes(row.id) ? "Adding more." : "Not selected."}</small>}
      </div>)}</div>
      <button className="primary-button" type="submit" disabled={!chosen.length}><Check size={16} />Add {chosen.length} {chosen.length === 1 ? "item" : "items"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
