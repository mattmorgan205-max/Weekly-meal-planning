"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import type { ImportDraft } from "@/lib/domain";
import type { ReviewIssue } from "@/lib/recipe-review";

export function RecipeSaveDialog({ draft, issues, editing, busy, onClose, onEditMethod, onSave }: {
  draft: ImportDraft;
  issues: ReviewIssue[];
  editing: boolean;
  busy: boolean;
  onClose: () => void;
  onEditMethod: () => void;
  onSave: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const missingMethod = issues.some(issue => issue.key === "method");
  const messages = [...new Set([
    ...issues.filter(issue => issue.key !== "method").map(issue => {
      const ingredient = draft.ingredients.find(row => row.id === issue.ingredientId);
      return ingredient ? `${ingredient.name || "Unnamed ingredient"}: ${issue.message}` : issue.message;
    }),
    ...draft.warnings
  ])];

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    editButtonRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="modal-panel recipe-save-dialog" aria-modal="true" aria-labelledby="recipe-save-title" aria-describedby="recipe-save-description" onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className="modal-heading">
        <div className="recipe-save-title"><AlertTriangle size={24} aria-hidden="true" /><h2 id="recipe-save-title">{missingMethod ? editing ? "Update without cooking instructions?" : "Save without cooking instructions?" : "Check recipe before saving"}</h2></div>
        <button type="button" className="icon-button" title="Close save warning" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="recipe-save-body">
        <p id="recipe-save-description"><strong>{draft.title}</strong>{missingMethod ? " does not have cooking instructions yet." : " has review notes that still need your confirmation."}</p>
        {missingMethod && <p>{editing ? "Updating" : "Saving"} now will keep the ingredients and other details, but the method will remain incomplete.</p>}
        {messages.length > 0 && <><h3>{missingMethod ? "Other review notes" : "Review notes"}</h3><ul>{messages.map(message => <li key={message}>{message}</li>)}</ul></>}
      </div>
      <div className="recipe-save-actions">
        <button ref={editButtonRef} type="button" className="primary-button" onClick={missingMethod ? onEditMethod : onClose}><Pencil size={17} />{missingMethod ? "Add cooking instructions" : "Return to editing"}</button>
        <button type="button" className="text-button" disabled={busy || issues.some(issue => issue.blocking)} onClick={onSave}><Check size={17} />{missingMethod ? editing ? "Update without method" : "Save without method" : editing ? "Update recipe anyway" : "Save recipe anyway"}</button>
      </div>
    </dialog>
  );
}
