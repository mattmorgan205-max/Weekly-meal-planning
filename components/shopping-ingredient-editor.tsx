"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { canonicalizeIngredientName, convertShoppingAmount, normalizeIngredientAliasKey, standardIngredientUnits, type ShoppingCorrection, type ShoppingListItem } from "@/lib/domain";

export function ShoppingIngredientEditor({ item, names, onSave, onClose }: {
  item: ShoppingListItem;
  names: string[];
  onSave: (edits: Record<string, ShoppingCorrection>) => void;
  onClose: () => void;
}) {
  const sources = item.ingredientSources ?? [];
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(item.name);
  const [rows, setRows] = useState(() => sources.map(source => ({ unit: source.unit, amount: source.quantity?.toString() ?? "" })));
  const [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog className="modal-panel shopping-edit-dialog" ref={dialog} onCancel={onClose} aria-labelledby="shopping-edit-title">
    <form onSubmit={event => {
      event.preventDefault();
      const typed = normalizeIngredientAliasKey(name);
      if (!typed) { setError("Enter a shopping name."); return; }
      const canonical = canonicalizeIngredientName(typed).canonicalName;
      const clean = !names.includes(typed) && names.includes(canonical) ? canonical : typed;
      const edits: Record<string, ShoppingCorrection> = {};
      rows.forEach(({ unit, amount }, index) => {
        const source = sources[index], quantity = amount === "" ? undefined : Number(amount);
        if (clean !== source.name || unit !== source.unit || quantity !== source.quantity)
          edits[source.key] = { original: source.original, name: clean, unit, quantity };
      });
      try { if (Object.keys(edits).length) onSave(edits); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the change."); }
    }}>
      <div className="modal-heading"><h2 id="shopping-edit-title">Edit shopping ingredient</h2>
        <button type="button" className="icon-button" aria-label="Close ingredient editor" onClick={onClose}><X size={18} /></button></div>
      <label>Shopping name<input required autoFocus list="shopping-existing-names" value={name} onChange={event => setName(event.target.value)} /></label>
      <datalist id="shopping-existing-names">{[...new Set(names)].sort().map(n => <option key={n} value={n} />)}</datalist>
      {sources.map((source, i) => <fieldset key={source.key}><legend>{source.label}</legend>
        <div className="form-grid"><label>Amount<input type="number" min="0" step="any" value={rows[i].amount}
          required={source.quantity !== undefined && rows[i].unit !== source.unit}
          onChange={event => setRows(rows.map((row, n) => i === n ? { ...row, amount: event.target.value } : row))} /></label>
        <label>Unit<select aria-label="Unit" value={rows[i].unit} onChange={event => {
          const unit = event.target.value;
          setRows(rows.map((row, n) => i !== n ? row : { unit, amount: (row.amount !== ""
            ? convertShoppingAmount(Number(row.amount), row.unit, unit, source.system)
            : unit === source.unit ? source.quantity : undefined)?.toString() ?? "" }));
        }}><option value="">No unit</option>{[...new Set([...standardIngredientUnits, source.unit].filter(Boolean))].map(unit =>
          <option key={unit} value={unit}>{unit}</option>)}</select></label></div>
        {source.packLabel && rows[i].unit === source.unit && <small>{source.packLabel}</small>}
      </fieldset>)}
      <p className="muted">Applies to these ingredients on household shopping lists. Recipe text stays unchanged.</p>
      {error && <p role="alert">{error}</p>}
      <div className="button-row"><button className="primary-button" type="submit"><Check size={16} />Save changes</button>
        <button className="text-button" type="button" onClick={onClose}>Cancel</button></div>
    </form>
  </dialog>;
}
