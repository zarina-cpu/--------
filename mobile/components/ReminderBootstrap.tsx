import { useEffect } from 'react';

import { useAuth } from '@/lib/AuthContext';
import { syncReminderFromStorage } from '@/lib/notifications';

/** Re-schedules local daily reminders after login / app start. */
export function ReminderBootstrap() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    syncReminderFromStorage().catch(() => {});
  }, [token]);

  return null;
}
