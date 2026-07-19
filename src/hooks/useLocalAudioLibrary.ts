"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createBrowserLocalAudioLibrary,
  type LocalAudioRecord,
} from "@/domain/audio-assets/local-library";

export function useLocalAudioLibrary() {
  const [entry] = useState(createBrowserLocalAudioLibrary);
  const [records, setRecords] = useState<readonly LocalAudioRecord[]>([]);
  const [warning, setWarning] = useState<string | null>(entry.persistent ? null : "Local audio will last only for this tab.");

  const refresh = useCallback(async () => {
    try {
      setRecords(await entry.library.list());
    } catch {
      setWarning("Local audio storage is unavailable.");
    }
  }, [entry]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      entry.library.dispose();
    };
  }, [entry, refresh]);

  const add = useCallback(async (file: File) => {
    const record = await entry.library.add(file.name, file);
    await refresh();
    return record;
  }, [entry, refresh]);

  const remove = useCallback(async (id: string) => {
    await entry.library.remove(id);
    await refresh();
  }, [entry, refresh]);

  const resolveAudioAsset = useCallback((id: string) => entry.library.resolveArrayBuffer(id), [entry]);

  return { records, warning, add, remove, resolveAudioAsset };
}
