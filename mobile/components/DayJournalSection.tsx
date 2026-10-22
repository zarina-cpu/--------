import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Card } from '@/components/AppScreen';
import { useAppTheme } from '@/lib/ThemeContext';
import type { DayJournalSectionId } from '@/lib/dayJournal';

type Props = {
  sectionId: DayJournalSectionId;
  title: string;
  emoji: string;
  hint: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  onSave: () => void;
  saving: boolean;
  feedback?: string;
  error?: string;
  extraTitle?: string;
  extraHint?: string;
};

export function DayJournalSection({
  title,
  emoji,
  hint,
  placeholder,
  value,
  onChangeText,
  onSave,
  saving,
  feedback,
  error,
  extraTitle,
  extraHint,
}: Props) {
  const { colors } = useAppTheme();

  return (
    <Card>
      <Text style={[styles.heading, { color: colors.text }]}>
        <Text>{emoji} </Text>
        {title}
      </Text>
      <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text>
      <TextInput
        multiline
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {feedback ? <Text style={[styles.ok, { color: colors.accent }]}>{feedback}</Text> : null}
      <PrimaryButton
        title={saving ? 'Сохранение…' : 'Сохранить'}
        onPress={onSave}
        disabled={saving || !value.trim()}
      />
      {extraTitle ? (
        <>
          <Text style={[styles.subheading, { color: colors.text }]}>{extraTitle}</Text>
          {extraHint ? (
            <Text style={[styles.hint, { color: colors.muted }]}>{extraHint}</Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  subheading: { fontSize: 15, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  hint: { fontSize: 14, marginBottom: 10, lineHeight: 20 },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: '#c44', marginBottom: 8 },
  ok: { marginBottom: 8, fontSize: 14 },
});
