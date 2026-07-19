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

class MemoryAudioStore implements LocalAudioStore {
  private readonly records = new Map<string, LocalAudioRecord>();
  async list() { return [...this.records.values()]; }
  async put(record: LocalAudioRecord) { this.records.set(record.id, record); }
  async delete(id: string) { this.records.delete(id); }
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
  decode?: (blob: Blob) => Promise<void>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  makeId?: () => string;
}>;

export class LocalAudioLibrary {
  private readonly store: LocalAudioStore;
  private readonly decode?: (blob: Blob) => Promise<void>;
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
    if (this.decode) {
      try {
        await this.decode(blob);
      } catch {
        throw new Error("This audio file could not be decoded by the browser.");
      }
    }
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

  dispose(): void {
    for (const url of this.urls.values()) this.revokeObjectURL(url);
    this.urls.clear();
  }
}

export function createBrowserLocalAudioLibrary(): Readonly<{
  library: LocalAudioLibrary;
  persistent: boolean;
}> {
  const decode = async (blob: Blob): Promise<void> => {
    const context = new AudioContext();
    try {
      await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
      await context.close();
    }
  };
  if (typeof indexedDB === "undefined") return { library: new LocalAudioLibrary({ decode }), persistent: false };
  return { library: new LocalAudioLibrary({ store: new IndexedDbAudioStore(indexedDB), decode }), persistent: true };
}
