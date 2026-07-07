import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import Report from './pages/Report';

// Full-screen loading spinner shown while the auth context validates the stored token
const AuthLoading = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
      <p className="text-sm text-gray-500 font-medium">Restoring session…</p>
    </div>
  </div>
);

// Friendly 404 page for truly unknown routes
const NotFound = () => (
  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
    <div className="text-6xl font-black text-orange-500">404</div>
    <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
    <p className="text-sm text-gray-500 text-center max-w-xs">
      The page you're looking for doesn't exist or has been moved.
    </p>
    <a
      href="/dashboard"
      className="mt-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition"
    >
      Back to Dashboard
    </a>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  // Don't redirect until we've finished checking the token — prevents flashing /login on refresh
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

// Redirect logged-in users away from login/signup pages
const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-white text-gray-900 font-sans">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <Signup />
                </GuestRoute>
              }
            />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <Login />
                </GuestRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/room/:roomId"
              element={
                <ProtectedRoute>
                  <Room />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report/:roomId"
              element={
                <ProtectedRoute>
                  <Report />
                </ProtectedRoute>
              }
            />

            {/* Catch-all: renders a 404 instead of a blank page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
