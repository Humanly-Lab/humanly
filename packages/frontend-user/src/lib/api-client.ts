import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export type HumanlyAxiosRequestConfig = AxiosRequestConfig & {
  skipAuthRedirect?: boolean;
};

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const PUBLIC_DOCUMENT_ACCESS_TOKENS_KEY = 'humanlyPublicDocumentAccessTokens';

const readPublicDocumentAccessTokens = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = sessionStorage.getItem(PUBLIC_DOCUMENT_ACCESS_TOKENS_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ))
    );
  } catch {
    return {};
  }
};

const writePublicDocumentAccessTokens = (tokens: Record<string, string>): void => {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(PUBLIC_DOCUMENT_ACCESS_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Session storage can be unavailable in hardened browser contexts. In that
    // case the anonymous fallback still works through the normal access token.
  }
};

/**
 * Token management utilities
 */
export const TokenManager = {
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  },

  setAccessToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('accessToken', token);
  },

  clearAccessToken: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
  },

  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  },

  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('refreshToken', token);
  },

  clearTokens: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    try {
      sessionStorage.removeItem(PUBLIC_DOCUMENT_ACCESS_TOKENS_KEY);
    } catch {
      // Ignore storage failures during logout/session cleanup.
    }
  },

  getPublicDocumentAccessToken: (documentId: string): string | null => {
    if (!documentId) return null;
    return readPublicDocumentAccessTokens()[documentId] || null;
  },

  setPublicDocumentAccessToken: (documentId: string, token: string): void => {
    if (!documentId || !token) return;
    writePublicDocumentAccessTokens({
      ...readPublicDocumentAccessTokens(),
      [documentId]: token,
    });
  },

  clearPublicDocumentAccessToken: (documentId: string): void => {
    if (!documentId) return;
    const tokens = readPublicDocumentAccessTokens();
    delete tokens[documentId];
    writePublicDocumentAccessTokens(tokens);
  },
};

/**
 * Create axios instance with base configuration
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    withCredentials: true, // Send cookies with requests
    headers: {
      'Content-Type': 'application/json',
    },
  });

  /**
   * Request interceptor - Add auth token to requests
   */
  client.interceptors.request.use(
    (config) => {
      const token = TokenManager.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Let axios set the correct Content-Type (including multipart boundary) for FormData
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  /**
   * Response interceptor - Handle errors and token refresh
   */
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as HumanlyAxiosRequestConfig & { _retry?: boolean };

      // Handle 401 errors (unauthorized) — but skip token refresh for AI endpoints
      // because a 401 from /ai/chat means invalid AI API key, not expired JWT
      const requestUrl = originalRequest.url || '';
      const isAIEndpoint = requestUrl.includes('/ai/chat') || requestUrl.includes('/ai/stream');
      const isAuthEndpoint = requestUrl.includes('/auth/login')
        || requestUrl.includes('/auth/register')
        || requestUrl.includes('/auth/refresh');
      if (error.response?.status === 401 && !originalRequest._retry && !isAIEndpoint && !isAuthEndpoint) {
        originalRequest._retry = true;

        try {
          // Try to refresh the token (refresh token sent via httpOnly cookie)
          const response = await axios.post(
            `${API_URL}/auth/refresh`,
            {}, // Empty body - refresh token is in cookie
            { withCredentials: true } // Include cookies
          );

          const accessToken = response.data.data.accessToken;
          TokenManager.setAccessToken(accessToken);

          // Retry the original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return client(originalRequest);
        } catch (refreshError) {
          // Refresh failed. Best-effort background calls such as editor event
          // tracking should fail quietly instead of ejecting an active writer.
          if (!originalRequest.skipAuthRedirect) {
            TokenManager.clearTokens();
          }
          if (!originalRequest.skipAuthRedirect && typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        }
      }

      // Transform error to ApiError
      const errorMessage =
        (error.response?.data as any)?.message ||
        error.message ||
        'An unexpected error occurred';

      const apiError = new ApiError(
        errorMessage,
        error.response?.status,
        error.response?.data
      );

      return Promise.reject(apiError);
    }
  );

  return client;
};

/**
 * API client instance
 */
export const apiClient = createApiClient();

/**
 * API helper methods
 */
export const api = {
  /**
   * GET request
   */
  get: <T = any>(url: string, config?: HumanlyAxiosRequestConfig): Promise<T> => {
    return apiClient.get<T>(url, config).then((res) => res.data);
  },

  /**
   * POST request
   */
  post: <T = any>(url: string, data?: any, config?: HumanlyAxiosRequestConfig): Promise<T> => {
    return apiClient.post<T>(url, data, config).then((res) => res.data);
  },

  /**
   * PUT request
   */
  put: <T = any>(url: string, data?: any, config?: HumanlyAxiosRequestConfig): Promise<T> => {
    return apiClient.put<T>(url, data, config).then((res) => res.data);
  },

  /**
   * PATCH request
   */
  patch: <T = any>(url: string, data?: any, config?: HumanlyAxiosRequestConfig): Promise<T> => {
    return apiClient.patch<T>(url, data, config).then((res) => res.data);
  },

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, config?: HumanlyAxiosRequestConfig): Promise<T> => {
    return apiClient.delete<T>(url, config).then((res) => res.data);
  },
};

export default api;
