"use client";

import { useState } from "react";

import type { AiProvider } from "@/ai/contracts";
import { normalizeUserApiKey } from "@/ai/provider";

const PROVIDER_DETAILS: Readonly<Record<AiProvider, Readonly<{
  label: string;
  model: string;
  placeholder: string;
}>>> = {
  openai: { label: "OpenAI", model: "gpt-5.6", placeholder: "sk-proj-…" },
  openrouter: { label: "OpenRouter", model: "openai/gpt-5.6-luna", placeholder: "sk-or-v1-…" },
};

function ProviderCredentialEditor({
  apiKey,
  onForgetKey,
  onSaveKey,
  provider,
}: Readonly<{
  apiKey: string;
  onForgetKey(provider: AiProvider): void;
  onSaveKey(provider: AiProvider, apiKey: string): void;
  provider: AiProvider;
}>) {
  const [draft, setDraft] = useState(apiKey);
  const [revealed, setRevealed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const details = PROVIDER_DETAILS[provider];

  function save(): void {
    const normalized = normalizeUserApiKey(draft);
    if (!normalized) {
      setValidationError(`Enter a valid ${details.label} API key.`);
      return;
    }
    onSaveKey(provider, normalized);
    setDraft(normalized);
    setValidationError(null);
  }

  return (
    <div className="workspace-provider-credentials">
      <div className="workspace-provider-model">
        <span>MODEL</span><code>{details.model}</code>
      </div>
      <label className="workspace-key-field">
        <span>{details.label} API key</span>
        <input
          aria-label={`${details.label} API key`}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setValidationError(null);
          }}
          placeholder={details.placeholder}
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
        {apiKey ? <button onClick={() => { onForgetKey(provider); setDraft(""); }} type="button">Forget key</button> : null}
      </div>
      {validationError ? <p className="workspace-settings-error" role="alert">{validationError}</p> : null}
    </div>
  );
}

export function WorkspaceSettingsDialog({
  apiKey,
  confirmClearAll,
  onCancelClearAll,
  onClearAll,
  onClose,
  onConfirmClearAll,
  onForgetKey,
  onProviderChange,
  onSaveKey,
  provider,
}: Readonly<{
  apiKey: string;
  confirmClearAll: boolean;
  onCancelClearAll(): void;
  onClearAll(): void;
  onClose(): void;
  onConfirmClearAll(): void;
  onForgetKey(provider: AiProvider): void;
  onProviderChange(provider: AiProvider): void;
  onSaveKey(provider: AiProvider, apiKey: string): void;
  provider: AiProvider;
}>) {
  const details = PROVIDER_DETAILS[provider];
  const configured = Boolean(apiKey);

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
          <div><small>AI ACCESS</small><strong>{details.label}</strong></div>
          <span className={configured ? "is-ready" : "is-offline"}>
            {configured ? "Ready for this tab" : "Not configured"}
          </span>
        </div>
        <label className="workspace-provider-field">
          <span>Provider</span>
          <select
            aria-label="AI provider"
            onChange={(event) => onProviderChange(event.currentTarget.value as AiProvider)}
            value={provider}
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <ProviderCredentialEditor
          apiKey={apiKey}
          key={provider}
          onForgetKey={onForgetKey}
          onSaveKey={onSaveKey}
          provider={provider}
        />
        <details className="workspace-key-note">
          <summary>How the key is handled</summary>
          <p>Each provider has a separate key stored only in this browser tab. The selected key is sent over HTTPS for the current AI request, never added to project files, and never returned by the server.</p>
        </details>
      </section>

      <section className="workspace-settings-section workspace-danger-zone">
        <small>LOCAL DATA</small>
        {confirmClearAll ? (
          <>
            <p>This removes both local projects, every local audio file, both tab API keys, and the provider selection.</p>
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
