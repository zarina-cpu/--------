import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '@/lib/ThemeContext';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
};

export function PrimaryButton({ title, onPress, disabled, variant = 'primary' }: Props) {
  const { colors } = useAppTheme();
  const isGhost = variant === 'ghost';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        isGhost
          ? { borderColor: colors.border, backgroundColor: 'transparent' }
          : { backgroundColor: colors.accent, opacity: pressed ? 0.85 : disabled ? 0.5 : 1 },
      ]}>
      <Text
        style={[
          styles.text,
          { color: isGhost ? colors.text : '#fff' },
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  text: { fontSize: 16, fontWeight: '600' },
});
