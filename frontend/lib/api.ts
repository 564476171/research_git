'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
export const AUTH_EXPIRED_EVENT = 'research-git:auth-expired';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

let refreshPromise: Promise<TokenPair> | null = null;

export function toAbsoluteMediaUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(tokens: TokenPair) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearStoredTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function dispatchAuthExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

function isAuthEndpoint(url?: string) {
  if (!url) return false;
  return ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'].some((endpoint) => url.includes(endpoint));
}

async function refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('Missing refresh token');

  if (!refreshPromise) {
    refreshPromise = axios
      .post<TokenPair>('/api/auth/refresh', { refresh_token: refreshToken })
      .then((res) => {
        storeTokens(res.data);
        return res.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export const api = axios.create();

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const response = error.response;
    const original = error.config as RetryableRequestConfig | undefined;

    if (!response || response.status !== 401 || !original || original._retry || isAuthEndpoint(original.url)) {
      throw error;
    }

    original._retry = true;

    try {
      const tokens = await refreshTokens();
      original.headers.Authorization = `Bearer ${tokens.access_token}`;
      return api(original);
    } catch (refreshError) {
      clearStoredTokens();
      dispatchAuthExpired();
      throw refreshError;
    }
  }
);

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let response = await fetch(input, withAuth(getAccessToken()));
  const url = typeof input === 'string' ? input : input.toString();

  if (response.status !== 401 || isAuthEndpoint(url)) return response;

  try {
    const tokens = await refreshTokens();
    response = await fetch(input, withAuth(tokens.access_token));
    return response;
  } catch (error) {
    clearStoredTokens();
    dispatchAuthExpired();
    throw error;
  }
}
