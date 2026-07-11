import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { coursesApi } from "../../api/index";
import type { Course, CoursePDF } from "../../types";
import toast from "react-hot-toast";

interface PDFRowProps {
  pdf: CoursePDF;
  courseId: string;
  isAdmin: boolean;
}

export default function PDFRow({ pdf, courseId, isAdmin }: PDFRowProps) {
  const qc = useQueryClient();
  const [showSummary, setShowSummary] = useState(false);
  const [editingWeek, setEditingWeek] = useState(false);
  const [weekDraft, setWeekDraft] = useState(pdf.week_number);
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
          new Set(nextPdfs.map((item) => item.week_number)),
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
          new Set(nextPdfs.map((item) => item.week_number)),
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

  function handleWeekSave() {
    const clamped = Math.max(1, Math.min(20, weekDraft));
    if (clamped === pdf.week_number) {
      setEditingWeek(false);
      return;
    }
    weekMutation.mutate(clamped);
  }

  return (
    <div className="rounded-xl border border-cream-200/8 p-3">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
            pdf.is_processed ? "bg-accent-sage/15" : "bg-cream-200/8",
          )}
        >
          {pdf.is_processed ? (
            <Check size={13} className="text-accent-sage" />
          ) : (
            <Loader2 size={13} className="text-cream-200/30 animate-spin" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-cream-200/80 text-xs font-medium truncate">
            {pdf.original_name}
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
                      setWeekDraft(pdf.week_number);
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
                    setWeekDraft(pdf.week_number);
                    setEditingWeek(false);
                  }}
                  className="text-cream-200/30 hover:text-cream-200/60 text-[10px] transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-cream-200/35 text-[10px]">
                  Week {pdf.week_number}
                  {pdf.is_processed ? " · Processed" : " · Processing..."}
                </span>
                {isAdmin && (
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
        </div>

        {pdf.summary && (
          <button
            onClick={() => setShowSummary((v) => !v)}
            className="text-cream-200/30 hover:text-cream-200/60 transition-colors"
          >
            {showSummary ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
