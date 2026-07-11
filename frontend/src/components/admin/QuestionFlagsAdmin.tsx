import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import { adminApi } from "../../api/index";
import type { QuestionFlag } from "../../types";
import toast from "react-hot-toast";

export default function QuestionFlagsAdmin() {
  const qc = useQueryClient();
  const [showResolveAllModal, setShowResolveAllModal] = useState(false);
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");

  const { data: flags, isLoading } = useQuery({
    queryKey: ["question-flags", status],
    queryFn: () => adminApi.getQuestionFlags(status).then((r) => r.data.items),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      questionId,
      deactivate,
    }: {
      questionId: string;
      deactivate: boolean;
    }) => adminApi.resolveQuestionFlags(questionId, deactivate),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["question-flags"] });
      toast.success(
        variables.deactivate
          ? "Question disabled and flags resolved"
          : "Flags resolved",
      );
    },
    onError: () => toast.error("Failed to update flagged question"),
  });

  const resolveAllMutation = useMutation({
    mutationFn: () => adminApi.resolveAllQuestionFlags(true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-flags"] });
      toast.success("All open flagged questions disabled and resolved");
    },
    onError: () => toast.error("Failed to disable all flagged questions"),
  });

  const openActiveFlagsCount =
    flags?.filter((f) => f.status === "open" && f.is_active).length ?? 0;

  function resolve(flag: QuestionFlag, deactivate: boolean) {
    resolveMutation.mutate({ questionId: flag.question_id, deactivate });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-cream-200/70 text-sm font-semibold">
            Flagged Questions ({flags?.length ?? 0})
          </h3>
          <p className="text-cream-200/35 text-xs mt-1">
            Review reported questions, resolve false alarms, or disable bad
            questions from future feeds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <>
            <button
              onClick={() => {
                if (openActiveFlagsCount === 0) return;
                setShowResolveAllModal(true);
              }}
              disabled={
                resolveAllMutation.isPending ||
                resolveMutation.isPending ||
                openActiveFlagsCount === 0
              }
              className="btn-primary text-xs px-3 py-2"
            >
              {resolveAllMutation.isPending
                ? "Disabling..."
                : `Disable all questions (${openActiveFlagsCount})`}
            </button>
            <AnimatePresence>
              {showResolveAllModal && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 z-40"
                    onClick={() => setShowResolveAllModal(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  >
                    <div className="w-full max-w-md card p-5">
                      <h4 className="font-display text-lg text-cream-200 mb-2">
                        Disable all flagged questions?
                      </h4>
                      <p className="text-cream-200/55 text-sm">
                        This will disable and resolve {openActiveFlagsCount}{" "}
                        open flagged question
                        {openActiveFlagsCount === 1 ? "" : "s"}. This cannot be
                        undone.
                      </p>
                      <div className="flex justify-end gap-2 mt-5">
                        <button
                          className="btn-ghost text-sm"
                          onClick={() => setShowResolveAllModal(false)}
                          disabled={resolveAllMutation.isPending}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn-primary text-sm"
                          onClick={() => {
                            setShowResolveAllModal(false);
                            resolveAllMutation.mutate();
                          }}
                          disabled={resolveAllMutation.isPending}
                        >
                          {resolveAllMutation.isPending
                            ? "Disabling..."
                            : "Disable all"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "open" | "resolved" | "all")
            }
            className="input-field text-xs sm:w-40"
          >
            <option value="open">Open flags</option>
            <option value="resolved">Resolved flags</option>
            <option value="all">All flags</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {flags?.map((flag) => (
          <div key={flag.question_id} className="card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="badge border border-accent-coral/25 bg-accent-coral/12 text-accent-coral text-[10px]">
                    {flag.flag_count} {flag.flag_count === 1 ? "flag" : "flags"}
                  </span>
                  <span className="badge border border-cream-200/12 text-cream-200/55 text-[10px]">
                    {flag.course_code}{" "}
                    {flag.week_number ? `· Week ${flag.week_number}` : ""}
                  </span>
                  <span
                    className={clsx(
                      "badge border text-[10px]",
                      flag.is_active
                        ? "border-accent-sage/25 bg-accent-sage/12 text-accent-sage"
                        : "border-cream-200/10 bg-cream-200/5 text-cream-200/35",
                    )}
                  >
                    {flag.is_active ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="text-cream-200/85 text-sm leading-relaxed">
                  {flag.question_text}
                </p>
                {flag.reasons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {flag.reasons.slice(0, 5).map((reason) => (
                      <span
                        key={reason}
                        className="rounded-lg bg-cream-200/6 px-2 py-1 text-[11px] text-cream-200/55"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-cream-200/30 text-[11px]">
                  Latest:{" "}
                  {flag.latest_flagged_at
                    ? format(
                        parseISO(flag.latest_flagged_at),
                        "MMM d, yyyy h:mm a",
                      )
                    : "—"}
                  {flag.reporters.length > 0
                    ? ` · ${flag.reporters.length} reporter${flag.reporters.length === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              {flag.status === "open" && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => resolve(flag, false)}
                    disabled={resolveMutation.isPending}
                    className="btn-ghost text-xs px-3 py-2"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => resolve(flag, true)}
                    disabled={resolveMutation.isPending || !flag.is_active}
                    className="btn-primary text-xs px-3 py-2"
                  >
                    Disable question
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (!flags || flags.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-cream-200/30 text-sm">
              No {status === "all" ? "" : status} question flags found.
            </p>
          </div>
        )}
        {isLoading && (
          <div className="card p-8 text-center">
            <p className="text-cream-200/30 text-sm">
              Loading flagged questions...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
