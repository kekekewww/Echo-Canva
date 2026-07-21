"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type ScrubOptions = Readonly<{
  step: number;
  fineStep: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  min?: number;
  max?: number;
}>;

export type NumericScrubFieldProps = Readonly<{
  label: string;
  axis?: "x" | "y" | "z";
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  fineStep: number;
  onCommit: (value: number) => void;
}>;

function clamp(value: number, minimum = -Infinity, maximum = Infinity): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseNumericInput(input: string, unit: string, minimum = -Infinity, maximum = Infinity): number | null {
  const normalized = input.trim().toLowerCase().replace(unit.trim().toLowerCase(), "").trim();
  if (normalized.length === 0) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

export function scrubbedNumericValue(initial: number, deltaPixels: number, options: ScrubOptions): number {
  const increment = options.shiftKey ? options.fineStep : options.step;
  const raw = initial + deltaPixels * increment;
  const snapped = options.ctrlKey ? Math.round(raw / options.step) * options.step : raw;
  return Number(clamp(snapped, options.min, options.max).toFixed(6));
}

function displayValue(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function NumericScrubField({ label, axis, value, unit, min, max, step, fineStep, onCommit }: NumericScrubFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const scrub = useRef<{ pointerId: number; x: number; value: number } | null>(null);

  function commitDraft(): void {
    const parsed = parseNumericInput(draft, unit, min, max);
    if (parsed === null) {
      setInvalid(true);
      setDraft(displayValue(value));
      setEditing(false);
      return;
    }
    onCommit(parsed);
    setInvalid(false);
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      setInvalid(false);
      setDraft(displayValue(value));
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      const increment = event.shiftKey ? fineStep : step;
      onCommit(clamp(value + direction * increment, min, max));
      setEditing(false);
    }
  }

  function beginScrub(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { pointerId: event.pointerId, x: event.clientX, value };
  }

  function moveScrub(event: PointerEvent<HTMLButtonElement>): void {
    if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
    onCommit(scrubbedNumericValue(scrub.current.value, event.clientX - scrub.current.x, {
      step,
      fineStep,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      min,
      max,
    }));
  }

  function endScrub(event: PointerEvent<HTMLButtonElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    scrub.current = null;
  }

  return (
    <label className={`numeric-scrub-field${invalid ? " is-invalid" : ""}`}>
      <button aria-label={`Drag to adjust ${label}`} className={`numeric-scrub-label axis-${axis ?? "value"}`} onPointerCancel={endScrub} onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} title={`${label}: drag horizontally to adjust, or type an exact value`} type="button">
        {axis?.toUpperCase() ?? label}
      </button>
      <input aria-invalid={invalid} aria-label={label} inputMode="decimal" onBlur={() => { if (editing) commitDraft(); }} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onFocus={() => { setDraft(displayValue(value)); setEditing(true); }} onKeyDown={onKeyDown} value={editing ? draft : displayValue(value)} />
      <span>{unit}</span>
      {invalid ? <small role="alert">Enter a value from {min} to {max} {unit}.</small> : null}
    </label>
  );
}
