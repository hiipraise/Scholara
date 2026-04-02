// src/App.tsx
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';

import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import CoursesPage from './pages/CoursesPage';
import StudyPage from './pages/StudyPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import Layout from './components/layout/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
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

  useEffect(() => {
    refreshUser();
  }, []);

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
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
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