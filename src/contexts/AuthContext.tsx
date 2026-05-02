/**
 * Authentication Context for user state management.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';

interface User {
  id: number;
  email: string;
  nickname: string | null;
  avatar_url: string | null;
  auth_provider: string;
  created_at: string;
  last_login: string;
}

interface Preferences {
  favorite_teams: string[];
  favorite_players: string[];
  preferred_persona: string;
  tts_enabled: boolean;
  language: string;
}

interface AuthContextType {
  user: User | null;
  preferences: Preferences | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname?: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { nickname?: string; avatar_url?: string }) => Promise<void>;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = api.getToken();
      if (!token) {
        setUser(null);
        setPreferences(null);
        setIsLoading(false);
        return;
      }

      const data = await api.getMe();
      setUser(data.user);
      setPreferences(data.preferences);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      api.setToken(null);
      setUser(null);
      setPreferences(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    setUser(data.user);
    await refreshUser();
  };

  const register = async (email: string, password: string, nickname?: string) => {
    const data = await api.register(email, password, nickname);
    setUser(data.user);
    await refreshUser();
  };

  const googleLogin = async (credential: string) => {
    const data = await api.googleAuth(credential);
    setUser(data.user);
    await refreshUser();
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setPreferences(null);
  };

  const updateProfile = async (data: { nickname?: string; avatar_url?: string }) => {
    const response = await api.updateProfile(data);
    setUser(response.user);
  };

  const updatePreferences = async (prefs: Partial<Preferences>) => {
    const response = await api.updatePreferences(prefs);
    setPreferences(response.preferences);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        preferences,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        googleLogin,
        logout,
        updateProfile,
        updatePreferences,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
