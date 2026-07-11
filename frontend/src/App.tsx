// src/App.tsx
import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { setOnUnauthorized } from './api/client';

import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import CoursesPage from './pages/CoursesPage';
import StudyPage from './pages/StudyPage';
import IntelligencePage from './pages/IntelligencePage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import ForcePasswordChange from './pages/ForcePasswordChange';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (user?.must_change_password && window.location.pathname !== "/force-password-change") {
    return <Navigate to="/force-password-change" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { refreshUser, isHydrated } = useAuthStore();

  // Register 401→forceLogout bridge once (synchronous — no API call)
  useEffect(() => {
    setOnUnauthorized(() => {
      // Only show the toast if the user was actively logged in.
      // Silent auth checks on page load with stale tokens should not scare the user.
      if (useAuthStore.getState().isAuthenticated) {
        toast.error("Session expired. Please sign in again.", { duration: 4000 });
      }
      useAuthStore.getState().forceLogout();
    });
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  // 🔥 Auth hydration splash screen
  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#212842]">
        <img
          src="/favicon.svg"
          alt="Scholara"
          className="w-20 h-20 animate-pulse"
        />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<div className="p-6 text-cream-200/70">Loading view…</div>}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/force-password-change"
            element={
              <ProtectedRoute>
                <ForcePasswordChange />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="study" element={<StudyPage />} />
            <Route path="intelligence" element={<IntelligencePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a2136',
            color: '#F0E7D5',
            border: '1px solid rgba(240, 231, 213, 0.1)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#5a8a6e', secondary: '#F0E7D5' },
          },
          error: {
            iconTheme: { primary: '#d4604a', secondary: '#F0E7D5' },
          },
        }}
      />
    </QueryClientProvider>
  );
}