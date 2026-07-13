// src/lib/contentDb.ts
/**
 * IndexedDB schema for offline course content.
 * Separated from authDb.ts — stores courses, PDFs (blobs), and lesson content.
 * Each record includes a "lastSynced" timestamp for staleness detection.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { Course, CoursePDF, Lesson } from "../types";

const DB_NAME = "scholara-content";
const DB_VERSION = 1;

export interface StoredCourse extends Course {
  lastSynced: number;
}

export interface StoredPDF extends CoursePDF {
  courseId: string;
  /** Binary blob of the PDF file */
  blob?: ArrayBuffer;
  lastSynced: number;
}

export interface StoredLesson extends Lesson {
  lastSynced: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Courses store — keyed by course ID
        if (!db.objectStoreNames.contains("courses")) {
          const courseStore = db.createObjectStore("courses", { keyPath: "id" });
          courseStore.createIndex("code", "code", { unique: false });
        }

        // PDFs store — keyed by composite key "courseId::pdfId"
        if (!db.objectStoreNames.contains("pdfs")) {
          const pdfStore = db.createObjectStore("pdfs", { keyPath: "id" });
          pdfStore.createIndex("courseId", "courseId", { unique: false });
        }

        // Lessons store — keyed by "courseId::weekNumber"
        if (!db.objectStoreNames.contains("lessons")) {
          const lessonStore = db.createObjectStore("lessons", { keyPath: "id" });
          lessonStore.createIndex("courseId", "courseId", { unique: false });
        }

        // Download metadata — tracks which courses have been downloaded
        if (!db.objectStoreNames.contains("downloads")) {
          db.createObjectStore("downloads", { keyPath: "courseId" });
        }
      },
    });
  }
  return dbPromise;
}

// ── Download tracking ────────────────────────────────────────────────────

export interface DownloadState {
  courseId: string;
  status: "complete" | "partial" | "downloading";
  progressPct: number; // 0–100
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export async function getDownloadState(
  courseId: string,
): Promise<DownloadState | undefined> {
  const db = await getDb();
  return db.get("downloads", courseId);
}

export async function setDownloadState(state: DownloadState): Promise<void> {
  const db = await getDb();
  await db.put("downloads", state);
}

export async function removeDownloadState(courseId: string): Promise<void> {
  const db = await getDb();
  await db.delete("downloads", courseId);
}

export async function getAllDownloadStates(): Promise<DownloadState[]> {
  const db = await getDb();
  return db.getAll("downloads");
}

// ── Courses ───────────────────────────────────────────────────────────────

export async function storeCourses(courses: Course[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("courses", "readwrite");
  const now = Date.now();
  for (const course of courses) {
    await tx.store.put({ ...course, lastSynced: now } as StoredCourse);
  }
  await tx.done;
}

export async function getStoredCourses(): Promise<StoredCourse[]> {
  const db = await getDb();
  return db.getAll("courses");
}

export async function getStoredCourse(
  courseId: string,
): Promise<StoredCourse | undefined> {
  const db = await getDb();
  return db.get("courses", courseId);
}

// ── PDFs ──────────────────────────────────────────────────────────────────

export async function storePdfs(
  courseId: string,
  pdfs: CoursePDF[],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("pdfs", "readwrite");
  const now = Date.now();
  for (const pdf of pdfs) {
    // Use a meaningful composite key
    await tx.store.put({
      ...pdf,
      courseId,
      id: `${courseId}::${pdf.id}`,
      lastSynced: now,
    } as StoredPDF);
  }
  await tx.done;
}

export async function storePdfBlob(
  courseId: string,
  pdfId: string,
  blob: ArrayBuffer,
): Promise<void> {
  const db = await getDb();
  const key = `${courseId}::${pdfId}`;
  const existing = await db.get("pdfs", key);
  if (existing) {
    await db.put("pdfs", { ...existing, blob });
  }
}

export async function getStoredPdfs(
  courseId: string,
): Promise<StoredPDF[]> {
  const db = await getDb();
  const index = db.transaction("pdfs").store.index("courseId");
  return index.getAll(courseId);
}

export async function getStoredPdf(
  courseId: string,
  pdfId: string,
): Promise<StoredPDF | undefined> {
  const db = await getDb();
  return db.get("pdfs", `${courseId}::${pdfId}`);
}

// ── Lessons ───────────────────────────────────────────────────────────────

export async function storeLesson(lesson: Lesson): Promise<void> {
  const db = await getDb();
  const id = `${lesson.course_id}::${lesson.week_number}`;
  await db.put("lessons", { ...lesson, id, lastSynced: Date.now() } as StoredLesson);
}

export async function getStoredLesson(
  courseId: string,
  weekNumber: number,
): Promise<StoredLesson | undefined> {
  const db = await getDb();
  return db.get("lessons", `${courseId}::${weekNumber}`);
}

export async function getStoredLessonsForCourse(
  courseId: string,
): Promise<StoredLesson[]> {
  const db = await getDb();
  const index = db.transaction("lessons").store.index("courseId");
  return index.getAll(courseId);
}

// ── Delete / cleanup ──────────────────────────────────────────────────────

export async function removeCourseContent(courseId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["pdfs", "lessons", "downloads", "courses"], "readwrite");

  // Remove PDFs for this course
  const pdfIndex = tx.objectStore("pdfs").index("courseId");
  let pdfCursor = await pdfIndex.openCursor(courseId);
  while (pdfCursor) {
    await pdfCursor.delete();
    pdfCursor = await pdfCursor.continue();
  }

  // Remove lessons for this course
  const lessonIndex = tx.objectStore("lessons").index("courseId");
  let lessonCursor = await lessonIndex.openCursor(courseId);
  while (lessonCursor) {
    await lessonCursor.delete();
    lessonCursor = await lessonCursor.continue();
  }

  // Remove download state
  await tx.objectStore("downloads").delete(courseId);

  // Remove course metadata
  await tx.objectStore("courses").delete(courseId);

  await tx.done;
}

export async function clearAllContent(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ["courses", "pdfs", "lessons", "downloads"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("courses").clear(),
    tx.objectStore("pdfs").clear(),
    tx.objectStore("lessons").clear(),
    tx.objectStore("downloads").clear(),
  ]);
  await tx.done;
}

// ── Utility: check storage estimate ───────────────────────────────────────

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}
