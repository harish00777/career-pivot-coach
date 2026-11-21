import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { CareerStoreSchema, type CareerStore } from '../shared/schemas';
import { OperationType, db, handleFirestoreError } from './firebaseClient';

export const EMPTY_CAREER_STORE: CareerStore = CareerStoreSchema.parse({});

export interface CareerRepository {
  getMode(): 'firestore' | 'indexeddb';
  load(): Promise<CareerStore | null>;
  save(store: CareerStore): Promise<void>;
  clear(): Promise<void>;
}

const IDB_NAME = 'rolexiq_career_db';
const IDB_STORE = 'workspaces';
const IDB_KEY = 'primary';
const LS_BACKUP_KEY = 'rolexiq_workspace_backup_v1';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export class IndexedDBRepository implements CareerRepository {
  getMode(): 'indexeddb' {
    return 'indexeddb';
  }

  async load(): Promise<CareerStore | null> {
    try {
      const database = await openIdb();
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = database.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(IDB_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
      database.close();
      if (raw) {
        return CareerStoreSchema.parse(raw);
      }
    } catch {
      // Fallback check in localStorage if IndexedDB failed
    }

    try {
      const lsRaw = localStorage.getItem(LS_BACKUP_KEY);
      if (lsRaw) {
        return CareerStoreSchema.parse(JSON.parse(lsRaw));
      }
    } catch {
      // ignore corrupt local backup
    }
    return null;
  }

  async save(store: CareerStore): Promise<void> {
    const validated = CareerStoreSchema.parse(store);
    try {
      const database = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(IDB_STORE, 'readwrite');
        const objStore = tx.objectStore(IDB_STORE);
        objStore.put(validated, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    } catch (err) {
      // Attempt localStorage fallback before surfacing storage error
      try {
        localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(validated));
      } catch {
        throw new Error(
          err instanceof Error
            ? `Local storage error: ${err.message}`
            : 'Failed to save workspace locally.'
        );
      }
    }
  }

  async clear(): Promise<void> {
    try {
      const database = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(IDB_STORE, 'readwrite');
        const objStore = tx.objectStore(IDB_STORE);
        objStore.delete(IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    } catch {
      // continue clearing localStorage
    }
    try {
      localStorage.removeItem(LS_BACKUP_KEY);
    } catch {
      // ignore
    }
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export class FirestoreRepository implements CareerRepository {
  private uid: string;
  private localMirror = new IndexedDBRepository();

  constructor(uid: string) {
    this.uid = uid;
  }

  getMode(): 'firestore' {
    return 'firestore';
  }

  private get docPath() {
    return `users/${this.uid}/workspaces/primary`;
  }

  async load(): Promise<CareerStore | null> {
    const docRef = doc(db, 'users', this.uid, 'workspaces', 'primary');
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const parsed = CareerStoreSchema.parse(data);
        await this.localMirror.save(parsed);
        return parsed;
      }
      return await this.localMirror.load();
    } catch (err) {
      if (err instanceof Error && err.message.includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, this.docPath);
      }
      // Offline / transient network issue: return local mirror rather than losing data silently
      return await this.localMirror.load();
    }
  }

  async save(store: CareerStore): Promise<void> {
    const validated = CareerStoreSchema.parse(store);
    await this.localMirror.save(validated);

    const docRef = doc(db, 'users', this.uid, 'workspaces', 'primary');
    const cleanPayload = stripUndefined(validated);

    try {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        await setDoc(docRef, {
          ...cleanPayload,
          ownerId: this.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = existingSnap.data();
        await setDoc(docRef, {
          ...cleanPayload,
          ownerId: existingData.ownerId ?? this.uid,
          createdAt: existingData.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.WRITE, this.docPath);
      }
      throw new Error(
        err instanceof Error
          ? `Cloud sync paused (saved locally on this device): ${err.message}`
          : 'Cloud sync paused (saved locally on this device).'
      );
    }
  }

  async clear(): Promise<void> {
    await this.localMirror.clear();
    const docRef = doc(db, 'users', this.uid, 'workspaces', 'primary');
    try {
      await deleteDoc(docRef);
    } catch (err) {
      if (err instanceof Error && err.message.includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.DELETE, this.docPath);
      }
      throw err;
    }
  }
}
