import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, Card, SectionTitle } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { formatLocalTime } from '@/lib/datetime';
import { useAppTheme } from '@/lib/ThemeContext';

const MOODS = ['😊', '😌', '😐', '😔', '😢', '😤', '🤔', '😠', '🥳', '😴'];

type HabitType = 'will_do' | 'wont_do';

export default function MainScreen() {
  const { data, refresh } = useAuth();
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [habitTitle, setHabitTitle] = useState('');
  const [habitType, setHabitType] = useState<HabitType>('will_do');
  const [habitSaving, setHabitSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const saveMood = async (emoji: string) => {
    setSelectedEmoji(emoji);
    await api.post('/api/moods', { emoji, text_reason: reason.trim() || undefined });
    setReason('');
    await refresh();
  };

  const toggleHabit = async (habitId: number) => {
    await api.put(`/api/habits/${habitId}/log`);
    await refresh();
  };

  const addHabit = async () => {
    const title = habitTitle.trim();
    if (!title) return;
    setHabitSaving(true);
    try {
      await api.post('/api/habits', { title, type: habitType });
      setHabitTitle('');
      await refresh();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Не удалось создать привычку';
      Alert.alert('Ошибка', msg);
    } finally {
      setHabitSaving(false);
    }
  };

  const moods = data?.moods ?? [];
  const habits = (data?.habits ?? []).filter((h) => h.type !== 'archived');

  return (
    <AppScreen title="Главная" refreshing={refreshing} onRefresh={onRefresh}>
      <SectionTitle>Настроение</SectionTitle>
      <Card>
        <View style={styles.moodRow}>
          {MOODS.map((e) => (
            <Pressable
              key={e}
              onPress={() => saveMood(e)}
              style={[
                styles.moodBtn,
                {
                  borderColor: selectedEmoji === e ? colors.accent : colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}>
              <Text style={styles.moodEmoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          placeholder="Почему так? (необязательно)"
          placeholderTextColor={colors.muted}
          value={reason}
          onChangeText={setReason}
          style={[
            styles.reason,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBg },
          ]}
        />
        {moods[0] ? (
          <Text style={{ color: colors.muted, marginTop: 8 }}>
            Последнее: {moods[0].emoji} {moods[0].text_reason ?? ''}
            {moods[0].created_at ? ` · ${formatLocalTime(moods[0].created_at)}` : ''}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Новая привычка</SectionTitle>
      <Card>
        <TextInput
          placeholder="Название привычки"
          placeholderTextColor={colors.muted}
          value={habitTitle}
          onChangeText={setHabitTitle}
          style={[
            styles.reason,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBg },
          ]}
        />
        <View style={styles.typeRow}>
          {(
            [
              { id: 'will_do' as HabitType, label: 'Буду делать' },
              { id: 'wont_do' as HabitType, label: 'Не буду делать' },
            ] as const
          ).map((opt) => {
            const active = habitType === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setHabitType(opt.id)}
                style={[
                  styles.typeChip,
                  {
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent : colors.inputBg,
                  },
                ]}>
                <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600', fontSize: 14 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <PrimaryButton
          title={habitSaving ? 'Добавление…' : 'Добавить привычку'}
          onPress={addHabit}
          disabled={habitSaving || !habitTitle.trim()}
        />
      </Card>

      <SectionTitle>Мои привычки</SectionTitle>
      {habits.length === 0 ? (
        <Text style={{ color: colors.muted }}>Добавьте первую привычку выше.</Text>
      ) : (
        habits.map((h) => (
          <Card key={h.id}>
            <Text style={[styles.habitTitle, { color: colors.text }]}>{h.title}</Text>
            <Text style={{ color: colors.muted, marginBottom: 10 }}>
              {h.type === 'wont_do' ? 'Не буду делать' : 'Буду делать'} · отметок: {h.logs?.length ?? 0}
            </Text>
            <Pressable
              onPress={() => toggleHabit(h.id)}
              style={[styles.habitDone, { backgroundColor: colors.accent }]}>
              <Text style={styles.habitDoneText}>Отметить сегодня</Text>
            </Pressable>
          </Card>
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: { fontSize: 22 },
  reason: {
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  typeChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  habitTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  habitDone: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  habitDoneText: { color: '#fff', fontWeight: '600' },
});
