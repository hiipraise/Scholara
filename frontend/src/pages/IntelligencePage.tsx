import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Sigma, BookOpenText } from "lucide-react";
import { coursesApi, intelligenceApi } from "../api";
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
              <Sigma size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">
                Formulas
              </h3>
            </div>
            {formulas && formulas.length > 0 ? (
              <div className="space-y-2">
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
              <div className="space-y-3">
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
                                className="block truncate text-cream-200/45 hover:text-cream-200/70"
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
