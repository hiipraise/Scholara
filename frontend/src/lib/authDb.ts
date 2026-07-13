// src/lib/authDb.ts
/**
 * IndexedDB wrapper for auth token persistence.
 * Stores only the refresh token — access token stays in-memory (never persisted).
 * Uses a dedicated "auth" object store, separate from content/queue stores.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "scholara-auth";
const DB_VERSION = 1;
const STORE_NAME = "auth";
const REFRESH_TOKEN_KEY = "refresh_token";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    const db = await getDb();
    const token = await db.get(STORE_NAME, REFRESH_TOKEN_KEY);
    return (token as string) ?? null;
  } catch {
    // If IndexedDB is unavailable (private browsing, etc.), return null
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, token, REFRESH_TOKEN_KEY);
  } catch {
    // Silently fail — auth will degrade to session-only on unsupported browsers
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, REFRESH_TOKEN_KEY);
  } catch {
    // Silently fail
  }
}

/**
 * Check if the auth store is available (useful for fallback logic).
 */
export async function isAuthDbAvailable(): Promise<boolean> {
  try {
    const db = await getDb();
    return db.objectStoreNames.contains(STORE_NAME);
  } catch {
    return false;
  }
}
