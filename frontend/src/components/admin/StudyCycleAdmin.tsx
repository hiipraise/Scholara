import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Save, X } from "lucide-react";
import { adminApi, coursesApi } from "../../api/index";
import { useAuthStore } from "../../store/authStore";
import { COURSE_COLORS } from "../../constants/courseColors";
import toast from "react-hot-toast";

export default function StudyCycleAdmin() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editDays, setEditDays] = useState<
    { day_number: number; course_ids: string[] }[]
  >([]);

  const { data: cycle } = useQuery({
    queryKey: ["study-cycle", user?.level, user?.semester],
    queryFn: () =>
      adminApi.getStudyCycle(user?.level, user?.semester).then((r) => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.level, user?.semester],
    queryFn: () =>
      coursesApi.list(user?.level, user?.semester).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateStudyCycle(user?.level || "100L", user?.semester || 1, editDays),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study-cycle"] });
      setEditing(false);
      toast.success("Study cycle updated");
    },
    onError: () => toast.error("Failed to save study cycle"),
  });

  function startEdit() {
    setEditDays(
      cycle?.map((d) => ({
        day_number: d.day_number,
        course_ids: d.courses.map((c) => c.id),
      })) || [1, 2, 3, 4, 5].map((n) => ({ day_number: n, course_ids: [] })),
    );
    setEditing(true);
  }

  function toggleCourse(dayNum: number, courseId: string) {
    setEditDays((prev) =>
      prev.map((d) => {
        if (d.day_number !== dayNum) return d;
        const has = d.course_ids.includes(courseId);
        return {
          ...d,
          course_ids: has
            ? d.course_ids.filter((id) => id !== courseId)
            : [...d.course_ids, courseId],
        };
      }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-cream-200/70 text-sm font-semibold">
          5-Day Study Cycle
        </h3>
        {!editing ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-2 btn-ghost text-sm"
          >
            <Edit2 size={13} /> Edit Cycle
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 btn-primary text-sm"
            >
              <Save size={13} />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditDays([]);
                setEditing(false);
              }}
              className="flex items-center gap-2 btn-ghost text-sm"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {editDays.map((day) => (
            <div key={day.day_number} className="card p-4">
              <div className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider mb-3">
                Day {day.day_number}
              </div>
              <div className="flex flex-wrap gap-2">
                {courses?.map((c, ci) => {
                  const active = day.course_ids.includes(c.id);
                  const color = COURSE_COLORS[ci % COURSE_COLORS.length];
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCourse(day.day_number, c.id)}
                      className="badge border text-xs transition-all cursor-pointer"
                      style={
                        active
                          ? {
                              background: `${color}20`,
                              borderColor: `${color}40`,
                              color,
                            }
                          : {
                              borderColor: "rgba(240,231,213,0.1)",
                              color: "rgba(240,231,213,0.35)",
                            }
                      }
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {cycle?.length ? (
            cycle.map((day) => (
              <div key={day.day_number} className="card p-4">
                <div className="text-cream-200/45 text-xs font-semibold uppercase tracking-wider mb-3">
                  Day {day.day_number}
                </div>
                <div className="flex flex-wrap gap-2">
                  {day.courses.map((c, ci) => {
                    const color = COURSE_COLORS[ci % COURSE_COLORS.length];
                    return (
                      <span
                        key={c.id}
                        className="badge border text-xs"
                        style={{
                          background: `${color}15`,
                          borderColor: `${color}25`,
                          color,
                        }}
                      >
                        {c.code}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="card p-8 text-center">
              <p className="text-cream-200/30 text-sm">
                No study cycle configured yet.
              </p>
              <button
                onClick={startEdit}
                className="mt-3 btn-ghost text-sm inline-flex items-center gap-2"
              >
                <Plus size={13} /> Set Up Cycle
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
