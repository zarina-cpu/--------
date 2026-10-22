import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ENABLED_KEY = 'habit_reminder_enabled';
const HOUR_KEY = 'habit_reminder_hour';
const MINUTE_KEY = 'habit_reminder_minute';
const ANDROID_CHANNEL = 'daily-reminder';

export const DEFAULT_REMINDER_HOUR = 20;
export const DEFAULT_REMINDER_MINUTE = 0;

export async function getReminderSettings(): Promise<{
  enabled: boolean;
  hour: number;
  minute: number;
}> {
  const [enabledRaw, hourRaw, minuteRaw] = await Promise.all([
    AsyncStorage.getItem(ENABLED_KEY),
    AsyncStorage.getItem(HOUR_KEY),
    AsyncStorage.getItem(MINUTE_KEY),
  ]);
  return {
    enabled: enabledRaw === '1',
    hour: hourRaw != null ? Number(hourRaw) : DEFAULT_REMINDER_HOUR,
    minute: minuteRaw != null ? Number(minuteRaw) : DEFAULT_REMINDER_MINUTE,
  };
}

export async function setReminderEnabled(enabled: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  const settings = await getReminderSettings();
  if (enabled) {
    await scheduleDailyReminder(settings.hour, settings.minute);
  } else {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export async function setReminderTime(hour: number, minute: number) {
  await AsyncStorage.setItem(HOUR_KEY, String(hour));
  await AsyncStorage.setItem(MINUTE_KEY, String(minute));
  const settings = await getReminderSettings();
  if (settings.enabled) {
    await scheduleDailyReminder(hour, minute);
  }
}

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Напоминания',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  await ensureAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(hour: number, minute: number) {
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Мой Путь',
      body: 'Отметьте привычки и запишите «Твой день»',
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return true;
}

export async function syncReminderFromStorage() {
  const settings = await getReminderSettings();
  if (settings.enabled) {
    await scheduleDailyReminder(settings.hour, settings.minute);
  }
}
