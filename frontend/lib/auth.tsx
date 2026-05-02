'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { api } from './api';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  institution: string | null;
  website_url: string | null;
  is_global_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  isAuthed: boolean;
  loading: boolean;
  user: UserProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthed(false);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get<UserProfile>('/api/me');
    setUser(res.data);
    setIsAuthed(true);
  }, []);

  useEffect(() => {
    const init = async () => {
      if (typeof window === 'undefined') return;
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await refreshUser();
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [clearAuth, refreshUser]);

  const persistTokens = async (tokens: { access_token: string; refresh_token: string }) => {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    await refreshUser();
  };

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    await persistTokens(res.data);
  };

  const register = async (email: string, password: string, displayName?: string, inviteCode?: string) => {
    const res = await api.post('/api/auth/register', {
      email,
      password,
      display_name: displayName,
      invite_code: inviteCode,
    });
    await persistTokens(res.data);
  };

  const logout = () => {
    clearAuth();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthed, loading, user, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
