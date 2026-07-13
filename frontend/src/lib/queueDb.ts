// src/lib/queueDb.ts
/**
 * Queue store for offline answer submissions.
 * Answers submitted while offline are persisted here and synced on reconnect.
 * Separated from authDb.ts and contentDb.ts to keep concerns isolated.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "scholara-queue";
const DB_VERSION = 1;

export interface QueuedAnswer {
  id: string; // composite: `${questionId}::${timestamp}`
  questionId: string;
  selectedAnswer: string;
  createdAt: number; // client-side timestamp
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  lastError?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("answers")) {
          const store = db.createObjectStore("answers", { keyPath: "id" });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueAnswer(
  questionId: string,
  selectedAnswer: string,
): Promise<string> {
  const db = await getDb();
  const id = `${questionId}::${Date.now()}`;
  const entry: QueuedAnswer = {
    id,
    questionId,
    selectedAnswer,
    createdAt: Date.now(),
    status: "pending",
    retryCount: 0,
  };
  await db.put("answers", entry);
  return id;
}

export async function getPendingAnswers(): Promise<QueuedAnswer[]> {
  const db = await getDb();
  const index = db.transaction("answers").store.index("status");
  return index.getAll("pending");
}

export async function getFailedAnswers(): Promise<QueuedAnswer[]> {
  const db = await getDb();
  const index = db.transaction("answers").store.index("status");
  return index.getAll("failed");
}

export async function getAllQueuedAnswers(): Promise<QueuedAnswer[]> {
  const db = await getDb();
  return db.transaction("answers").store.getAll();
}

export async function markSyncing(id: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get("answers", id);
  if (entry) {
    entry.status = "syncing";
    await db.put("answers", entry);
  }
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get("answers", id);
  if (entry) {
    entry.status = "failed";
    entry.retryCount += 1;
    entry.lastError = error;
    await db.put("answers", entry);
  }
}

export async function removeAnswer(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("answers", id);
}

export async function getQueueCount(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("answers");
  return all.filter((a) => a.status === "pending" || a.status === "failed").length;
}

export async function clearQueue(): Promise<void> {
  const db = await getDb();
  await db.clear("answers");
}
