import React, { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AppScreen, Card, SectionTitle } from '@/components/AppScreen';
import { useAuth } from '@/lib/AuthContext';
import { formatLocalDate } from '@/lib/datetime';
import { useAppTheme } from '@/lib/ThemeContext';

export default function HallScreen() {
  const { data, refresh } = useAuth();
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const achievements = data?.achievements ?? [];

  return (
    <AppScreen title="Достижения" refreshing={refreshing} onRefresh={onRefresh}>
      <SectionTitle>Зал славы</SectionTitle>
      {achievements.length === 0 ? (
        <Text style={{ color: colors.muted }}>Пока нет достижений — продолжайте путь!</Text>
      ) : (
        achievements.map((a) => (
          <Card key={a.id}>
            <Text style={[styles.title, { color: colors.text }]}>{a.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {a.type} · {formatLocalDate(a.completed_at)}
            </Text>
          </Card>
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
});
