import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Sigma, BookOpenText, Layers } from "lucide-react";
import { coursesApi, intelligenceApi } from "../api";
import type { CourseTopic } from "../types";
import { useAuthStore } from "../store/authStore";

export default function IntelligencePage() {
  const { user } = useAuthStore();
  const [courseId, setCourseId] = useState<string>("");
  const [tab, setTab] = useState<"current" | "past">("current");

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.level, user?.semester, "intelligence"],
    queryFn: () => coursesApi.list().then((r) => r.data),
  });

  const rank = (level: string, semester: number) =>
    (Number(level.replace("L", "")) || 0) * 10 + semester;
  const currentRank = user ? rank(user.level, user.semester) : 0;
  const currentCourses = (courses || []).filter(
    (c) => c.level === user?.level && c.semester === user?.semester,
  );
  const pastCourses = (courses || []).filter(
    (c) => rank(c.level, c.semester) < currentRank,
  );
  const scopedCourses = tab === "current" ? currentCourses : pastCourses;

  // Keep the controlled select aligned with the currently visible course set.
  useEffect(() => {
    const firstCourseId = scopedCourses[0]?.id || "";
    const selectedCourseIsVisible = scopedCourses.some(
      (c) => c.id === courseId,
    );

    if (!selectedCourseIsVisible && courseId !== firstCourseId) {
      setCourseId(firstCourseId);
    }
  }, [courseId, scopedCourses]);

  const selectedCourseId = courseId || scopedCourses?.[0]?.id || "";
  const selectedCourse = useMemo(
    () => scopedCourses?.find((c) => c.id === selectedCourseId),
    [scopedCourses, selectedCourseId],
  );

  const { data: profile } = useQuery({
    queryKey: ["intelligence", "profile", selectedCourseId],
    queryFn: () =>
      intelligenceApi.getProfile(selectedCourseId).then((r) => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const { data: formulas } = useQuery({
    queryKey: ["intelligence", "formulas", selectedCourseId],
    queryFn: () =>
      intelligenceApi.getFormulas(selectedCourseId).then((r) => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const { data: notes } = useQuery({
    queryKey: ["intelligence", "deep-dive", selectedCourseId],
    queryFn: () =>
      intelligenceApi.getDeepDive(selectedCourseId).then((r) => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const { data: topics } = useQuery({
    queryKey: ["intelligence", "topics", selectedCourseId],
    queryFn: () =>
      intelligenceApi.getTopics(selectedCourseId).then((r) => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const groupedTopics = useMemo(() => {
    if (!topics) return [];
    const map = new Map<string, CourseTopic[]>();
    for (const t of topics) {
      const group = map.get(t.topic) || [];
      group.push(t);
      map.set(t.topic, group);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) =>
      // Sort groups by highest importance weight descending
      Math.max(...b.map((t) => t.importance_weight)) -
      Math.max(...a.map((t) => t.importance_weight))
    );
  }, [topics]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
          Adaptive Intelligence
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
          Course Intelligence
        </h1>
        <p className="text-cream-200/45 text-sm mt-1">
          Profiles, formulas, and deep-dive notes built dynamically from your
          course materials.
        </p>
      </div>

      <div className="card p-4">
        <div
          className="inline-flex rounded-xl border border-cream-200/10 p-1 mb-3"
          role="tablist"
          aria-label="Course term tabs"
        >
          <button
            type="button"
            onClick={() => setTab("current")}
            aria-pressed={tab === "current"}
            className={
              tab === "current"
                ? "px-3 py-1.5 text-xs rounded-lg bg-cream-200/12 text-cream-200"
                : "px-3 py-1.5 text-xs rounded-lg text-cream-200/40"
            }
          >
            Current ({currentCourses.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            aria-pressed={tab === "past"}
            className={
              tab === "past"
                ? "px-3 py-1.5 text-xs rounded-lg bg-cream-200/12 text-cream-200"
                : "px-3 py-1.5 text-xs rounded-lg text-cream-200/40"
            }
          >
            Past ({pastCourses.length})
          </button>
        </div>
        <label
          htmlFor="int-course-select"
          className="text-cream-200/45 text-xs uppercase tracking-wider"
        >
          Select Course
        </label>
        <select
          id="int-course-select"
          className="input-field mt-2"
          value={selectedCourseId}
          onChange={(e) => setCourseId(e.target.value)}
          aria-label="Select course to view intelligence"
          disabled={!scopedCourses || scopedCourses.length === 0}
        >
          {!scopedCourses || scopedCourses.length === 0 ? (
            <option value="">No courses available</option>
          ) : (
            scopedCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.title}
              </option>
            ))
          )}
        </select>
      </div>

      {selectedCourse ? (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">
                Adaptive Profile
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-cream-200/4 rounded-xl p-3 sm:col-span-2">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">
                  Profile Summary
                </div>
                <div className="text-cream-200/85 mt-1">
                  {profile?.profile?.summary ||
                    "This profile is still being refined from your uploaded materials."}
                </div>
              </div>
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">
                  Focus Label
                </div>
                <div className="text-cream-200/85 mt-1">
                  {profile?.profile?.focus_label ||
                    (profile?.profile?.is_formula_heavy
                      ? "calculation-heavy"
                      : "balanced")}
                </div>
              </div>
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">
                  Explanation Mode
                </div>
                <div className="text-cream-200/85 mt-1">
                  {profile?.profile?.explanation_mode || "exam_style"}
                </div>
              </div>
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">
                  Revision Priority
                </div>
                <div className="text-cream-200/85 mt-1">
                  {profile?.profile?.revision_priority ||
                    "Use the lecture summary and worked examples first"}
                </div>
              </div>
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">
                  Study Tip
                </div>
                <div className="text-cream-200/85 mt-1">
                  {profile?.profile?.study_tip ||
                    "Review the notes, then practice with the extracted questions."}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">
                Topics
              </h3>
            </div>
            {groupedTopics.length > 0 ? (
              <div className="space-y-3 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {groupedTopics.map(([topicName, subtopics]) => {
                  const maxWeight = Math.max(
                    ...subtopics.map((t) => t.importance_weight),
                  );
                  const weightLabel =
                    maxWeight >= 4
                      ? "High"
                      : maxWeight >= 2.5
                        ? "Medium"
                        : "Low";
                  return (
                    <details
                      key={topicName}
                      className="group rounded-xl border border-cream-200/8 open:border-accent-sky/20 overflow-hidden"
                    >
                      <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-cream-200/4 transition-colors list-none">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent-sky/40 shrink-0" />
                          <span className="text-cream-200/85 text-sm font-semibold truncate">
                            {topicName}
                          </span>
                          <span className="text-cream-200/30 text-[11px] shrink-0">
                            {subtopics.length}{" "}
                            {subtopics.length === 1 ? "subtopic" : "subtopics"}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                            weightLabel === "High"
                              ? "bg-amber-500/12 text-amber-300/70"
                              : weightLabel === "Medium"
                                ? "bg-accent-sky/10 text-accent-sky/60"
                                : "bg-cream-200/6 text-cream-200/40"
                          }`}
                        >
                          {weightLabel}
                        </span>
                      </summary>
                      <div className="border-t border-cream-200/6 divide-y divide-cream-200/6">
                        {subtopics.map((st) => (
                          <div key={st.id} className="px-3 py-2.5 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-cream-200/80 text-xs font-medium">
                                {st.subtopic}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {Array.from(
                                  { length: Math.round(st.importance_weight) },
                                  (_, i) => (
                                    <div
                                      key={i}
                                      className="w-1 h-1 rounded-full bg-accent-sky/50"
                                    />
                                  ),
                                )}
                              </div>
                            </div>
                            {st.learning_outcome && (
                              <p className="text-cream-200/45 text-[11px] leading-relaxed">
                                {st.learning_outcome}
                              </p>
                            )}
                            {st.source && (
                              <div className="text-cream-200/20 text-[10px]">
                                {st.source}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="text-cream-200/35 text-sm">
                No topics extracted yet. Upload more PDFs for this course.
              </p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sigma size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">
                Formulas
              </h3>
            </div>
            {formulas && formulas.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {formulas.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-cream-200/8 p-3"
                  >
                    {f.formula_name === f.expression ? (
                      <div className="text-cream-200/85 text-sm font-semibold">
                        {f.expression}
                      </div>
                    ) : (
                      <>
                        <div className="text-cream-200/85 text-sm font-semibold">
                          {f.formula_name}
                        </div>
                        <div className="text-cream-200/45 text-xs mt-1">
                          {f.expression}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-200/35 text-sm">
                No formulas extracted yet. Upload more PDFs for this course.
              </p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpenText size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">
                Deep Dive Notes
              </h3>
            </div>
            {notes && notes.length > 0 ? (
              <div className="space-y-3 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-cream-200/8 p-3"
                  >
                    <div className="text-cream-200/85 text-sm font-semibold">
                      {n.title}
                    </div>
                    <p className="text-cream-200/50 text-sm mt-1">{n.note}</p>
                    {n.references?.length ? (
                      <div className="mt-2 space-y-1 text-[11px] text-cream-200/35">
                        <div className="uppercase tracking-wider text-cream-200/25">
                          Web references
                        </div>
                        <div className="space-y-1">
                          {n.references.map((ref, idx) => {
                            const [label, url] = ref.split(" | ");
                            return (
                              <a
                                key={`${n.id}-${idx}`}
                                href={url || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="block break-words text-cream-200/45 hover:text-cream-200/70 leading-snug"
                              >
                                {label || ref}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-200/35 text-sm">
                No deep-dive notes yet. They are generated from uploaded course
                content.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="card p-8 text-center text-cream-200/45">
          {tab === "current"
            ? "No course available for current term yet."
            : "No past course intelligence yet."}
        </div>
      )}
    </div>
  );
}
