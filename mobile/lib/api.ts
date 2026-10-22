import axios from 'axios';
import Constants from 'expo-constants';

export const API_URL =
  (Constants.expoConfig?.extra as { apiUrl?: string })?.apiUrl ??
  'https://my-way-tracker.vercel.app';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
});

export function setAuthHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
