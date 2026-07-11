import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { adminApi } from "../../api/index";
import toast from "react-hot-toast";

export default function CalendarAdmin() {
  const qc = useQueryClient();
  const emptyDates = {
    school_resume_date: "",
    lectures_start_date: "",
    semester_end_date: "",
  };
  const [form, setForm] = useState({
    level: "100L",
    semester: 1,
    ...emptyDates,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    ...emptyDates,
  });

  const { data: calendars } = useQuery({
    queryKey: ["calendars"],
    queryFn: () => adminApi.getCalendars().then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.createCalendar(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendars"] });
      toast.success("Calendar entry added");
      setForm((f) => ({ ...f, ...emptyDates }));
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editForm }) =>
      adminApi.updateCalendar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendars"] });
      toast.success("Calendar entry updated");
      setEditingId(null);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCalendar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendars"] });
      toast.success("Calendar entry deleted");
      setEditingId(null);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to delete"),
  });

  const beginEdit = (cal: {
    id: string;
    school_resume_date: string;
    lectures_start_date: string;
    semester_end_date: string | null;
  }) => {
    setEditingId(cal.id);
    setEditForm({
      school_resume_date: cal.school_resume_date || "",
      lectures_start_date: cal.lectures_start_date || "",
      semester_end_date: cal.semester_end_date || "",
    });
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="text-cream-200/70 text-sm font-semibold mb-4">
          Add Academic Calendar Entry
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
            className="input-field"
          >
            {["100L", "200L", "300L", "400L"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select
            value={form.semester}
            onChange={(e) =>
              setForm((f) => ({ ...f, semester: Number(e.target.value) }))
            }
            className="input-field"
          >
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">
              School Resumes
            </label>
            <input
              type="date"
              value={form.school_resume_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, school_resume_date: e.target.value }))
              }
              className="input-field"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">
              Lectures Start
            </label>
            <input
              type="date"
              value={form.lectures_start_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, lectures_start_date: e.target.value }))
              }
              className="input-field"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">
              Semester End (optional)
            </label>
            <input
              type="date"
              value={form.semester_end_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, semester_end_date: e.target.value }))
              }
              className="input-field"
            />
          </div>
        </div>
        <button
          onClick={() => addMutation.mutate()}
          disabled={
            !form.school_resume_date ||
            !form.lectures_start_date ||
            addMutation.isPending
          }
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus size={14} />
          {addMutation.isPending ? "Saving..." : "Add Calendar"}
        </button>
      </div>

      <div className="space-y-3">
        {calendars?.map((cal) => (
          <div key={cal.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="badge border border-cream-200/15 text-cream-200/60 text-xs">
                  {cal.level}
                </span>
                <span className="text-cream-200/45 text-xs">
                  Semester {cal.semester}
                </span>
                {cal.is_active && (
                  <span className="badge bg-accent-sage/15 border border-accent-sage/25 text-accent-sage text-[10px]">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingId === cal.id ? (
                  <>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-ghost text-xs px-2 py-1 inline-flex items-center gap-1"
                    >
                      <X size={12} /> Cancel
                    </button>
                    <button
                      onClick={() =>
                        updateMutation.mutate({ id: cal.id, data: editForm })
                      }
                      disabled={
                        !editForm.school_resume_date ||
                        !editForm.lectures_start_date ||
                        updateMutation.isPending
                      }
                      className="btn-primary text-xs px-2 py-1 inline-flex items-center gap-1"
                    >
                      <Save size={12} />
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => beginEdit(cal)}
                      className="btn-ghost text-xs px-2 py-1 inline-flex items-center gap-1"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(cal.id)}
                      disabled={deleteMutation.isPending}
                      className="btn-ghost text-xs px-2 py-1 inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 size={12} />
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {editingId === cal.id ? (
                <>
                  <div>
                    <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-1">
                      Resumed
                    </div>
                    <input
                      type="date"
                      value={editForm.school_resume_date}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          school_resume_date: e.target.value,
                        }))
                      }
                      className="input-field text-xs"
                    />
                  </div>
                  <div>
                    <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-1">
                      Lectures
                    </div>
                    <input
                      type="date"
                      value={editForm.lectures_start_date}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          lectures_start_date: e.target.value,
                        }))
                      }
                      className="input-field text-xs"
                    />
                  </div>
                  <div>
                    <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-1">
                      Ends
                    </div>
                    <input
                      type="date"
                      value={editForm.semester_end_date}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          semester_end_date: e.target.value,
                        }))
                      }
                      className="input-field text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  {[
                    { label: "Resumed", val: cal.school_resume_date },
                    { label: "Lectures", val: cal.lectures_start_date },
                    { label: "Ends", val: cal.semester_end_date },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-0.5">
                        {label}
                      </div>
                      <div className="text-cream-200/70 text-xs font-medium">
                        {val ? format(parseISO(val), "MMM d, yyyy") : "—"}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
        {(!calendars || calendars.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-cream-200/30 text-sm">
              No calendar entries yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
