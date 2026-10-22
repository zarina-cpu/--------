import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, SectionTitle } from '@/components/AppScreen';
import { useAuth } from '@/lib/AuthContext';
import { last15LocalDateKeys, localDateKeyFromTimestamp } from '@/lib/datetime';
import { useAppTheme } from '@/lib/ThemeContext';

export default function AnalyticsScreen() {
  const { data, refresh } = useAuth();
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const days = useMemo(() => last15LocalDateKeys(), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const moodByDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data?.moods ?? []) {
      const key = localDateKeyFromTimestamp(m.created_at);
      if (!map.has(key)) map.set(key, m.emoji);
    }
    return map;
  }, [data?.moods]);

  const habits = (data?.habits ?? []).filter((h) => h.type !== 'archived');

  return (
    <AppScreen title="Аналитика" refreshing={refreshing} onRefresh={onRefresh}>
      <SectionTitle>Настроение за 15 дней</SectionTitle>
      <Card>
        <View style={styles.grid}>
          {days.map((d) => (
            <View key={d} style={styles.cell}>
              <Text style={{ fontSize: 18 }}>{moodByDay.get(d) ?? '·'}</Text>
              <Text style={{ color: colors.muted, fontSize: 9 }}>{d.slice(5)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle>Привычки</SectionTitle>
      {habits.length === 0 ? (
        <Text style={{ color: colors.muted }}>Нет данных по привычкам.</Text>
      ) : (
        habits.map((h) => (
          <Card key={h.id}>
            <Text style={[styles.habit, { color: colors.text }]}>{h.title}</Text>
            <Text style={{ color: colors.muted }}>
              Всего отметок: {h.logs?.length ?? 0}
            </Text>
          </Card>
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '18%', alignItems: 'center', paddingVertical: 6 },
  habit: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
});
