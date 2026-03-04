import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Calendar, LayoutGrid, Settings, Plus, Trash2,
  Edit2, Save, X, Shield, GraduationCap
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import { adminApi, coursesApi } from '../api/index';
import { useAuthStore } from '../store/authStore';
import type { ExamSlot, User as UserType } from '../types';
import toast from 'react-hot-toast';

type Tab = 'exam' | 'cycle' | 'calendar' | 'users';

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('exam');
  const isSuperAdmin = user?.role === 'superadmin';

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'exam', label: 'Exam Timetable', icon: Calendar },
    { id: 'cycle', label: 'Study Cycle', icon: LayoutGrid },
    { id: 'calendar', label: 'Academic Calendar', icon: Settings },
    ...(isSuperAdmin ? [{ id: 'users' as Tab, label: 'Users', icon: Users }] : []),
  ];

  return (
    <div className="space-y-6 pb-12">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
          Administration
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">Admin Panel</h1>
        <p className="text-cream-200/45 text-sm mt-1">
          {isSuperAdmin ? 'SuperAdmin' : 'Admin'} — Full system control
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-indigo-900/80 rounded-2xl border border-cream-200/8 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap',
              tab === id
                ? 'bg-cream-200/10 text-cream-200 border border-cream-200/10'
                : 'text-cream-200/40 hover:text-cream-200/70'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'exam' && <ExamTimetableAdmin />}
          {tab === 'cycle' && <StudyCycleAdmin />}
          {tab === 'calendar' && <CalendarAdmin />}
          {tab === 'users' && isSuperAdmin && <UsersAdmin />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── Exam Timetable ─────────────────────────────────────────────────────── */
function ExamTimetableAdmin() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [newSlot, setNewSlot] = useState({
    course_id: 0,
    exam_date: '',
    start_time: '09:00',
    end_time: '11:00',
    venue: '',
    level: user?.level || '100L',
    semester: user?.semester || 1,
  });

  const { data: slots } = useQuery({
    queryKey: ['exam-timetable', user?.level, user?.semester],
    queryFn: () => adminApi.getExamTimetable(user?.level, user?.semester).then(r => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', user?.level, user?.semester],
    queryFn: () => coursesApi.list(user?.level, user?.semester).then(r => r.data),
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.createExamSlot(newSlot as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exam-timetable'] });
      toast.success('Exam slot added');
      setNewSlot(s => ({ ...s, course_id: 0, exam_date: '', venue: '' }));
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to add slot'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteExamSlot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exam-timetable'] });
      toast.success('Slot removed');
    },
  });

  const byDate = slots?.reduce<Record<string, ExamSlot[]>>((acc, s) => {
    if (!acc[s.exam_date]) acc[s.exam_date] = [];
    acc[s.exam_date].push(s);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="card p-5">
        <h3 className="text-cream-200/70 text-sm font-semibold mb-4">Add Exam Slot</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <select
            value={newSlot.course_id}
            onChange={e => setNewSlot(s => ({ ...s, course_id: Number(e.target.value) }))}
            className="input-field col-span-2 sm:col-span-1"
          >
            <option value={0}>Select course...</option>
            {courses?.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
            ))}
          </select>
          <input
            type="date"
            value={newSlot.exam_date}
            onChange={e => setNewSlot(s => ({ ...s, exam_date: e.target.value }))}
            className="input-field"
          />
          <input
            type="time"
            value={newSlot.start_time}
            onChange={e => setNewSlot(s => ({ ...s, start_time: e.target.value }))}
            className="input-field"
          />
          <input
            type="time"
            value={newSlot.end_time}
            onChange={e => setNewSlot(s => ({ ...s, end_time: e.target.value }))}
            className="input-field"
          />
          <input
            placeholder="Venue (optional)"
            value={newSlot.venue}
            onChange={e => setNewSlot(s => ({ ...s, venue: e.target.value }))}
            className="input-field col-span-2 sm:col-span-1"
          />
          <select
            value={newSlot.level}
            onChange={e => setNewSlot(s => ({ ...s, level: e.target.value }))}
            className="input-field"
          >
            {['100L', '200L', '300L', '400L'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={newSlot.semester}
            onChange={e => setNewSlot(s => ({ ...s, semester: Number(e.target.value) }))}
            className="input-field"
          >
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
        </div>
        <button
          onClick={() => addMutation.mutate()}
          disabled={!newSlot.course_id || !newSlot.exam_date || addMutation.isPending}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus size={14} />
          {addMutation.isPending ? 'Adding...' : 'Add Slot'}
        </button>
      </div>

      {/* Existing slots grouped by date */}
      <div className="space-y-3">
        {Object.keys(byDate).sort().map(date => (
          <div key={date} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-cream-200/8 bg-cream-200/3">
              <span className="text-cream-200/80 text-sm font-semibold">
                {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
              </span>
            </div>
            <div className="divide-y divide-cream-200/6">
              {byDate[date].map(slot => (
                <div key={slot.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-cream-200/90 text-sm font-semibold mr-2">{slot.course_code}</span>
                    <span className="text-cream-200/45 text-xs">{slot.course_title}</span>
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
            <p className="text-cream-200/30 text-sm">No exam slots yet. Add the first one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Study Cycle Admin ──────────────────────────────────────────────────── */
function StudyCycleAdmin() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editDays, setEditDays] = useState<{ day_number: number; course_ids: number[] }[]>([]);

  const { data: cycle } = useQuery({
    queryKey: ['study-cycle', user?.level, user?.semester],
    queryFn: () => adminApi.getStudyCycle(user?.level, user?.semester).then(r => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', user?.level, user?.semester],
    queryFn: () => coursesApi.list(user?.level, user?.semester).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateStudyCycle(user?.level!, user?.semester!, editDays),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-cycle'] });
      setEditing(false);
      toast.success('Study cycle updated');
    },
    onError: () => toast.error('Failed to save study cycle'),
  });

  function startEdit() {
    setEditDays(
      cycle?.map(d => ({
        day_number: d.day_number,
        course_ids: d.courses.map(c => c.id),
      })) ||
        [1, 2, 3, 4, 5].map(n => ({ day_number: n, course_ids: [] }))
    );
    setEditing(true);
  }

  function toggleCourse(dayNum: number, courseId: number) {
    setEditDays(prev =>
      prev.map(d => {
        if (d.day_number !== dayNum) return d;
        const has = d.course_ids.includes(courseId);
        return {
          ...d,
          course_ids: has
            ? d.course_ids.filter(id => id !== courseId)
            : [...d.course_ids, courseId],
        };
      })
    );
  }

  const COURSE_COLORS = [
    '#4a7fb5','#5a8a6e','#c9a84c','#8a6eaf',
    '#d4604a','#4aa8af','#af8a4a','#6e8a5a',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-cream-200/70 text-sm font-semibold">5-Day Study Cycle</h3>
        {!editing ? (
          <button onClick={startEdit} className="flex items-center gap-2 btn-ghost text-sm">
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
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="flex items-center gap-2 btn-ghost text-sm">
              <X size={13} /> Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {editDays.map(day => (
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
                          ? { background: `${color}20`, borderColor: `${color}40`, color }
                          : { borderColor: 'rgba(240,231,213,0.1)', color: 'rgba(240,231,213,0.35)' }
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
            cycle.map(day => (
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
              <p className="text-cream-200/30 text-sm">No study cycle configured yet.</p>
              <button onClick={startEdit} className="mt-3 btn-ghost text-sm inline-flex items-center gap-2">
                <Plus size={13} /> Set Up Cycle
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Calendar Admin ─────────────────────────────────────────────────────── */
function CalendarAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    level: '100L',
    semester: 1,
    school_resume_date: '',
    lectures_start_date: '',
    semester_end_date: '',
  });

  const { data: calendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => adminApi.getCalendars().then(r => r.data),
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.createCalendar(form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendars'] });
      toast.success('Calendar entry added');
      setForm(f => ({ ...f, school_resume_date: '', lectures_start_date: '', semester_end_date: '' }));
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="text-cream-200/70 text-sm font-semibold mb-4">Add Academic Calendar Entry</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <select
            value={form.level}
            onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
            className="input-field"
          >
            {['100L', '200L', '300L', '400L'].map(l => <option key={l}>{l}</option>)}
          </select>
          <select
            value={form.semester}
            onChange={e => setForm(f => ({ ...f, semester: Number(e.target.value) }))}
            className="input-field"
          >
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">School Resumes</label>
            <input
              type="date"
              value={form.school_resume_date}
              onChange={e => setForm(f => ({ ...f, school_resume_date: e.target.value }))}
              className="input-field"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">Lectures Start</label>
            <input
              type="date"
              value={form.lectures_start_date}
              onChange={e => setForm(f => ({ ...f, lectures_start_date: e.target.value }))}
              className="input-field"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-cream-200/40 text-xs mb-1">Semester End (optional)</label>
            <input
              type="date"
              value={form.semester_end_date}
              onChange={e => setForm(f => ({ ...f, semester_end_date: e.target.value }))}
              className="input-field"
            />
          </div>
        </div>
        <button
          onClick={() => addMutation.mutate()}
          disabled={!form.school_resume_date || !form.lectures_start_date || addMutation.isPending}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus size={14} />
          {addMutation.isPending ? 'Saving...' : 'Add Calendar'}
        </button>
      </div>

      <div className="space-y-3">
        {calendars?.map(cal => (
          <div key={cal.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="badge border border-cream-200/15 text-cream-200/60 text-xs">
                  {cal.level}
                </span>
                <span className="text-cream-200/45 text-xs">Semester {cal.semester}</span>
                {cal.is_active && (
                  <span className="badge bg-accent-sage/15 border border-accent-sage/25 text-accent-sage text-[10px]">
                    Active
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Resumed', val: cal.school_resume_date },
                { label: 'Lectures', val: cal.lectures_start_date },
                { label: 'Ends', val: cal.semester_end_date },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-cream-200/70 text-xs font-medium">
                    {val ? format(parseISO(val), 'MMM d, yyyy') : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {(!calendars || calendars.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-cream-200/30 text-sm">No calendar entries yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Users Admin (SuperAdmin only) ──────────────────────────────────────── */
function UsersAdmin() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '', full_name: '', role: 'student', level: '100L', semester: 1,
  });
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState('student');

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createUser(newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User created');
      setShowCreate(false);
      setNewUser({ email: '', full_name: '', role: 'student', level: '100L', semester: 1 });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create user'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingRole(null);
      toast.success('Role updated');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => adminApi.deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User deactivated');
    },
  });

  const ROLE_BADGE: Record<string, string> = {
    superadmin: 'bg-accent-gold/15 text-accent-gold border-accent-gold/25',
    admin:      'bg-accent-sky/15 text-accent-sky border-accent-sky/25',
    student:    'bg-cream-200/8 text-cream-200/50 border-cream-200/10',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-cream-200/70 text-sm font-semibold">
          Users ({users?.length ?? 0})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 btn-ghost text-sm"
        >
          <Plus size={13} /> Add User
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5 mb-3">
              <h4 className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider mb-3">
                Create New User
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <input
                  placeholder="Email address"
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                  className="input-field col-span-2 sm:col-span-1"
                />
                <input
                  placeholder="Full name (optional)"
                  value={newUser.full_name}
                  onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
                  className="input-field"
                />
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                  className="input-field"
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">SuperAdmin</option>
                </select>
                <select
                  value={newUser.level}
                  onChange={e => setNewUser(u => ({ ...u, level: e.target.value }))}
                  className="input-field"
                >
                  {['100L', '200L', '300L', '400L'].map(l => <option key={l}>{l}</option>)}
                </select>
                <select
                  value={newUser.semester}
                  onChange={e => setNewUser(u => ({ ...u, semester: Number(e.target.value) }))}
                  className="input-field"
                >
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!newUser.email || createMutation.isPending}
                  className="btn-primary text-sm"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User list */}
      <div className="card overflow-hidden divide-y divide-cream-200/6">
        {users?.map(u => (
          <div key={u.id} className="flex items-center gap-4 px-4 py-3">
            <div className="w-9 h-9 rounded-xl bg-cream-200/8 flex items-center justify-center shrink-0">
              {u.role === 'superadmin'
                ? <Shield size={15} className="text-accent-gold/70" />
                : <GraduationCap size={15} className="text-cream-200/40" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-cream-200/85 text-sm font-medium truncate">
                {u.full_name || u.email}
              </div>
              <div className="text-cream-200/35 text-xs mt-0.5 truncate">{u.email}</div>
              <div className="text-cream-200/25 text-[10px]">
                {u.level} · Sem {u.semester}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editingRole === u.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="input-field py-1.5 text-xs"
                  >
                    <option value="student">Student</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">SuperAdmin</option>
                  </select>
                  <button
                    onClick={() => roleMutation.mutate({ id: u.id, role: selectedRole })}
                    className="p-1.5 rounded-lg bg-cream-200/10 text-cream-200/70 hover:bg-cream-200/20"
                  >
                    <Save size={12} />
                  </button>
                  <button
                    onClick={() => setEditingRole(null)}
                    className="p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span className={clsx('badge border text-[10px]', ROLE_BADGE[u.role] || ROLE_BADGE.student)}>
                    {u.role}
                  </span>
                  <button
                    onClick={() => { setEditingRole(u.id); setSelectedRole(u.role); }}
                    className="p-1.5 rounded-lg text-cream-200/20 hover:text-cream-200/60 hover:bg-cream-200/8 transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  {u.is_active && (
                    <button
                      onClick={() => deactivateMutation.mutate(u.id)}
                      className="p-1.5 rounded-lg text-cream-200/20 hover:text-accent-coral hover:bg-accent-coral/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {(!users || users.length === 0) && (
          <div className="p-8 text-center text-cream-200/30 text-sm">No users found.</div>
        )}
      </div>
    </div>
  );
}
