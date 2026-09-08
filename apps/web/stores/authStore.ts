import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import type { UserRead } from '../lib/types';

interface AuthState {
  currentUser: UserRead | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  checkAuth: () => Promise<UserRead | null>;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<UserRead>;
  logout: () => Promise<void>;
  setUser: (user: UserRead | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await api.getCurrentUser();
      set({ currentUser: user, isAuthenticated: true, isLoading: false });
      return user;
    } catch {
      set({ currentUser: null, isAuthenticated: false, isLoading: false });
      return null;
    }
  },

  login: async (username: string, password: string, rememberMe = true) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.login(username, password, rememberMe);
      set({
        currentUser: res.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return res.user;
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await api.logout();
    } catch {
      // Clean state regardless of network response
    } finally {
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  setUser: (user) =>
    set({
      currentUser: user,
      isAuthenticated: Boolean(user),
    }),

  clearError: () => set({ error: null }),
}));
