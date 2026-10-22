import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppScreen, Card, SectionTitle } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/AuthContext';
import { API_URL } from '@/lib/api';
import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  getReminderSettings,
  requestNotificationPermissions,
  setReminderEnabled,
  setReminderTime,
} from '@/lib/notifications';
import { useAppTheme } from '@/lib/ThemeContext';

function timeToDate(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export default function SettingsScreen() {
  const { data, logout } = useAuth();
  const { colors, mode, toggle } = useAppTheme();
  const router = useRouter();
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(DEFAULT_REMINDER_HOUR);
  const [reminderMinute, setReminderMinute] = useState(DEFAULT_REMINDER_MINUTE);
  const [showPicker, setShowPicker] = useState(false);

  const loadReminders = useCallback(async () => {
    const s = await getReminderSettings();
    setReminderOn(s.enabled);
    setReminderHour(s.hour);
    setReminderMinute(s.minute);
  }, []);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const toggleReminder = async (value: boolean) => {
    if (value) {
      const ok = await requestNotificationPermissions();
      if (!ok) {
        Alert.alert(
          'Нет разрешения',
          'Разрешите уведомления в настройках Android, чтобы получать напоминания.'
        );
        return;
      }
    }
    await setReminderEnabled(value);
    setReminderOn(value);
  };

  const onTimeChange = async (_: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (!date) return;
    const h = date.getHours();
    const m = date.getMinutes();
    setReminderHour(h);
    setReminderMinute(m);
    await setReminderTime(h, m);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const timeLabel = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`;

  return (
    <AppScreen title="Настройки">
      <SectionTitle>Аккаунт</SectionTitle>
      <Card>
        <Text style={{ color: colors.text }}>
          {data?.user?.email ?? data?.user?.phone ?? 'Пользователь'}
        </Text>
      </Card>

      <SectionTitle>Напоминания</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Text style={{ color: colors.text, flex: 1 }}>Ежедневное напоминание</Text>
          <Switch
            value={reminderOn}
            onValueChange={toggleReminder}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Локальное уведомление: отметить привычки и записать «Твой день».
        </Text>
        {reminderOn ? (
          <>
            <Pressable onPress={() => setShowPicker(true)} style={styles.timeBtn}>
              <Text style={{ color: colors.text }}>Время: {timeLabel}</Text>
              <Text style={{ color: colors.accent }}>Изменить</Text>
            </Pressable>
            {showPicker ? (
              <DateTimePicker
                value={timeToDate(reminderHour, reminderMinute)}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      <SectionTitle>Оформление</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Text style={{ color: colors.text, flex: 1 }}>Тема</Text>
          <Text style={{ color: colors.muted }}>{mode === 'dark' ? 'Тёмная' : 'Светлая'}</Text>
        </View>
        <PrimaryButton
          title={mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          onPress={toggle}
        />
      </Card>

      <SectionTitle>Сервер</SectionTitle>
      <Card>
        <Text style={{ color: colors.muted, fontSize: 12 }}>API</Text>
        <Text style={{ color: colors.text }}>{API_URL}</Text>
      </Card>

      <PrimaryButton title="Выйти" variant="ghost" onPress={handleLogout} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  timeBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
