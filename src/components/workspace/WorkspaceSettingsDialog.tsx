"use client";

import { useState } from "react";

import { normalizeUserOpenRouterKey } from "@/ai/provider";

export function WorkspaceSettingsDialog({
  apiKey,
  confirmClearAll,
  onCancelClearAll,
  onClearAll,
  onClose,
  onConfirmClearAll,
  onForgetKey,
  onSaveKey,
}: Readonly<{
  apiKey: string;
  confirmClearAll: boolean;
  onCancelClearAll(): void;
  onClearAll(): void;
  onClose(): void;
  onConfirmClearAll(): void;
  onForgetKey(): void;
  onSaveKey(apiKey: string): void;
}>) {
  const [draft, setDraft] = useState(apiKey);
  const [revealed, setRevealed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const configured = Boolean(apiKey);

  function save(): void {
    const normalized = normalizeUserOpenRouterKey(draft);
    if (!normalized) {
      setValidationError("Enter a valid OpenRouter API key.");
      return;
    }
    onSaveKey(normalized);
    setDraft(normalized);
    setValidationError(null);
  }

  return (
    <div
      aria-label="Workspace settings"
      aria-modal="true"
      className="workspace-confirm-card workspace-floating-card workspace-settings-card"
      role="dialog"
    >
      <header className="workspace-settings-header">
        <span>Workspace settings</span>
        <button aria-label="Close settings" onClick={onClose} type="button">×</button>
      </header>

      <section className="workspace-settings-section">
        <div className="workspace-settings-title">
          <div><small>AI ACCESS</small><strong>OpenRouter</strong></div>
          <span className={configured ? "is-ready" : "is-offline"}>
            {configured ? "Ready for this tab" : "Not configured"}
          </span>
        </div>
        <label className="workspace-key-field">
          <span>OpenRouter API key</span>
          <input
            aria-label="OpenRouter API key"
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setValidationError(null);
            }}
            placeholder="sk-or-v1-…"
            spellCheck={false}
            type={revealed ? "text" : "password"}
            value={draft}
          />
        </label>
        <div className="workspace-settings-actions">
          <button onClick={() => setRevealed((value) => !value)} type="button">
            {revealed ? "Hide key" : "Show key"}
          </button>
          <button className="primary" onClick={save} type="button">Save for this tab</button>
          {configured ? <button onClick={() => { onForgetKey(); setDraft(""); }} type="button">Forget key</button> : null}
        </div>
        {validationError ? <p className="workspace-settings-error" role="alert">{validationError}</p> : null}
        <details className="workspace-key-note">
          <summary>How the key is handled</summary>
          <p>Stored only in this browser tab. It is sent over HTTPS for the current AI request, never added to project files, and never returned by the server.</p>
        </details>
      </section>

      <section className="workspace-settings-section workspace-danger-zone">
        <small>LOCAL DATA</small>
        {confirmClearAll ? (
          <>
            <p>This removes both local projects, every local audio file, and the tab API key.</p>
            <div className="workspace-settings-actions">
              <button className="danger" autoFocus onClick={onConfirmClearAll} type="button">Confirm clear all</button>
              <button onClick={onCancelClearAll} type="button">Cancel</button>
            </div>
          </>
        ) : <button onClick={onClearAll} type="button">Clear all local data</button>}
      </section>
    </div>
  );
}
