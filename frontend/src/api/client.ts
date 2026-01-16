import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "price-tracker-token";

export const api = axios.create({
  baseURL: API_BASE_URL
});

export function setAuthToken(token?: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
  if (typeof window !== "undefined" && window.localStorage) {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }
}

const initialToken =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage.getItem(TOKEN_KEY)
    : null;

if (initialToken) {
  setAuthToken(initialToken);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      setAuthToken(null);
    }
    return Promise.reject(error);
  }
);
