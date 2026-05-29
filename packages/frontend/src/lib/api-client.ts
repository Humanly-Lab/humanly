import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

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

/**
 * Token management utilities
 */
let inMemoryAccessToken: string | null = null;

const clearLegacyStoredTokens = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

export const TokenManager = {
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    if (inMemoryAccessToken) return inMemoryAccessToken;

    const legacyStoredToken = localStorage.getItem('accessToken');
    if (legacyStoredToken) {
      inMemoryAccessToken = legacyStoredToken;
      clearLegacyStoredTokens();
    }

    return inMemoryAccessToken;
  },

  setAccessToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    inMemoryAccessToken = token;
    clearLegacyStoredTokens();
  },

  getRefreshToken: (): string | null => {
    clearLegacyStoredTokens();
    return null;
  },

  setRefreshToken: (_token: string): void => {
    clearLegacyStoredTokens();
  },

  clearTokens: (): void => {
    inMemoryAccessToken = null;
    clearLegacyStoredTokens();
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
      // Let axios/browser set multipart boundaries for file uploads.
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
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

      // Handle 401 errors (unauthorized), but do not try to refresh login/register/refresh failures.
      const requestUrl = originalRequest.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/login')
        || requestUrl.includes('/auth/register')
        || requestUrl.includes('/auth/refresh');

      if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
        originalRequest._retry = true;

        try {
          // Try to refresh the token (refresh token sent via httpOnly cookie)
          const response = await axios.post(
            `${API_URL}/api/v1/auth/refresh`,
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
          // Refresh failed, clear tokens and redirect to login
          TokenManager.clearTokens();
          if (typeof window !== 'undefined') {
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
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.get<T>(url, config).then((res) => res.data);
  },

  /**
   * POST request
   */
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.post<T>(url, data, config).then((res) => res.data);
  },

  /**
   * PUT request
   */
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.put<T>(url, data, config).then((res) => res.data);
  },

  /**
   * PATCH request
   */
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.patch<T>(url, data, config).then((res) => res.data);
  },

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.delete<T>(url, config).then((res) => res.data);
  },
};

export default api;
