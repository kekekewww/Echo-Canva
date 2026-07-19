"use client";

import { useState } from "react";

import type { LocalAudioRecord } from "@/domain/audio-assets/local-library";
import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";

export function AudioAssetPicker({ records, warning, onUpload, onChoose, onClose }: Readonly<{
  records: readonly LocalAudioRecord[];
  warning: string | null;
  onUpload: (file: File) => Promise<LocalAudioRecord>;
  onChoose: (id: string, name: string) => void;
  onClose: () => void;
}>) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="audio-picker" role="dialog" aria-modal="true" aria-label="Choose source audio">
      <header><strong>Source audio</strong><button aria-label="Close" onClick={onClose} type="button">×</button></header>
      <p>Built-in</p>
      {AUDIO_ASSETS.map((asset, index) => <button autoFocus={index === 0} key={asset.id} onClick={() => onChoose(asset.id, asset.label)} type="button">{asset.label}</button>)}
      {records.length ? <p>On this device</p> : null}
      {records.map((record) => <button key={record.id} onClick={() => onChoose(record.id, record.name)} type="button">{record.name}<small>{(record.size / 1024 / 1024).toFixed(1)} MB</small></button>)}
      <label className="audio-upload">Import WAV / MP3 / Ogg<input accept="audio/wav,audio/mpeg,audio/ogg" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void onUpload(file).then((record) => onChoose(record.id, record.name)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Import failed."));
      }} type="file" /></label>
      {error ?? warning ? <small role="status">{error ?? warning}</small> : null}
    </div>
  );
}
