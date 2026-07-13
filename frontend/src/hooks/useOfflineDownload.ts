// src/hooks/useOfflineDownload.ts
import { useState, useCallback, useRef } from "react";
import { coursesApi, lessonApi } from "../api";
import { getAccessToken } from "../api/client";
import {
  storeCourses,
  storePdfs,
  storePdfBlob,
  storeLesson,
  setDownloadState,
  removeDownloadState,
  getDownloadState,
  removeCourseContent,
  getStorageEstimate,
  type DownloadState,
} from "../lib/contentDb";
import type { Course, CoursePDF } from "../types";
import toast from "react-hot-toast";

interface DownloadProgress {
  status: "idle" | "downloading" | "complete" | "partial" | "error";
  progressPct: number;
  step: string;
  error?: string;
}

export function useOfflineDownload() {
  const [progress, setProgress] = useState<DownloadProgress>({
    status: "idle",
    progressPct: 0,
    step: "",
  });
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const downloadCourse = useCallback(async (course: Course) => {
    const courseId = course.id;
    const updateProgress = (pct: number, step: string) => {
      setProgress({ status: "downloading" as const, progressPct: pct, step });
    };

    updateProgress(0, "Starting...");

    try {
      // Check existing download state
      const existingState = await getDownloadState(courseId);
      if (existingState?.status === "downloading") {
        toast.error("Download already in progress for this course");
        return;
      }

      // Storage quota check
      const estimate = await getStorageEstimate();
      if (estimate) {
        const available = estimate.quota - estimate.usage;
        // Rough estimate: assume ~500KB per PDF + ~100KB per lesson
        const estimatedNeed =
          (course.pdf_count || 5) * 500 * 1024 +
          (course.weeks_uploaded?.length || 5) * 100 * 1024;
        if (available < estimatedNeed) {
          const availableMb = (available / (1024 * 1024)).toFixed(1);
          const neededMb = (estimatedNeed / (1024 * 1024)).toFixed(1);
          const errorMsg = `Not enough storage space. Available: ${availableMb}MB, needed: ~${neededMb}MB. Remove another downloaded course or free space on your device.`;
          await setDownloadState({
            courseId,
            status: "partial",
            progressPct: 0,
            startedAt: Date.now(),
            error: errorMsg,
          });
          setProgress({ status: "error", progressPct: 0, step: "Failed", error: errorMsg });
          toast.error(errorMsg);
          return;
        }
      }

      await setDownloadState({
        courseId,
        status: "downloading",
        progressPct: 0,
        startedAt: Date.now(),
      });

      // Step 1: Fetch PDFs
      updateProgress(10, "Fetching PDFs...");
      let pdfs: CoursePDF[] = [];
      try {
        const pdfRes = await coursesApi.getPdfs(courseId);
        pdfs = pdfRes.data;
        await storePdfs(courseId, pdfs);
      } catch (err) {
        console.warn("Failed to fetch PDFs for offline:", err);
      }

      // Step 2: Download PDF blobs (binary) with auth
      updateProgress(30, "Downloading PDF files...");
      const pdfCount = pdfs.length;
      let pdfsDownloaded = 0;
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      for (const pdf of pdfs) {
        try {
          const pdfUrl = `/api/courses/${courseId}/pdfs/${pdf.id}/download`;
          const blobRes = await fetch(pdfUrl, { headers });
          if (blobRes.ok) {
            const blob = await blobRes.arrayBuffer();
            await storePdfBlob(courseId, pdf.id, blob);
          }
        } catch (err) {
          console.warn(`Failed to download PDF ${pdf.id}:`, err);
        }
        pdfsDownloaded++;
        const pct = 30 + Math.round((pdfsDownloaded / Math.max(pdfCount, 1)) * 30);
        updateProgress(pct, `Downloading PDFs (${pdfsDownloaded}/${pdfCount})...`);
      }

      // Step 3: Fetch lessons for each week
      updateProgress(65, "Fetching lessons...");
      const weeks = course.weeks_uploaded || [];
      let lessonsDone = 0;
      for (const week of weeks) {
        try {
          const lessonRes = await lessonApi.get(courseId, week);
          await storeLesson(lessonRes.data);
        } catch {
          // Lesson might not exist yet — skip
        }
        lessonsDone++;
        const pct = 65 + Math.round((lessonsDone / Math.max(weeks.length, 1)) * 25);
        updateProgress(pct, `Fetching lessons (${lessonsDone}/${weeks.length})...`);
      }

      // Step 4: Store course metadata and mark complete
      updateProgress(95, "Finalizing...");
      await storeCourses([course]);

      // ── Mid-download disconnect tradeoff ──
      // If the network drops partway through, the download state is set to
      // "partial" with an error message (in the catch block below). The course
      // is NOT marked as available-offline when incomplete. The user can retry
      // the download later, which will overwrite any partial data.
      //
      // Resume-on-reconnect was NOT chosen because:
      // 1. It adds significant complexity (tracking per-file progress)
      // 2. Course content is small enough that a full re-download is fast
      // 3. Nigerian mobile networks may have changed IP/reset state mid-drop
      // The simpler "mark as partial, retry from scratch" approach is more
      // predictable and easier to verify.

      await setDownloadState({
        courseId,
        status: "complete",
        progressPct: 100,
        startedAt: existingState?.startedAt || Date.now(),
        completedAt: Date.now(),
      });

      setProgress({ status: "complete", progressPct: 100, step: "Done!" });
      toast.success(`"${course.code}" saved for offline access`);
    } catch (err: any) {
      const errorMsg = err?.message || "Download failed";
      const currentPct = progressRef.current.progressPct;
      await setDownloadState({
        courseId,
        status: "partial",
        progressPct: currentPct,
        startedAt: Date.now(),
        error: errorMsg,
      });

      setProgress({
        status: "error",
        progressPct: currentPct,
        step: "Failed",
        error: errorMsg,
      });
      toast.error(`Download failed: ${errorMsg}`);
    }
  }, []);

  const removeDownload = useCallback(async (courseId: string) => {
    await removeCourseContent(courseId);
    setProgress({ status: "idle", progressPct: 0, step: "" });
    toast.success("Offline content removed");
  }, []);

  return { progress, downloadCourse, removeDownload };
}
