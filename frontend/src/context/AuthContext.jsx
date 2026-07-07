import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const AuthContext = createContext();

let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
if (API_BASE_URL && !API_BASE_URL.endsWith('/api') && !API_BASE_URL.endsWith('/api/')) {
  API_BASE_URL = `${API_BASE_URL.replace(/\/$/, '')}/api`;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // loading stays true until we've validated the stored token (or found none)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Validate the stored token against the backend and fetch fresh user data
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Token is invalid or expired — clear stale storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch {
        // Network error: restore from localStorage so user stays logged in
        // when they're offline; the next API call will catch a real auth failure
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            localStorage.removeItem('user');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
