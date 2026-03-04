// src/api/index.ts
import apiClient from './client';
import type {
  DailyFeed, AnswerResult, FeedProgress,
  Course, CoursePDF, ExamSlot, StudyCycleDay,
  AcademicCalendar, User,
} from '../types';

// Feed
export const feedApi = {
  getToday: () => apiClient.get<DailyFeed>('/feed/today'),
  submitAnswer: (question_id: string, selected_answer: string) =>
    apiClient.post<AnswerResult>('/feed/answer', { question_id, selected_answer }),
  getProgress: () => apiClient.get<FeedProgress>('/feed/progress'),
  markWeekDone: (course_id: string, week_number: number, is_done: boolean) =>
    apiClient.post('/feed/mark-week-done', { course_id, week_number, is_done }),
  getStats: () =>
    apiClient.get<{ total_attempted: number; total_correct: number; accuracy: number; total_incorrect: number }>('/feed/stats'),
};

// Courses
export const coursesApi = {
  list: (level?: string, semester?: number) =>
    apiClient.get<Course[]>('/courses/', { params: { level, semester } }),
  create: (data: { code: string; title: string; level: string; semester: number; credit_units?: number }) =>
    apiClient.post('/courses/', data),
  getPdfs: (courseId: string) =>
    apiClient.get<CoursePDF[]>(`/courses/${courseId}/pdfs`),
  uploadPdf: (courseId: string, weekNumber: number, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('week_number', String(weekNumber));
    fd.append('file', file);
    return apiClient.post(`/courses/${courseId}/upload-pdf`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => { if (e.total && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); },
    });
  },
};

// Admin
export const adminApi = {
  getExamTimetable: (level = '100L', semester = 1) =>
    apiClient.get<ExamSlot[]>('/admin/exam-timetable', { params: { level, semester } }),
  createExamSlot: (data: unknown) =>
    apiClient.post('/admin/exam-timetable', data),
  deleteExamSlot: (id: string) =>
    apiClient.delete(`/admin/exam-timetable/${id}`),

  getStudyCycle: (level = '100L', semester = 1) =>
    apiClient.get<StudyCycleDay[]>('/admin/study-cycle', { params: { level, semester } }),
  updateStudyCycle: (level: string, semester: number, days: unknown[]) =>
    apiClient.put('/admin/study-cycle', { level, semester, days }),

  getCalendars: () =>
    apiClient.get<AcademicCalendar[]>('/admin/calendar'),
  createCalendar: (data: unknown) =>
    apiClient.post('/admin/calendar', data),

  listUsers: () => apiClient.get<User[]>('/admin/users'),
  createUser: (data: unknown) => apiClient.post('/admin/users', data),
  updateUserRole: (userId: string, role: string) =>
    apiClient.put(`/admin/users/${userId}/role`, { role }),
  updateUserLevel: (userId: string, level: string, semester: number) =>
    apiClient.put(`/admin/users/${userId}/level`, null, { params: { level, semester } }),
  deactivateUser: (userId: string) =>
    apiClient.delete(`/admin/users/${userId}`),
};

// Users
export const usersApi = {
  getProfile: () => apiClient.get<User>('/users/me'),
  updateProfile: (data: { full_name?: string }) => apiClient.put('/users/me', data),
};
