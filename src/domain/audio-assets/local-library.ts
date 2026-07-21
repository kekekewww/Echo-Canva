export const MAX_LOCAL_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_LIBRARY_BYTES = 100 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg"]);

export type LocalAudioRecord = Readonly<{
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}>;

export type AudioValidation = Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>;

export function validateLocalAudioFile(blob: Blob, currentLibraryBytes: number): AudioValidation {
  if (!ACCEPTED_AUDIO_TYPES.has(blob.type.toLowerCase())) {
    return { ok: false, message: "Choose a WAV, MP3, or Ogg audio file." };
  }
  if (blob.size > MAX_LOCAL_AUDIO_FILE_BYTES) {
    return { ok: false, message: "Local audio files must be 25 MB or smaller." };
  }
  if (currentLibraryBytes + blob.size > MAX_LOCAL_AUDIO_LIBRARY_BYTES) {
    return { ok: false, message: "The local audio library is limited to 100 MB." };
  }
  return { ok: true };
}

export type LocalAudioStore = Readonly<{
  list: () => Promise<readonly LocalAudioRecord[]>;
  put: (record: LocalAudioRecord) => Promise<void>;
  delete: (id: string) => Promise<void>;
}>;

export class MemoryAudioStore implements LocalAudioStore {
  private readonly records = new Map<string, LocalAudioRecord>();
  async list() { return [...this.records.values()]; }
  async put(record: LocalAudioRecord) { this.records.set(record.id, record); }
  async delete(id: string) { this.records.delete(id); }
}

export class FallbackAudioStore implements LocalAudioStore {
  private usingFallback = false;
  private notified = false;

  constructor(
    private readonly primary: LocalAudioStore,
    private readonly fallback: LocalAudioStore = new MemoryAudioStore(),
    private readonly onFallback: () => void = () => undefined,
  ) {}

  get persistent(): boolean { return !this.usingFallback; }

  private activateFallback(): void {
    this.usingFallback = true;
    if (!this.notified) {
      this.notified = true;
      this.onFallback();
    }
  }

  async list(): Promise<readonly LocalAudioRecord[]> {
    if (this.usingFallback) return this.fallback.list();
    try {
      const records = await this.primary.list();
      await Promise.all(records.map((record) => this.fallback.put(record)));
      return records;
    } catch {
      this.activateFallback();
      return this.fallback.list();
    }
  }

  async put(record: LocalAudioRecord): Promise<void> {
    if (this.usingFallback) return this.fallback.put(record);
    try {
      await this.primary.put(record);
      await this.fallback.put(record);
    } catch {
      this.activateFallback();
      await this.fallback.put(record);
    }
  }

