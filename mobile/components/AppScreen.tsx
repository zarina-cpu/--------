import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/lib/ThemeContext';

type Props = {
  title?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
};

export function AppScreen({ title, children, refreshing, onRefresh, contentStyle }: Props) {
  const { colors } = useAppTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {title ? (
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.scroll, contentStyle]}
        refreshControl={
          onRefresh
            ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.section, { color: colors.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
});
