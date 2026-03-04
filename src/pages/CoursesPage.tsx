// src/pages/CoursesPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Upload, ChevronDown, ChevronUp, Check, Loader2, FileText, Plus } from 'lucide-react';
import clsx from 'clsx';
import { coursesApi } from '../api/index';
import { useAuthStore } from '../store/authStore';
import type { Course, CoursePDF } from '../types';
import toast from 'react-hot-toast';

const COURSE_COLORS = [
  '#4a7fb5', '#5a8a6e', '#c9a84c', '#8a6eaf',
  '#d4604a', '#4aa8af', '#af8a4a', '#6e8a5a',
];

function CourseCard({ course, color, isAdmin }: { course: Course; color: string; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadWeek, setUploadWeek] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const qc = useQueryClient();

  const { data: pdfs, isLoading: pdfsLoading } = useQuery({
    queryKey: ['course-pdfs', course.id],
    queryFn: () => coursesApi.getPdfs(course.id).then(r => r.data),
    enabled: expanded,
  });

  async function handleUpload() {
    if (!selectedFile || !uploadWeek) return;
    setUploading(true);
    setUploadPct(0);
    try {
      await coursesApi.uploadPdf(course.id, uploadWeek, selectedFile, setUploadPct);
      toast.success('PDF uploaded — AI processing started');
      setSelectedFile(null);
      setUploadPct(0);
      qc.invalidateQueries({ queryKey: ['course-pdfs', course.id] });
      qc.invalidateQueries({ queryKey: ['courses'] });
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      layout
      className="card overflow-hidden"
      style={{ borderLeft: `2px solid ${color}30` }}
    >
      <button
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-cream-200/3 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}>
          <BookOpen size={17} style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-cream-200">{course.code}</span>
            <span className="text-cream-200/30 text-xs">·</span>
            <span className="text-cream-200/60 text-sm truncate">{course.title}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-cream-200/35 text-xs">{course.credit_units} credit units</span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">{course.pdf_count} PDFs</span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">{course.question_count} questions</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {course.weeks_uploaded.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {course.weeks_uploaded.slice(0, 6).map(w => (
                <div key={w} className="w-5 h-5 rounded-md bg-cream-200/10 flex items-center justify-center">
                  <span className="text-[9px] text-cream-200/50 font-mono">{w}</span>
                </div>
              ))}
              {course.weeks_uploaded.length > 6 && (
                <span className="text-cream-200/30 text-[10px]">+{course.weeks_uploaded.length - 6}</span>
              )}
            </div>
          )}
          {expanded ? <ChevronUp size={16} className="text-cream-200/40" /> : <ChevronDown size={16} className="text-cream-200/40" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-cream-200/8"
          >
            <div className="p-5 space-y-5">
              {/* Upload section (admin only) */}
              {isAdmin && (
                <div className="p-4 rounded-xl bg-cream-200/4 border border-cream-200/10">
                  <div className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    Upload PDF for Week
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="number"
                      value={uploadWeek}
                      min={1}
                      max={20}
                      onChange={e => setUploadWeek(Number(e.target.value))}
                      className="input-field w-20 text-center py-2"
                    />
                    <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cream-200/15 text-cream-200/60 hover:text-cream-200/80 hover:border-cream-200/25 cursor-pointer transition-colors text-sm">
                      <FileText size={14} />
                      {selectedFile ? selectedFile.name.slice(0, 20) + '...' : 'Choose PDF'}
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {selectedFile && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleUpload}
                        disabled={uploading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cream-200 text-indigo-600 font-semibold text-sm hover:bg-cream-100 transition-colors disabled:opacity-50"
                      >
                        {uploading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            {uploadPct}%
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            Upload
                          </>
                        )}
                      </motion.button>
                    )}
                  </div>
                  {uploading && (
                    <div className="mt-3 h-1.5 bg-cream-200/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-cream-200/60 rounded-full"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* PDF list */}
              <div>
                <div className="text-cream-200/40 text-xs font-semibold uppercase tracking-wider mb-3">
                  Uploaded PDFs ({pdfs?.length ?? 0})
                </div>
                {pdfsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-12 shimmer-bg rounded-xl" />)}
                  </div>
                ) : pdfs && pdfs.length > 0 ? (
                  <div className="space-y-2">
                    {pdfs.map(pdf => (
                      <PDFRow key={pdf.id} pdf={pdf} />
                    ))}
                  </div>
                ) : (
                  <p className="text-cream-200/25 text-sm">No PDFs uploaded yet.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PDFRow({ pdf }: { pdf: CoursePDF }) {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="rounded-xl border border-cream-200/8 p-3">
      <div className="flex items-center gap-3">
        <div className={clsx(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          pdf.is_processed ? 'bg-accent-sage/15' : 'bg-cream-200/8'
        )}>
          {pdf.is_processed
            ? <Check size={13} className="text-accent-sage" />
            : <Loader2 size={13} className="text-cream-200/30 animate-spin" />
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-cream-200/80 text-xs font-medium truncate">{pdf.original_name}</div>
          <div className="text-cream-200/35 text-[10px] mt-0.5">
            Week {pdf.week_number}
            {pdf.is_processed ? ' · Processed' : ' · Processing...'}
          </div>
        </div>
        {pdf.summary && (
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="text-cream-200/30 hover:text-cream-200/60 transition-colors text-xs"
          >
            {showSummary ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSummary && pdf.summary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-cream-200/8"
          >
            <p className="text-cream-200/55 text-xs leading-relaxed mb-2">{pdf.summary}</p>
            {pdf.key_points && pdf.key_points.length > 0 && (
              <div>
                <div className="text-cream-200/30 text-[10px] uppercase tracking-wider mb-1">Key Points</div>
                <ul className="space-y-1">
                  {pdf.key_points.slice(0, 4).map((kp, i) => (
                    <li key={i} className="text-cream-200/45 text-xs flex items-start gap-2">
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
    </div>
  );
}

export default function CoursesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: '', title: '', level: user?.level || '100L', semester: user?.semester || 1, credit_units: 3 });

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses', user?.level, user?.semester],
    queryFn: () => coursesApi.list(user?.level, user?.semester).then(r => r.data),
    enabled: !!user,
  });

  const addCourseMutation = useMutation({
    mutationFn: (data: typeof newCourse) => coursesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      setShowAddCourse(false);
      setNewCourse({ ...newCourse, code: '', title: '' });
      toast.success('Course added');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to add course'),
  });

  return (
    <div className="space-y-6 pb-12">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
            {user?.level} · Semester {user?.semester}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
            Courses
          </h1>
          <p className="text-cream-200/45 text-sm mt-1">
            {courses?.length ?? 0} courses · BSc. Software Engineering
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddCourse(!showAddCourse)}
            className="flex items-center gap-2 btn-ghost text-sm"
          >
            <Plus size={15} />
            Add Course
          </button>
        )}
      </motion.div>

      {/* Add course form */}
      <AnimatePresence>
        {showAddCourse && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5">
              <h3 className="text-cream-200/70 text-sm font-semibold mb-4">Add New Course</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <input
                  placeholder="Code (e.g. COS201)"
                  value={newCourse.code}
                  onChange={e => setNewCourse({ ...newCourse, code: e.target.value.toUpperCase() })}
                  className="input-field"
                />
                <input
                  placeholder="Course Title"
                  value={newCourse.title}
                  onChange={e => setNewCourse({ ...newCourse, title: e.target.value })}
                  className="input-field col-span-2 sm:col-span-1"
                />
                <select
                  value={newCourse.level}
                  onChange={e => setNewCourse({ ...newCourse, level: e.target.value })}
                  className="input-field"
                >
                  {['100L', '200L', '300L', '400L'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select
                  value={newCourse.semester}
                  onChange={e => setNewCourse({ ...newCourse, semester: Number(e.target.value) })}
                  className="input-field"
                >
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
                <input
                  type="number"
                  placeholder="Credit Units"
                  value={newCourse.credit_units}
                  onChange={e => setNewCourse({ ...newCourse, credit_units: Number(e.target.value) })}
                  className="input-field"
                  min={1}
                  max={6}
                />
              </div>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => addCourseMutation.mutate(newCourse)}
                  disabled={!newCourse.code || !newCourse.title || addCourseMutation.isPending}
                  className="btn-primary text-sm"
                >
                  {addCourseMutation.isPending ? 'Adding...' : 'Add Course'}
                </motion.button>
                <button onClick={() => setShowAddCourse(false)} className="btn-ghost text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Course list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="h-20 shimmer-bg rounded-2xl" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <div className="space-y-3">
          {courses.map((course, i) => (
            <CourseCard
              key={course.id}
              course={course}
              color={COURSE_COLORS[i % COURSE_COLORS.length]}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <BookOpen size={40} className="text-cream-200/15 mx-auto mb-3" />
          <h3 className="font-display text-xl text-cream-200 mb-2">No courses yet</h3>
          <p className="text-cream-200/35 text-sm">Add courses to get started.</p>
        </div>
      )}
    </div>
  );
}
