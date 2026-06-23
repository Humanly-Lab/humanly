import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { TokenManager, ApiError } from '@/lib/api-client';
import { disconnectSocket, initializeSocket } from '@/lib/socket-client';

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileCompleted?: boolean;
  emailVerified: boolean;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auth state interface
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ requiresEmailVerification: boolean }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerificationEmail: (email?: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  validatePasswordResetToken: (token: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  checkAuth: (options?: { forceRefresh?: boolean; allowCookieRefresh?: boolean }) => Promise<void>;
  adoptAuthenticatedSession: (user: User, accessToken: string) => void;
  fetchUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  clearLocalSession: () => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

/**
 * Auth store
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      /**
       * Login user
       */
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await api.post<{
            success: boolean;
            message: string;
            data: {
              user: User;
              accessToken: string;
            };
          }>('/auth/login', { email, password });

          // Store access token (refresh token is set as httpOnly cookie by backend)
          TokenManager.setAccessToken(response.data.accessToken);

          // Update state
          set({
            user: response.data?.user || null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Initialize socket connection
          initializeSocket();
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Login failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Register new user
       */
      register: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await api.post<{
            success: boolean;
            message: string;
            data: {
              user: User;
              accessToken?: string;
            };
          }>('/auth/register', { email, password });

          if (response.data.accessToken) {
            TokenManager.setAccessToken(response.data.accessToken);

            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });

            initializeSocket();
            return { requiresEmailVerification: false };
          }

          // Registration successful - user needs to verify email before logging in
          // Don't set authenticated state or tokens
          set({
            user: null, // Don't store unverified user
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });

          return { requiresEmailVerification: true };
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Registration failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Logout user
       */
      logout: async () => {
        try {
          set({ isLoading: true, error: null });

          // Call logout endpoint
          await api.post('/auth/logout');

          // Clear tokens
          TokenManager.clearTokens();

          // Disconnect socket
          disconnectSocket();

          // Clear state
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          // Still clear state even if API call fails
          TokenManager.clearTokens();
          disconnectSocket();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      /**
       * Delete the current account and clear local session state.
       */
      deleteAccount: async () => {
        try {
          set({ isLoading: true, error: null });

          await api.delete('/auth/me');

          TokenManager.clearTokens();
          disconnectSocket();

          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Failed to delete account';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Verify email with code
       */
      verifyEmail: async (code: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await api.post<{
            success: boolean;
            message: string;
            data: {
              user: User;
            };
          }>('/auth/verify-email', { code });

          // Update user
          set({
            user: response.data.user,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Email verification failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

  /**
   * Resend verification email
   */
  resendVerificationEmail: async (email?: string) => {
    try {
      set({ isLoading: true, error: null });

      // Use provided email or get from state
      const emailToUse = email || get().user?.email;
      if (!emailToUse) {
        throw new ApiError('Email is required to resend verification');
      }

      await api.post('/auth/resend-verification', { email: emailToUse });

      set({ isLoading: false, error: null });
    } catch (error) {
      const errorMessage = error instanceof ApiError ? error.message : 'Failed to resend verification email';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

      /**
       * Request password reset
       */
      forgotPassword: async (email: string) => {
        try {
          set({ isLoading: true, error: null });

          await api.post('/auth/forgot-password', { email });

          set({ isLoading: false, error: null });
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Failed to send reset email';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Validate password reset token before showing the reset form
       */
      validatePasswordResetToken: async (token: string) => {
        try {
          await api.post('/auth/reset-password/validate', { token });
        } catch (error) {
          const errorMessage =
            error instanceof ApiError ? error.message : 'Invalid or expired password reset link';
          set({ error: errorMessage });
          throw error;
        }
      },

      /**
       * Reset password with token
       */
      resetPassword: async (token: string, newPassword: string) => {
        try {
          set({ isLoading: true, error: null });

          await api.post('/auth/reset-password', { token, newPassword });

          set({ isLoading: false, error: null });
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Password reset failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Check authentication status
       */
      checkAuth: async (
        options: { forceRefresh?: boolean; allowCookieRefresh?: boolean } = {}
      ) => {
        set({ isLoading: true });

        const allowCookieRefresh = options.allowCookieRefresh ?? true;
        const clearFailedAuthState = () => {
          if (allowCookieRefresh) {
            TokenManager.clearTokens();
          } else {
            TokenManager.clearPrimaryTokens();
          }
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        };
        const existingToken = TokenManager.getAccessToken();
        let token = options.forceRefresh ? null : existingToken;
        if (!token || options.forceRefresh) {
          if (!allowCookieRefresh) {
            clearFailedAuthState();
            return;
          }

          try {
            const refreshResponse = await api.post<{
              success: boolean;
              data: {
                accessToken: string;
              };
            }>('/auth/refresh', {}, { skipAuthRedirect: true });
            TokenManager.setAccessToken(refreshResponse.data.accessToken);
            token = refreshResponse.data.accessToken;
          } catch {
            if (options.forceRefresh && existingToken) {
              token = existingToken;
            } else {
              clearFailedAuthState();
              return;
            }
          }
        }

        if (!token) {
          clearFailedAuthState();
          return;
        }

        try {
          const authRequestConfig = allowCookieRefresh
            ? { skipAuthRedirect: true }
            : { skipAuthRedirect: true, skipAuthRefresh: true };
          const response = await api.get<{
            success: boolean;
            data: {
              user: User;
            };
          }>('/auth/me', authRequestConfig);

          set({
            user: response.data?.user || null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Initialize socket if not connected
          initializeSocket(token);
        } catch (error) {
          // If fetching user fails, clear auth state
          clearFailedAuthState();
        }
      },

      /**
       * Adopt an already-issued authenticated session without another round
       * trip. Public guest task starts return a guest token and user together;
       * applying them before navigation avoids first-load auth races.
       */
      adoptAuthenticatedSession: (user: User, accessToken: string) => {
        TokenManager.setAccessToken(accessToken);
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        initializeSocket(accessToken);
      },

      /**
       * Fetch current user
       */
      fetchUser: async () => {
        try {
          set({ isLoading: true, error: null });

          const response = await api.get<{
            success: boolean;
            data: {
              user: User;
            };
          }>('/auth/me');

          set({
            user: response.data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Initialize socket if not connected
          initializeSocket();
        } catch (error) {
          // If fetching user fails, clear auth state
          TokenManager.clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
          throw error;
        }
      },

      /**
       * Update user profile
       */
      updateUser: async (data: Partial<User>) => {
        try {
          set({ error: null });

          const response = await api.patch<{
            success: boolean;
            data: {
              user: User;
            };
          }>('/auth/me', data);

          set({
            user: response.data.user,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof ApiError ? error.message : 'Failed to update profile';
          set({ error: errorMessage });
          throw error;
        }
      },

      /**
       * Clear local auth state without calling the backend.
       */
      clearLocalSession: () => {
        TokenManager.clearTokens();
        disconnectSocket();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      /**
       * Clear error
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Set loading state
       */
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
