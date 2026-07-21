"use client";

import { useRef, useState } from "react";

import { parseScene, SceneSerializationError, serializeScene } from "@/domain/scene/serialize";
import type { SceneSpec } from "@/domain/scene/types";

const MAX_IMPORT_BYTES = 1_000_000;

function sceneFilename(scene: SceneSpec): string {
  const safeName = scene.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${safeName || "echo-canvas-scene"}.json`;
}

function importErrorMessage(error: unknown): string {
  if (error instanceof SceneSerializationError) {
    return error.message === "Scene validation failed"
      ? "Import rejected. This file does not describe a supported Echo Canvas scene."
      : `Import rejected. ${error.message}`;
  }
  return "Import failed. Choose a valid exported Echo Canvas JSON file.";
}

type SceneTransferProps = Readonly<{
  scene: SceneSpec;
  onImportScene(scene: SceneSpec): void;
}>;

export function SceneTransfer({ scene, onImportScene }: SceneTransferProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");

  function report(kind: "success" | "error", message: string): void {
    setNoticeKind(kind);
    setNotice(message);
  }

  function exportScene(): void {
    try {
      const json = serializeScene(scene);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = sceneFilename(scene);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      report("success", "Scene JSON downloaded. You can re-import it later.");
    } catch {
      report("error", "Export failed. Your current scene is unchanged.");
    }
  }

  async function importScene(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      report("error", "Import rejected. Scene JSON files must be 1 MB or smaller.");
      return;
    }

    try {
      const imported = parseScene(await file.text());
      onImportScene(imported);
      report("success", "Scene JSON imported. Continue editing this validated scene.");
    } catch (error) {
      report("error", importErrorMessage(error));
    }
  }

  return (
    <div className="scene-transfer" aria-label="Scene JSON transfer">
      <p className="field-label">Scene JSON</p>
      <button className="secondary-action" onClick={exportScene} type="button">
        Export scene JSON
      </button>
      <input
        accept="application/json,.json"
        aria-label="Import scene JSON"
        className="visually-hidden"
        onChange={(event) => {
          void importScene(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        ref={fileInput}
        type="file"
      />
      <button className="secondary-action" onClick={() => fileInput.current?.click()} type="button">
        Import scene JSON
      </button>
      {notice ? (
        <p className={`scene-transfer-notice ${noticeKind}`} role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
