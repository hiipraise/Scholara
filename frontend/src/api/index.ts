// src/api/index.ts
import apiClient from "./client";
import type {
  DailyFeed,
  AnswerResult,
  FeedProgress,
  Course,
  CoursePDF,
  ExamSlot,
  StudyCycleDay,
  AcademicCalendar,
  User,
  DailyHistoryItem,
  FeedInsights,
  QuestionFlag,
  CourseProfile,
  CourseTopic,
  CourseFormula,
  CourseDeepDiveNote,
  PdfJobSummary,
  AuditLogEntry,
} from "../types";

// Feed
export const feedApi = {
  getToday: () => apiClient.get<DailyFeed>("/feed/today"),
  refreshToday: () => apiClient.post<DailyFeed>("/feed/refresh"),
  submitAnswer: (question_id: string, selected_answer: string) =>
    apiClient.post<AnswerResult>("/feed/answer", {
      question_id,
      selected_answer,
    }),
  getProgress: () => apiClient.get<FeedProgress>("/feed/progress"),
  markWeekDone: (course_id: string, week_number: number, is_done: boolean) =>
    apiClient.post("/feed/mark-week-done", { course_id, week_number, is_done }),
  getStats: () =>
    apiClient.get<{
      total_attempted: number;
      total_correct: number;
      accuracy: number;
      total_incorrect: number;
    }>("/feed/stats"),

  getHistory: (days = 14) =>
    apiClient.get<{ days: number; history: DailyHistoryItem[] }>(
      `/feed/history`,
      { params: { days } },
    ),
  getInsights: () => apiClient.get<FeedInsights>("/feed/insights"),
  getPractice: (data: { course_ids: string[]; count: number }) =>
    apiClient.post<
      DailyFeed & {
        is_custom: boolean;
        requested_count: number;
        selected_courses: string[];
      }
    >("/feed/practice", data),
};

// Courses
export const coursesApi = {
  list: (level?: string, semester?: number) =>
    apiClient.get<Course[]>("/courses/", { params: { level, semester } }),
  create: (data: {
    code: string;
    title: string;
    level: string;
    semester: number;
    credit_units?: number;
  }) => apiClient.post("/courses/", data),
  deleteCourse: (courseId: string) => apiClient.delete(`/courses/${courseId}`),
  getPdfs: (courseId: string) =>
    apiClient.get<CoursePDF[]>(`/courses/${courseId}/pdfs`),
  uploadPdf: (
    courseId: string,
    weekNumber: number,
    file: File,
    onProgress?: (pct: number) => void,
  ) => {
    const fd = new FormData();
    fd.append("week_number", String(weekNumber));
    fd.append("file", file);
    return apiClient.post(`/courses/${courseId}/upload-pdf`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total && onProgress)
          onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },
  // ── new ──────────────────────────────────────────────────────────────────
  deletePdf: (courseId: string, pdfId: string) =>
    apiClient.delete(`/courses/${courseId}/pdfs/${pdfId}`),
  updatePdfWeek: (courseId: string, pdfId: string, weekNumber: number) =>
    apiClient.patch(`/courses/${courseId}/pdfs/${pdfId}/week`, {
      week_number: weekNumber,
    }),
};

// Admin
export const adminApi = {
  getExamTimetable: (level = "100L", semester = 1, includePast = false) =>
    apiClient.get<ExamSlot[]>("/admin/exam-timetable", {
      params: { level, semester, include_past: includePast },
    }),
  createExamSlot: (data: unknown) =>
    apiClient.post("/admin/exam-timetable", data),
  deleteExamSlot: (id: string) =>
    apiClient.delete(`/admin/exam-timetable/${id}`),

  getStudyCycle: (level = "100L", semester = 1) =>
    apiClient.get<StudyCycleDay[]>("/admin/study-cycle", {
      params: { level, semester },
    }),
  getStudyCycleHistory: () =>
    apiClient.get<{ level: string; semester: number; days: StudyCycleDay[] }[]>(
      "/admin/study-cycle/history",
    ),
  updateStudyCycle: (level: string, semester: number, days: unknown[]) =>
    apiClient.put("/admin/study-cycle", { level, semester, days }),

  getCalendars: () => apiClient.get<AcademicCalendar[]>("/admin/calendar"),
  createCalendar: (data: unknown) => apiClient.post("/admin/calendar", data),
  updateCalendar: (id: string, data: unknown) =>
    apiClient.put(`/admin/calendar/${id}`, data),
  deleteCalendar: (id: string) => apiClient.delete(`/admin/calendar/${id}`),

  listUsers: () => apiClient.get<User[]>("/admin/users"),
  createUser: (data: unknown) => apiClient.post("/admin/users", data),
  updateUserRole: (userId: string, role: string) =>
    apiClient.put(`/admin/users/${userId}/role`, { role }),
  updateUserLevel: (userId: string, level: string, semester: number) =>
    apiClient.put(`/admin/users/${userId}/level`, null, {
      params: { level, semester },
    }),
  deactivateUser: (userId: string) =>
    apiClient.delete(`/admin/users/${userId}`),
  resetPassword: (userId: string) =>
    apiClient.post<{ message: string; user_id: string; new_password: string }>(
      `/admin/users/${userId}/reset-password`,
    ),

  getQuestionFlags: (status: "open" | "resolved" | "all" = "open") =>
    apiClient.get<QuestionFlag[]>("/admin/question-flags", {
      params: { status },
    }),
  resolveQuestionFlags: (questionId: string, deactivate_question = false) =>
    apiClient.patch(`/admin/question-flags/${questionId}/resolve`, {
      deactivate_question,
    }),
  resolveAllQuestionFlags: (deactivate_question = true) =>
    apiClient.patch(`/admin/question-flags/resolve-all`, {
      deactivate_question,
    }),

  getJobs: () => apiClient.get<PdfJobSummary>("/admin/jobs"),
  getAuditLogs: () => apiClient.get<AuditLogEntry[]>("/admin/audit-logs"),
};

// Users
export const usersApi = {
  getProfile: () => apiClient.get<User>("/users/me"),
  updateProfile: (data: {
    full_name?: string;
    level?: string;
    semester?: number;
  }) => apiClient.put("/users/me", data),
};

// Questions
export const questionsApi = {
  flag: (questionId: string, reason?: string) =>
    apiClient.post(`/questions/${questionId}/flag`, { reason }),
};

export const intelligenceApi = {
  getProfile: (courseId: string) =>
    apiClient.get<CourseProfile>(`/intelligence/courses/${courseId}/profile`),
  getTopics: (courseId: string) =>
    apiClient.get<CourseTopic[]>(`/intelligence/courses/${courseId}/topics`),
  getFormulas: (courseId: string) =>
    apiClient.get<CourseFormula[]>(
      `/intelligence/courses/${courseId}/formulas`,
    ),
  getDeepDive: (courseId: string) =>
    apiClient.get<CourseDeepDiveNote[]>(
      `/intelligence/courses/${courseId}/deep-dive`,
    ),
};
