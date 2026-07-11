import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { adminApi, coursesApi } from "../../api/index";
import { useAuthStore } from "../../store/authStore";
import type { ExamSlot } from "../../types";
import toast from "react-hot-toast";

export default function ExamTimetableAdmin() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [newSlot, setNewSlot] = useState({
    course_id: "",
    exam_date: "",
    start_time: "09:00",
    end_time: "11:00",
    venue: "",
    level: user?.level || "100L",
    semester: user?.semester || 1,
  });

  const { data: slots } = useQuery({
    queryKey: ["exam-timetable", user?.level, user?.semester],
    queryFn: () =>
      adminApi
        .getExamTimetable(user?.level, user?.semester)
        .then((r) => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.level, user?.semester],
    queryFn: () =>
      coursesApi.list(user?.level, user?.semester).then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.createExamSlot(newSlot),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-timetable"] });
      toast.success("Exam slot added");
      setNewSlot((s) => ({ ...s, course_id: "", exam_date: "", venue: "" }));
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to add slot"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteExamSlot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-timetable"] });
      toast.success("Slot removed");
    },
  });

  const byDate =
    slots?.reduce<Record<string, ExamSlot[]>>((acc, s) => {
      if (!acc[s.exam_date]) acc[s.exam_date] = [];
      acc[s.exam_date].push(s);
      return acc;
    }, {}) ?? {};

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="card p-5">
        <h3 className="text-cream-200/70 text-sm font-semibold mb-4">
          Add Exam Slot
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <select
            value={newSlot.course_id}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, course_id: e.target.value }))
            }
            className="input-field col-span-2 sm:col-span-1"
          >
            <option value="">Select course...</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newSlot.exam_date}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, exam_date: e.target.value }))
            }
            className="input-field"
          />
          <input
            type="time"
            value={newSlot.start_time}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, start_time: e.target.value }))
            }
            className="input-field"
          />
          <input
            type="time"
            value={newSlot.end_time}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, end_time: e.target.value }))
            }
            className="input-field"
          />
          <input
            placeholder="Venue (optional)"
            value={newSlot.venue}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, venue: e.target.value }))
            }
            className="input-field col-span-2 sm:col-span-1"
          />
          <select
            value={newSlot.level}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, level: e.target.value }))
            }
            className="input-field"
          >
            {["100L", "200L", "300L", "400L"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={newSlot.semester}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, semester: Number(e.target.value) }))
            }
            className="input-field"
          >
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
        </div>
        <button
          onClick={() => addMutation.mutate()}
          disabled={
            !newSlot.course_id || !newSlot.exam_date || addMutation.isPending
          }
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus size={14} />
          {addMutation.isPending ? "Adding..." : "Add Slot"}
        </button>
      </div>

      {/* Existing slots grouped by date */}
      <div className="space-y-3">
        {Object.keys(byDate)
          .sort()
          .map((date) => (
            <div key={date} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-cream-200/8 bg-cream-200/3">
                <span className="text-cream-200/80 text-sm font-semibold">
                  {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                </span>
              </div>
              <div className="divide-y divide-cream-200/6">
                {byDate[date].map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-cream-200/90 text-sm font-semibold mr-2">
                        {slot.course_code}
                      </span>
                      <span className="text-cream-200/45 text-xs">
                        {slot.course_title}
                      </span>
                      <div className="text-cream-200/35 text-xs mt-0.5">
                        {slot.start_time} – {slot.end_time}
                        {slot.venue && <span> · {slot.venue}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(slot.id)}
                      className="p-2 rounded-lg text-cream-200/20 hover:text-accent-coral hover:bg-accent-coral/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {Object.keys(byDate).length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-cream-200/30 text-sm">
              No exam slots yet. Add the first one above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
