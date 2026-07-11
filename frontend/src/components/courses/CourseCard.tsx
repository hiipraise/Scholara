import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { coursesApi } from "../../api/index";
import type { Course, CoursePDF } from "../../types";
import PDFRow from "./PDFRow";
import toast from "react-hot-toast";

interface QueueItem {
  id: string;
  file: File;
  week: number;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  errorMsg?: string;
}

interface CourseCardProps {
  course: Course;
  color: string;
  isAdmin: boolean;
}

export default function CourseCard({
  course,
  color,
  isAdmin,
}: CourseCardProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteCourseModal, setShowDeleteCourseModal] = useState(false);

  const { data: pdfs, isLoading: pdfsLoading } = useQuery({
    queryKey: ["course-pdfs", course.id],
    queryFn: () => coursesApi.getPdfs(course.id).then((r) => r.data),
    enabled: expanded,
    refetchInterval: expanded ? 8000 : false,
  });

  const deleteCourseMutation = useMutation({
    mutationFn: () => coursesApi.deleteCourse(course.id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["courses", "all"] });
      await qc.cancelQueries({ queryKey: ["course-pdfs", course.id] });

      const previousCourses = qc.getQueryData<Course[]>(["courses", "all"]);
      const previousPdfs = qc.getQueryData<CoursePDF[]>([
        "course-pdfs",
        course.id,
      ]);

      qc.setQueryData<Course[]>(["courses", "all"], (current) => {
        if (!current) return current;
        return current.filter((item) => item.id !== course.id);
      });
      qc.setQueryData<CoursePDF[]>(["course-pdfs", course.id], []);

      return { previousCourses, previousPdfs };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previousCourses) {
        qc.setQueryData(["courses", "all"], context.previousCourses);
      }
      if (context?.previousPdfs) {
        qc.setQueryData(["course-pdfs", course.id], context.previousPdfs);
      }
      toast.error(err.response?.data?.detail || "Failed to delete course");
    },
    onSuccess: () => {
      toast.success("Course deleted");
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["study-cycle"] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newItems: QueueItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      week: 1,
      status: "pending",
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function setItemWeek(id: string, week: number) {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, week } : item)),
    );
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  async function uploadAll() {
    const pending = queue.filter((item) => item.status === "pending");
    if (!pending.length) return;
    setIsUploading(true);

    for (const item of pending) {
      setQueue((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? { ...current, status: "uploading", progress: 0 }
            : current,
        ),
      );
      try {
        await coursesApi.uploadPdf(course.id, item.week, item.file, (pct) => {
          setQueue((prev) =>
            prev.map((current) =>
              current.id === item.id ? { ...current, progress: pct } : current,
            ),
          );
        });
        setQueue((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? { ...current, status: "done", progress: 100 }
              : current,
          ),
        );
      } catch (err: any) {
        const msg = err?.response?.data?.detail || "Upload failed";
        setQueue((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? { ...current, status: "error", errorMsg: msg }
              : current,
          ),
        );
        toast.error(`${item.file.name}: ${msg}`);
      }
    }

    qc.invalidateQueries({ queryKey: ["course-pdfs", course.id] });
    qc.invalidateQueries({ queryKey: ["courses"] });
    setIsUploading(false);
    toast.success(
      `${pending.length} PDF${pending.length > 1 ? "s" : ""} uploaded — AI processing started`,
    );
  }

  const pendingCount = queue.filter((item) => item.status === "pending").length;

  return (
    <motion.div
      layout
      className="card overflow-hidden"
      style={{ borderLeft: `2px solid ${color}30` }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-cream-200/3 transition-colors"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}
        >
          <BookOpen size={17} style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-cream-200">{course.code}</span>
            <span className="text-cream-200/30 text-xs">·</span>
            <span className="text-cream-200/60 text-sm truncate">
              {course.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-cream-200/35 text-xs">
              {course.credit_units} units
            </span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">
              {course.pdf_count} PDFs
            </span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">
              {course.question_count} questions
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/courses/${course.id}`);
            }}
            className="p-1.5 rounded-lg text-cream-200/25 hover:text-accent-sky hover:bg-accent-sky/10 transition-colors"
            title="View course details"
            aria-label="View course details"
          >
            <ExternalLink size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteCourseModal(true);
              }}
              disabled={deleteCourseMutation.isPending}
              className="p-1.5 rounded-lg text-cream-200/25 hover:text-accent-coral hover:bg-accent-coral/10 transition-colors disabled:opacity-40"
              title="Delete course"
              aria-label="Delete course"
            >
              {deleteCourseMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          )}
          {course.weeks_uploaded.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {course.weeks_uploaded.slice(0, 6).map((week) => (
                <div
                  key={week}
                  className="w-5 h-5 rounded-md bg-cream-200/10 flex items-center justify-center"
                >
                  <span className="text-[9px] text-cream-200/50 font-mono">
                    {week}
                  </span>
                </div>
              ))}
              {course.weeks_uploaded.length > 6 && (
                <span className="text-cream-200/30 text-[10px]">
                  +{course.weeks_uploaded.length - 6}
                </span>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp size={16} className="text-cream-200/40" />
          ) : (
            <ChevronDown size={16} className="text-cream-200/40" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-cream-200/8"
          >
            <div className="p-5 space-y-5">
              {isAdmin && (
                <div className="p-4 rounded-xl bg-cream-200/4 border border-cream-200/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider">
                      Upload PDFs
                    </span>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cream-200/15 text-cream-200/55 hover:text-cream-200/80 hover:border-cream-200/25 cursor-pointer transition-colors text-xs">
                      <Plus size={12} />
                      Add Files
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={handleFilePick}
                      />
                    </label>
                  </div>

                  {queue.length > 0 ? (
                    <div className="space-y-2">
                      {queue.map((item) => (
                        <div
                          key={item.id}
                          className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors",
                            item.status === "done" &&
                              "border-accent-sage/20 bg-accent-sage/5",
                            item.status === "error" &&
                              "border-accent-coral/20 bg-accent-coral/5",
                            item.status === "uploading" &&
                              "border-cream-200/15 bg-cream-200/5",
                            item.status === "pending" && "border-cream-200/10",
                          )}
                        >
                          <div className="shrink-0">
                            {item.status === "done" && (
                              <Check size={14} className="text-accent-sage" />
                            )}
                            {item.status === "error" && (
                              <AlertCircle
                                size={14}
                                className="text-accent-coral"
                              />
                            )}
                            {item.status === "uploading" && (
                              <Loader2
                                size={14}
                                className="text-cream-200/50 animate-spin"
                              />
                            )}
                            {item.status === "pending" && (
                              <FileText
                                size={14}
                                className="text-cream-200/30"
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-cream-200/75 text-xs font-medium truncate">
                              {item.file.name}
                            </div>
                            {item.status === "uploading" && (
                              <div className="mt-1 h-1 bg-cream-200/10 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-cream-200/50 rounded-full"
                                  animate={{ width: `${item.progress}%` }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                            )}
                            {item.status === "error" && (
                              <div className="text-accent-coral/70 text-[10px] mt-0.5">
                                {item.errorMsg}
                              </div>
                            )}
                          </div>

                          {item.status === "pending" ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-cream-200/30 text-[10px]">
                                Wk
                              </span>
                              <input
                                type="number"
                                value={item.week}
                                min={1}
                                max={20}
                                onChange={(e) =>
                                  setItemWeek(item.id, Number(e.target.value))
                                }
                                className="w-12 text-center bg-cream-200/8 border border-cream-200/12 rounded-lg py-1 text-xs text-cream-200/80 focus:outline-none focus:border-cream-200/30"
                              />
                            </div>
                          ) : (
                            <span className="text-cream-200/30 text-[10px] shrink-0">
                              Wk {item.week}
                            </span>
                          )}

                          {(item.status === "pending" ||
                            item.status === "error") && (
                            <button
                              onClick={() => removeItem(item.id)}
                              className="shrink-0 p-1 rounded text-cream-200/20 hover:text-accent-coral transition-colors"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-cream-200/25 text-xs text-center py-2">
                      Click &quot;Add Files&quot; to select one or more PDFs
                    </p>
                  )}

                  {queue.length > 0 && (
                    <div className="flex items-center gap-3 pt-1">
                      {pendingCount > 0 && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={uploadAll}
                          disabled={isUploading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cream-200 text-indigo-600 font-semibold text-sm hover:bg-cream-100 disabled:opacity-50 transition-colors"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />{" "}
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload size={14} /> Upload {pendingCount} PDF
                              {pendingCount > 1 ? "s" : ""}
                            </>
                          )}
                        </motion.button>
                      )}
                      {queue.some((item) => item.status === "done") &&
                        !isUploading && (
                          <button
                            onClick={() =>
                              setQueue((prev) =>
                                prev.filter((item) => item.status !== "done"),
                              )
                            }
                            className="text-cream-200/30 hover:text-cream-200/60 text-xs transition-colors"
                          >
                            Clear done
                          </button>
                        )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-cream-200/40 text-xs font-semibold uppercase tracking-wider mb-3">
                  Uploaded PDFs ({pdfs?.length ?? 0})
                </div>
                {pdfsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-12 shimmer-bg rounded-xl" />
                    ))}
                  </div>
                ) : pdfs && pdfs.length > 0 ? (
                  <div className="space-y-2">
                    {pdfs.map((pdf) => (
                      <PDFRow
                        key={pdf.id}
                        pdf={pdf}
                        courseId={course.id}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-cream-200/25 text-sm">
                    No PDFs uploaded yet.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteCourseModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowDeleteCourseModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-5">
                <h4 className="font-display text-lg text-cream-200 mb-2">
                  Delete Course?
                </h4>
                <p className="text-cream-200/55 text-sm">
                  You are about to delete{" "}
                  <span className="text-cream-200/85">{course.code}</span>. All
                  related PDFs and active questions for this course will be
                  removed from student views.
                </p>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowDeleteCourseModal(false)}
                    disabled={deleteCourseMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm"
                    onClick={() => {
                      setShowDeleteCourseModal(false);
                      deleteCourseMutation.mutate();
                    }}
                    disabled={deleteCourseMutation.isPending}
                  >
                    Delete Course
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