  async delete(id: string): Promise<void> {
    if (this.usingFallback) return this.fallback.delete(id);
    try {
      await this.primary.delete(id);
      await this.fallback.delete(id);
    } catch {
      this.activateFallback();
      await this.fallback.delete(id);
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export class IndexedDbAudioStore implements LocalAudioStore {
  private readonly database: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory) {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDb.open("echo-canvas-audio", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("assets")) {
          request.result.createObjectStore("assets", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB is unavailable."));
    });
  }

  async list(): Promise<readonly LocalAudioRecord[]> {
    const database = await this.database;
    return requestResult(database.transaction("assets", "readonly").objectStore("assets").getAll()) as Promise<LocalAudioRecord[]>;
  }

  async put(record: LocalAudioRecord): Promise<void> {
    const database = await this.database;
    await requestResult(database.transaction("assets", "readwrite").objectStore("assets").put(record));
  }

  async delete(id: string): Promise<void> {
    const database = await this.database;
    await requestResult(database.transaction("assets", "readwrite").objectStore("assets").delete(id));
  }
}

type LibraryDependencies = Readonly<{
  store?: LocalAudioStore;
  decode?: (blob: Blob) => Promise<void | Readonly<{ numberOfChannels: number }>>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  makeId?: () => string;
}>;

export class LocalAudioLibrary {
  private readonly store: LocalAudioStore;
  private readonly decode?: (blob: Blob) => Promise<void | Readonly<{ numberOfChannels: number }>>;
  private readonly createObjectURL: (blob: Blob) => string;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly urls = new Map<string, string>();

  constructor(dependencies: LibraryDependencies = {}) {
    this.store = dependencies.store ?? new MemoryAudioStore();
    this.decode = dependencies.decode;
    this.createObjectURL = dependencies.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectURL = dependencies.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.now = dependencies.now ?? (() => Date.now());
    this.makeId = dependencies.makeId ?? (() => `local_${crypto.randomUUID().replaceAll("-", "_")}`);
  }

  async list(): Promise<readonly LocalAudioRecord[]> {
    return [...await this.store.list()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(name: string, blob: Blob): Promise<LocalAudioRecord> {
    const records = await this.store.list();
    const validation = validateLocalAudioFile(blob, records.reduce((total, record) => total + record.size, 0));
    if (!validation.ok) throw new Error(validation.message);
    await this.assertDecodableMono(blob);
    const record: LocalAudioRecord = {
      id: this.makeId(),
      name: name.slice(0, 120),
      mimeType: blob.type,
      size: blob.size,
      blob,
      createdAt: this.now(),
    };
    await this.store.put(record);
    return record;
  }

  async relink(id: string, name: string, blob: Blob): Promise<LocalAudioRecord> {
    const records = await this.store.list();
    const existing = records.find((record) => record.id === id);
    const currentBytes = records.reduce((total, record) => total + record.size, 0) - (existing?.size ?? 0);
    const validation = validateLocalAudioFile(blob, currentBytes);
    if (!validation.ok) throw new Error(validation.message);
    await this.assertDecodableMono(blob);
    const url = this.urls.get(id);
    if (url) {
      this.revokeObjectURL(url);
      this.urls.delete(id);
    }
    const record: LocalAudioRecord = {
      id,
      name: name.slice(0, 120),
      mimeType: blob.type,
      size: blob.size,
      blob,
      createdAt: existing?.createdAt ?? this.now(),
    };
    await this.store.put(record);
    return record;
  }

  async remove(id: string): Promise<void> {
    const url = this.urls.get(id);
    if (url) {
      this.revokeObjectURL(url);
      this.urls.delete(id);
    }
    await this.store.delete(id);
  }

  async resolveArrayBuffer(id: string): Promise<ArrayBuffer | null> {
    const record = (await this.store.list()).find((candidate) => candidate.id === id);
    return record ? record.blob.arrayBuffer() : null;
  }

  async resolveObjectUrl(id: string): Promise<string | null> {
    const cached = this.urls.get(id);
    if (cached) return cached;
    const record = (await this.store.list()).find((candidate) => candidate.id === id);
    if (!record) return null;
    const url = this.createObjectURL(record.blob);
    this.urls.set(id, url);
    return url;
  }

  async clear(): Promise<void> {
    for (const record of await this.store.list()) await this.remove(record.id);
  }

  get persistent(): boolean {
    return !(this.store instanceof FallbackAudioStore) || this.store.persistent;
  }

  private async assertDecodableMono(blob: Blob): Promise<void> {
    if (!this.decode) return;
    let decoded: void | Readonly<{ numberOfChannels: number }>;
    try {
      decoded = await this.decode(blob);
    } catch {
      throw new Error("This audio file could not be decoded by the browser.");
    }
    if (decoded && decoded.numberOfChannels !== 1) {
      throw new Error("Local point-source audio must be mono.");
    }
  }

  dispose(): void {
    for (const url of this.urls.values()) this.revokeObjectURL(url);
    this.urls.clear();
  }
}

export function createBrowserLocalAudioLibrary(): Readonly<{
  library: LocalAudioLibrary;
  persistent: boolean;
}> {
  const decode = async (blob: Blob): Promise<Readonly<{ numberOfChannels: number }>> => {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      return { numberOfChannels: buffer.numberOfChannels };
    } finally {
      await context.close();
    }
  };
  let databaseFactory: IDBFactory | null = null;
  try {
    databaseFactory = typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    databaseFactory = null;
  }
  if (!databaseFactory) return { library: new LocalAudioLibrary({ decode }), persistent: false };
  return {
    library: new LocalAudioLibrary({ store: new FallbackAudioStore(new IndexedDbAudioStore(databaseFactory)), decode }),
    persistent: true,
  };
}
