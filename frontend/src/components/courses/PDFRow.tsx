import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { coursesApi } from "../../api/index";
import type { Course, CoursePDF } from "../../types";
import { formatBytes } from "../../utils/format";
import toast from "react-hot-toast";

interface PDFRowProps {
  pdf: CoursePDF;
  courseId: string;
  isAdmin: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

// Human-readable labels for the backend processing stages so the admin can see
// exactly what the worker is doing instead of a generic "Processing...".
const STAGE_LABELS: Record<string, string> = {
  extracting: "Reading PDF content",
  analyzing: "Analyzing content",
  generating: "Generating questions",
  persisting: "Saving data",
  done: "Completed",
};

function processingLabel(pdf: CoursePDF): string {
  if (pdf.is_processed) return "Completed";
  if (pdf.processing_status === "failed") return "Failed";
  if (pdf.processing_status === "pending") return "Queued";
  const stage = pdf.processing_stage ? STAGE_LABELS[pdf.processing_stage] : null;
  return stage || "Starting...";
}

export default function PDFRow({ pdf, courseId, isAdmin, selected, onToggleSelect }: PDFRowProps) {
  const qc = useQueryClient();
  const [showSummary, setShowSummary] = useState(false);
  const [editingWeek, setEditingWeek] = useState(false);
  const [weekDraft, setWeekDraft] = useState(pdf.week_number ?? 1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => coursesApi.deletePdf(courseId, pdf.id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["course-pdfs", courseId] });
      await qc.cancelQueries({ queryKey: ["courses", "all"] });

      const previousPdfs = qc.getQueryData<CoursePDF[]>([
        "course-pdfs",
        courseId,
      ]);
      const previousCourses = qc.getQueryData<Course[]>(["courses", "all"]);

      qc.setQueryData<CoursePDF[]>(["course-pdfs", courseId], (current) =>
        current ? current.filter((item) => item.id !== pdf.id) : current,
      );

      qc.setQueryData<Course[]>(["courses", "all"], (current) => {
        if (!current) return current;
        const nextPdfs = (previousPdfs || []).filter(
          (item) => item.id !== pdf.id,
        );
        const nextWeeks = Array.from(
          new Set(nextPdfs.map((item) => item.week_number).filter((week): week is number => week !== null)),
        ).sort((a, b) => a - b);
        return current.map((course) =>
          course.id === courseId
            ? {
                ...course,
                pdf_count: Math.max(0, course.pdf_count - 1),
                weeks_uploaded: nextWeeks,
              }
            : course,
        );
      });

      return { previousPdfs, previousCourses };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previousPdfs) {
        qc.setQueryData(["course-pdfs", courseId], context.previousPdfs);
      }
      if (context?.previousCourses) {
        qc.setQueryData(["courses", "all"], context.previousCourses);
      }
      toast.error(err.response?.data?.detail || "Failed to delete PDF");
    },
    onSuccess: () => {
      toast.success("PDF removed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["course-pdfs", courseId] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  const weekMutation = useMutation({
    mutationFn: (week: number) =>
      coursesApi.updatePdfWeek(courseId, pdf.id, week),
    onMutate: async (week) => {
      const clamped = Math.max(1, Math.min(20, week));
      await qc.cancelQueries({ queryKey: ["course-pdfs", courseId] });
      await qc.cancelQueries({ queryKey: ["courses", "all"] });

      const previousPdfs = qc.getQueryData<CoursePDF[]>([
        "course-pdfs",
        courseId,
      ]);
      const previousCourses = qc.getQueryData<Course[]>(["courses", "all"]);

      qc.setQueryData<CoursePDF[]>(["course-pdfs", courseId], (current) => {
        if (!current) return current;
        return current.map((item) =>
          item.id === pdf.id ? { ...item, week_number: clamped } : item,
        );
      });

      qc.setQueryData<Course[]>(["courses", "all"], (current) => {
        if (!current) return current;
        const nextPdfs = (previousPdfs || []).map((item) =>
          item.id === pdf.id ? { ...item, week_number: clamped } : item,
        );
        const nextWeeks = Array.from(
          new Set(nextPdfs.map((item) => item.week_number).filter((week): week is number => week !== null)),
        ).sort((a, b) => a - b);
        return current.map((course) =>
          course.id === courseId
            ? {
                ...course,
                weeks_uploaded: nextWeeks,
              }
            : course,
        );
      });

      setEditingWeek(false);
      return { previousPdfs, previousCourses, previousWeek: pdf.week_number };
    },
    onError: (err: any, _week, context) => {
      if (context?.previousPdfs) {
        qc.setQueryData(["course-pdfs", courseId], context.previousPdfs);
      }
      if (context?.previousCourses) {
        qc.setQueryData(["courses", "all"], context.previousCourses);
      }
      if (context?.previousWeek != null) {
        setWeekDraft(context.previousWeek);
        setEditingWeek(true);
      }
      toast.error(err.response?.data?.detail || "Failed to update week");
    },
    onSuccess: (_, week) => {
      toast.success(`Moved to Week ${week}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["course-pdfs", courseId] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => coursesApi.retryPdfProcessing(courseId, pdf.id),
    onSuccess: () => {
      toast.success("PDF processing has been queued for retry");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to retry PDF processing");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["course-pdfs", courseId] });
    },
  });

  function handleWeekSave() {
    const clamped = Math.max(1, Math.min(20, weekDraft));
    if (clamped === (pdf.week_number ?? 1)) {
      setEditingWeek(false);
      return;
    }
    weekMutation.mutate(clamped);
  }

  return (
    <div className="rounded-xl border border-cream-200/8 p-3">
      <div className="flex items-center gap-3">
        {isAdmin && onToggleSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={clsx(
              "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
              selected
                ? "bg-accent-sky border-accent-sky text-white"
                : "border-cream-200/20 hover:border-cream-200/40",
            )}
            title={selected ? "Deselect PDF" : "Select PDF"}
          >
            {selected && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        )}
        <div
          className={clsx(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
            pdf.is_processed ? "bg-accent-sage/15" : "bg-cream-200/8",
          )}
        >
          {pdf.is_processed ? (
            <Check size={13} className="text-accent-sage" />
          ) : pdf.processing_status === "failed" ? (
            <RotateCcw size={13} className="text-accent-coral" />
          ) : (
            <Loader2 size={13} className="text-cream-200/30 animate-spin" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-cream-200/80 text-xs font-medium truncate">
            {pdf.original_name}
            {formatBytes(pdf.file_size) && (
              <span className="text-cream-200/30 font-normal">
                {" "}
                · {formatBytes(pdf.file_size)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {editingWeek ? (
              <>
                <span className="text-cream-200/35 text-[10px]">Wk</span>
                <input
                  autoFocus
                  type="number"
                  value={weekDraft}
                  min={1}
                  max={20}
                  onChange={(e) => setWeekDraft(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleWeekSave();
                    if (e.key === "Escape") {
                      setWeekDraft(pdf.week_number ?? 1);
                      setEditingWeek(false);
                    }
                  }}
                  className="w-12 text-center bg-cream-200/8 border border-cream-200/20 rounded-lg py-0.5 text-[10px] text-cream-200/80 focus:outline-none focus:border-cream-200/40"
                />
                <button
                  onClick={handleWeekSave}
                  disabled={weekMutation.isPending}
                  className="text-accent-sage/70 hover:text-accent-sage text-[10px] transition-colors disabled:opacity-40"
                >
                  {weekMutation.isPending ? "…" : "Save"}
                </button>
                <button
                  onClick={() => {
                    setWeekDraft(pdf.week_number ?? 1);
                    setEditingWeek(false);
                  }}
                  className="text-cream-200/30 hover:text-cream-200/60 text-[10px] transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span
                  className={clsx(
                    "text-[10px]",
                    pdf.processing_status === "failed"
                      ? "text-accent-coral/80"
                      : pdf.is_processed
                        ? "text-accent-sage/70"
                        : "text-cream-200/45",
                  )}
                >
                  {pdf.is_course_material ? "Course material" : `Week ${pdf.week_number}`}
                  {" · "}
                  {processingLabel(pdf)}
                </span>
                {isAdmin && !pdf.is_course_material && (
                  <button
                    onClick={() => setEditingWeek(true)}
                    className="text-cream-200/20 hover:text-cream-200/55 transition-colors"
                    title="Edit week"
                  >
                    <Pencil size={9} />
                  </button>
                )}
              </>
            )}
          </div>
          {pdf.processing_status === "failed" && pdf.processing_error && (
            <div
              className="text-accent-coral/70 text-[10px] mt-1 line-clamp-2"
              title={pdf.processing_error}
            >
              {pdf.processing_error}
            </div>
          )}
        </div>

        {pdf.summary && (
          <button
            onClick={() => setShowSummary((v) => !v)}
            className="text-cream-200/30 hover:text-cream-200/60 transition-colors"
          >
            {showSummary ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

        {isAdmin && pdf.processing_status === "failed" && (
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="flex items-center gap-1 rounded-lg border border-accent-gold/20 bg-accent-gold/10 px-2 py-1 text-[10px] text-accent-gold/80 transition-colors hover:bg-accent-gold/20 hover:text-accent-gold disabled:opacity-40"
            title={pdf.processing_error || "Retry PDF processing"}
          >
            {retryMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RotateCcw size={11} />
            )}
            Retry
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleteMutation.isPending}
            className="text-cream-200/20 hover:text-accent-coral transition-colors disabled:opacity-40 shrink-0"
            title="Delete PDF"
          >
            {deleteMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSummary && pdf.summary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-cream-200/8"
          >
            <p className="text-cream-200/55 text-xs leading-relaxed mb-2">
              {pdf.summary}
            </p>
            {pdf.key_points && pdf.key_points.length > 0 && (
              <div>
                <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-1">
                  Key Points
                </div>
                <ul className="space-y-1">
                  {pdf.key_points.slice(0, 4).map((kp, i) => (
                    <li
                      key={i}
                      className="text-cream-200/45 text-xs flex items-start gap-2"
                    >
                      <span className="text-accent-gold/60 mt-0.5">—</span>
                      {kp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-5">
                <h4 className="font-display text-lg text-cream-200 mb-2">
                  Delete PDF?
                </h4>
                <p className="text-cream-200/55 text-sm">
                  You are about to remove{" "}
                  <span className="text-cream-200/85">{pdf.original_name}</span>
                  . This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm"
                    onClick={() => {
                      setShowDeleteModal(false);
                      deleteMutation.mutate();
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
