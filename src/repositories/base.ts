import { nanoid } from "nanoid";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db, isBrowser } from "@/lib/firebase";
import { toast } from "sonner";

export const genId = () => nanoid(10);

/** Firestore rejects `undefined` field values — strip them deeply before writing. */
function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndefined(val);
    }
    return out as T;
  }
  return v;
}

const writeError = (action: string) => (err: unknown) => {
  console.error(`Firestore ${action} failed`, err);
  toast.error(`Could not save to cloud (${action}). Check internet & try again.`);
};

/**
 * Firestore-backed repository with the SAME synchronous API the whole app
 * already uses. A live snapshot listener keeps an in-memory cache up to date;
 * reads are served from the cache, writes update the cache immediately and
 * sync to Firestore in the background (offline persistence queues them).
 */
export class Repository<T extends { id: string }> {
  private cache: T[] = [];
  private unsub?: () => void;

  constructor(private name: string) {}

  /** Subscribe to the collection; resolves after the first snapshot arrives. */
  hydrate(): Promise<void> {
    if (!isBrowser) return Promise.resolve();
    if (this.unsub) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let first = true;
      this.unsub = onSnapshot(
        collection(db, this.name),
        (snap) => {
          this.cache = snap.docs.map((d) => d.data() as T);
          // Newest first — matches the old localStorage unshift() ordering
          this.cache.sort((a, b) =>
            (((b as Record<string, unknown>).createdAt as string) ?? "").localeCompare(
              ((a as Record<string, unknown>).createdAt as string) ?? "",
            ),
          );
          if (first) {
            first = false;
            resolve();
          }
        },
        (err) => {
          console.error(`Failed to load "${this.name}"`, err);
          if (first) {
            first = false;
            reject(err);
          } else toast.error("Cloud sync interrupted — check internet, then reload");
        },
      );
    });
  }

  /** Stop listening and clear the cache (used on logout). */
  stop() {
    this.unsub?.();
    this.unsub = undefined;
    this.cache = [];
  }

  all(): T[] {
    return [...this.cache];
  }

  get(id: string): T | undefined {
    return this.cache.find((i) => i.id === id);
  }

  add(item: Omit<T, "id" | "createdAt"> & { id?: string }): T {
    const record = {
      ...item,
      // `||` not `??` — form drafts carry id: "" and an empty Firestore
      // document ID throws, crashing the save
      id: item.id || genId(),
      createdAt: new Date().toISOString(),
    } as unknown as T;
    this.cache.unshift(record);
    if (isBrowser) {
      setDoc(doc(db, this.name, record.id), stripUndefined(record)).catch(writeError("add"));
    }
    return record;
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const idx = this.cache.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    const merged = { ...this.cache[idx], ...patch };
    this.cache[idx] = merged;
    if (isBrowser) {
      // Write the full merged record so the cloud doc always mirrors the cache
      setDoc(doc(db, this.name, id), stripUndefined(merged)).catch(writeError("update"));
    }
    return merged;
  }

  /**
   * Concurrency-safe numeric change (stock, paid…). Uses Firestore's atomic
   * increment so two devices changing the same number at the same moment
   * BOTH count — an absolute write would silently lose one of them.
   */
  adjustField(
    id: string,
    field: keyof T & string,
    delta: number,
    extra?: Partial<T>,
  ): T | undefined {
    const idx = this.cache.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    const cur = ((this.cache[idx] as Record<string, unknown>)[field] as number) ?? 0;
    const merged = {
      ...this.cache[idx],
      ...(extra ?? {}),
      [field]: Math.round((cur + delta) * 100) / 100,
    } as T;
    this.cache[idx] = merged;
    if (isBrowser) {
      updateDoc(doc(db, this.name, id), {
        [field]: increment(Math.round(delta * 100) / 100),
        ...stripUndefined(extra ?? {}),
      } as never).catch(writeError("update"));
    }
    return merged;
  }

  remove(id: string) {
    this.cache = this.cache.filter((i) => i.id !== id);
    if (isBrowser) {
      deleteDoc(doc(db, this.name, id)).catch(writeError("delete"));
    }
  }

  bulkRemove(ids: string[]) {
    const set = new Set(ids);
    this.cache = this.cache.filter((i) => !set.has(i.id));
    if (!isBrowser) return;
    void this.batchedDelete([...set]);
  }

  /** Import records (backup restore / migration) in Firestore-safe chunks. */
  async importAll(records: T[]): Promise<void> {
    if (!isBrowser || !records.length) return;
    for (let i = 0; i < records.length; i += 400) {
      const chunk = records.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const r of chunk) {
        if (!r?.id) continue;
        batch.set(doc(db, this.name, r.id), stripUndefined(r));
      }
      await batch.commit();
    }
  }

  /** Delete every document in the collection (Settings → Clear All Data). */
  async clearAll(): Promise<void> {
    const ids = this.cache.map((r) => r.id);
    this.cache = [];
    await this.batchedDelete(ids);
  }

  private async batchedDelete(ids: string[]): Promise<void> {
    if (!isBrowser || !ids.length) return;
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const id of chunk) batch.delete(doc(db, this.name, id));
        await batch.commit();
      }
    } catch (err) {
      writeError("bulk delete")(err);
    }
  }
}
