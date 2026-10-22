import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, setAuthHeader } from './api';
import type { DayJournalEntry } from './dayJournal';

const TOKEN_KEY = 'token';

export type UserData = {
  moods: Array<{ id: number; emoji: string; text_reason?: string; created_at: string }>;
  habits: Array<{ id: number; title: string; type: string; logs?: string[] }>;
  basics: Array<{ id: number; title: string; type: string }>;
  achievements: Array<{ id: number; title: string; type: string; completed_at: string }>;
  diary: Array<{ id: number; text_reflection: string; created_at: string }>;
  day_journals: DayJournalEntry[];
  user?: { email?: string; phone?: string };
};

type AuthContextValue = {
  token: string | null;
  loading: boolean;
  data: UserData | null;
  authError: string;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UserData | null>(null);
  const [authError, setAuthError] = useState('');

  const refresh = useCallback(async () => {
    const { data: payload } = await api.get('/api/user/data');
    setData(payload);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          setAuthHeader(stored);
          setToken(stored);
          await refresh();
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setAuthHeader(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthError('');
      const { data: res } = await api.post('/api/auth/login', { email, password });
      const t = res.token as string;
      await AsyncStorage.setItem(TOKEN_KEY, t);
      setAuthHeader(t);
      setToken(t);
      await refresh();
    },
    [refresh]
  );

  const register = useCallback(async (email: string, password: string) => {
    setAuthError('');
    await api.post('/api/auth/register', { email, password });
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setAuthHeader(null);
    setToken(null);
    setData(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      loading,
      data,
      authError,
      refresh,
      login,
      register,
      logout,
    }),
    [token, loading, data, authError, refresh, login, register, logout]
  );

  return <AuthContext.Provider value={value as AuthContextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
