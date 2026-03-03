export const DASHBOARD_KEY_STORAGE = 'thecopilotmarketer_dashboard_key';

export function getStoredDashboardKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(DASHBOARD_KEY_STORAGE) || '';
}

export function setStoredDashboardKey(value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DASHBOARD_KEY_STORAGE, value);
}

export function clearStoredDashboardKey(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DASHBOARD_KEY_STORAGE);
}
