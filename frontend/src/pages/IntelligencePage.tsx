import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Sigma, BookOpenText } from 'lucide-react';
import { coursesApi, intelligenceApi } from '../api';
import { useAuthStore } from '../store/authStore';

export default function IntelligencePage() {
  const { user } = useAuthStore();
  const [courseId, setCourseId] = useState<string>('');
  const [tab, setTab] = useState<'current' | 'past'>('current');

  const { data: courses } = useQuery({
    queryKey: ['courses', user?.level, user?.semester, 'intelligence'],
    queryFn: () => coursesApi.list().then(r => r.data),
  });

  const rank = (level: string, semester: number) => (Number(level.replace('L', '')) || 0) * 10 + semester;
  const currentRank = user ? rank(user.level, user.semester) : 0;
  const currentCourses = (courses || []).filter(c => c.level === user?.level && c.semester === user?.semester);
  const pastCourses = (courses || []).filter(c => rank(c.level, c.semester) < currentRank);
  const scopedCourses = tab === 'current' ? currentCourses : pastCourses;

  const selectedCourseId = courseId || scopedCourses?.[0]?.id || '';
  const selectedCourse = useMemo(
    () => scopedCourses?.find(c => c.id === selectedCourseId),
    [scopedCourses, selectedCourseId],
  );

  const { data: profile } = useQuery({
    queryKey: ['intelligence', 'profile', selectedCourseId],
    queryFn: () => intelligenceApi.getProfile(selectedCourseId).then(r => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const { data: formulas } = useQuery({
    queryKey: ['intelligence', 'formulas', selectedCourseId],
    queryFn: () => intelligenceApi.getFormulas(selectedCourseId).then(r => r.data),
    enabled: Boolean(selectedCourseId),
  });

  const { data: notes } = useQuery({
    queryKey: ['intelligence', 'deep-dive', selectedCourseId],
    queryFn: () => intelligenceApi.getDeepDive(selectedCourseId).then(r => r.data),
    enabled: Boolean(selectedCourseId),
  });

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">Adaptive Intelligence</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">Course Intelligence</h1>
        <p className="text-cream-200/45 text-sm mt-1">Profiles, formulas, and deep-dive notes built dynamically from your course materials.</p>
      </div>

      <div className="card p-4">
        <div className="inline-flex rounded-xl border border-cream-200/10 p-1 mb-3">
          <button onClick={() => setTab('current')} className={tab === 'current' ? 'px-3 py-1.5 text-xs rounded-lg bg-cream-200/12 text-cream-200' : 'px-3 py-1.5 text-xs rounded-lg text-cream-200/40'}>
            Current ({currentCourses.length})
          </button>
          <button onClick={() => setTab('past')} className={tab === 'past' ? 'px-3 py-1.5 text-xs rounded-lg bg-cream-200/12 text-cream-200' : 'px-3 py-1.5 text-xs rounded-lg text-cream-200/40'}>
            Past ({pastCourses.length})
          </button>
        </div>
        <label className="text-cream-200/45 text-xs uppercase tracking-wider">Select Course</label>
        <select
          className="input-field mt-2"
          value={selectedCourseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          {(scopedCourses || []).map(c => (
            <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
          ))}
        </select>
      </div>

      {selectedCourse ? (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">Adaptive Profile</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">Formula Heavy</div>
                <div className="text-cream-200/85 mt-1">{profile?.profile?.is_formula_heavy ? 'Yes' : 'No'}</div>
              </div>
              <div className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-xs uppercase tracking-wider">Explanation Mode</div>
                <div className="text-cream-200/85 mt-1">{profile?.profile?.explanation_mode || 'exam_style'}</div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sigma size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">Formulas</h3>
            </div>
            {formulas && formulas.length > 0 ? (
              <div className="space-y-2">
                {formulas.map(f => (
                  <div key={f.id} className="rounded-xl border border-cream-200/8 p-3">
                    <div className="text-cream-200/85 text-sm font-semibold">{f.formula_name}</div>
                    <div className="text-cream-200/45 text-xs mt-1">{f.expression}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-200/35 text-sm">No formulas extracted yet. Upload more PDFs for this course.</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpenText size={16} className="text-cream-200/60" />
              <h3 className="text-cream-200/80 text-sm font-semibold">Deep Dive Notes</h3>
            </div>
            {notes && notes.length > 0 ? (
              <div className="space-y-3">
                {notes.map(n => (
                  <div key={n.id} className="rounded-xl border border-cream-200/8 p-3">
                    <div className="text-cream-200/85 text-sm font-semibold">{n.title}</div>
                    <p className="text-cream-200/50 text-sm mt-1">{n.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-200/35 text-sm">No deep-dive notes yet. They are generated from uploaded course content.</p>
            )}
          </div>
        </>
      ) : (
        <div className="card p-8 text-center text-cream-200/45">
          {tab === 'current' ? 'No course available for current term yet.' : 'No past course intelligence yet.'}
        </div>
      )}
    </div>
  );
}
