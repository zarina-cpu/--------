import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen, Card, SectionTitle } from '@/components/AppScreen';
import { DayJournalSection } from '@/components/DayJournalSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import {
  type DayJournalBlock,
  type DayJournalEntry,
  type DayJournalSectionId,
  dayJournalListDates,
  dayJournalSectionsFromEntry,
  findDayJournalByDate,
  formatDayJournalDate,
  normalizeDateKey,
  shiftDateKey,
  todayDateKey,
} from '@/lib/dayJournal';
import { useAppTheme } from '@/lib/ThemeContext';

export default function DiaryScreen() {
  const { data, refresh } = useAuth();
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [journalDate, setJournalDate] = useState(todayDateKey());
  const [gratitudeText, setGratitudeText] = useState('');
  const [stressText, setStressText] = useState('');
  const [lessonText, setLessonText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [savingSection, setSavingSection] = useState<DayJournalSectionId | ''>('');
  const [savedSection, setSavedSection] = useState<DayJournalSectionId | ''>('');
  const [errorSection, setErrorSection] = useState<DayJournalSectionId | ''>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editBlock, setEditBlock] = useState<{
    dateKey: string;
    block: DayJournalBlock;
    text: string;
  } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const journals = (data?.day_journals ?? []) as DayJournalEntry[];
  const dateList = useMemo(() => dayJournalListDates(journals), [journals]);
  const today = todayDateKey();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const clearFeedback = () => {
    setErrorMsg('');
    setErrorSection('');
    setSavedSection('');
  };

  const saveSection = async (section: DayJournalSectionId) => {
    const textBySection: Record<DayJournalSectionId, string> = {
      gratitude: gratitudeText.trim(),
      stress: stressText.trim(),
      lesson: lessonText.trim(),
      note: noteText.trim(),
    };
    const text = textBySection[section];
    if (!text) {
      setErrorSection(section);
      setErrorMsg('Заполните поле перед сохранением');
      return;
    }
    clearFeedback();
    setSavingSection(section);
    try {
      await api.post('/api/day-journal/entry', {
        entry_date: journalDate,
        section,
        text,
      });
      if (section === 'gratitude') setGratitudeText('');
      if (section === 'stress') setStressText('');
      if (section === 'lesson') setLessonText('');
      if (section === 'note') setNoteText('');
      setSavedSection(section);
      setExpanded((prev) => ({ ...prev, [normalizeDateKey(journalDate)]: true }));
      await refresh();
      setTimeout(() => setSavedSection(''), 2500);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Не удалось сохранить';
      setErrorSection(section);
      setErrorMsg(msg);
    } finally {
      setSavingSection('');
    }
  };

  const sectionFeedback = (section: DayJournalSectionId) => {
    if (errorSection === section && errorMsg) return { error: errorMsg };
    if (savedSection === section) return { feedback: 'Сохранено' };
    return {};
  };

  const toggleArchive = (dateKey: string) => {
    const key = normalizeDateKey(dateKey);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const startEdit = (dateKey: string, block: DayJournalBlock) => {
    setEditBlock({ dateKey: normalizeDateKey(dateKey), block, text: block.text });
  };

  const saveEdit = async () => {
    if (!editBlock?.text.trim() || archiveBusy) return;
    setArchiveBusy(true);
    try {
      await api.put('/api/day-journal/entry', {
        entry_date: editBlock.dateKey,
        section: editBlock.block.sectionId,
        entry_id: editBlock.block.entryId,
        text: editBlock.text.trim(),
      });
      setEditBlock(null);
      await refresh();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Не удалось сохранить';
      Alert.alert('Ошибка', msg);
    } finally {
      setArchiveBusy(false);
    }
  };

  const confirmDelete = (dateKey: string, block: DayJournalBlock) => {
    Alert.alert('Удалить запись?', block.text.slice(0, 80), [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setArchiveBusy(true);
          try {
            await api.delete('/api/day-journal/entry', {
              data: {
                entry_date: normalizeDateKey(dateKey),
                section: block.sectionId,
                entry_id: block.entryId,
              },
            });
            await refresh();
          } catch (e: unknown) {
            const msg =
              (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Не удалось удалить';
            Alert.alert('Ошибка', msg);
          } finally {
            setArchiveBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <AppScreen title="Твой день" refreshing={refreshing} onRefresh={onRefresh}>
      <Card>
        <View style={styles.dateRow}>
          <Pressable onPress={() => setJournalDate(shiftDateKey(journalDate, -1))}>
            <Text style={{ color: colors.accent, fontSize: 18 }}>‹</Text>
          </Pressable>
          <View style={styles.dateCenter}>
            <Text style={[styles.dateTitle, { color: colors.text }]}>
              {journalDate === today ? 'Запись за сегодня' : `Запись за ${formatDayJournalDate(journalDate)}`}
            </Text>
            {journalDate !== today ? (
              <Pressable onPress={() => setJournalDate(today)}>
                <Text style={{ color: colors.accent, marginTop: 4 }}>Сегодня</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => setJournalDate(shiftDateKey(journalDate, 1))}>
            <Text style={{ color: colors.accent, fontSize: 18 }}>›</Text>
          </Pressable>
        </View>
      </Card>

      <DayJournalSection
        sectionId="gratitude"
        title="Практика благодарности"
        emoji="🌟"
        hint="За что вы благодарны. После сохранения поле очищается — запись появится в «Записи по дням»."
        placeholder="Например: за поддержку близких — маме…"
        value={gratitudeText}
        onChangeText={setGratitudeText}
        onSave={() => saveSection('gratitude')}
        saving={savingSection === 'gratitude'}
        {...sectionFeedback('gratitude')}
      />

      <DayJournalSection
        sectionId="stress"
        title="Рефлексия и уроки"
        emoji="💡"
        hint="Что сегодня огорчило и вызвало стресс"
        placeholder="Опишите ситуации и чувства…"
        value={stressText}
        onChangeText={setStressText}
        onSave={() => saveSection('stress')}
        saving={savingSection === 'stress'}
        extraTitle="Урок дня"
        extraHint="Положительный вывод из сегодняшних событий"
        {...sectionFeedback('stress')}
      />

      <DayJournalSection
        sectionId="lesson"
        title="Урок дня"
        emoji="💡"
        hint="Чему научились, что возьмёте с собой"
        placeholder="Чему научились…"
        value={lessonText}
        onChangeText={setLessonText}
        onSave={() => saveSection('lesson')}
        saving={savingSection === 'lesson'}
        {...sectionFeedback('lesson')}
      />

      <DayJournalSection
        sectionId="note"
        title="Заметка дня"
        emoji="📖"
        hint="Свободные мысли и наблюдения"
        placeholder="Всё, что хочется зафиксировать…"
        value={noteText}
        onChangeText={setNoteText}
        onSave={() => saveSection('note')}
        saving={savingSection === 'note'}
        {...sectionFeedback('note')}
      />

      <SectionTitle>Записи по дням</SectionTitle>
      {dateList.map((dateKey) => {
        const key = normalizeDateKey(dateKey);
        const entry = findDayJournalByDate(journals, key);
        const sections = dayJournalSectionsFromEntry(entry);
        const isOpen = expanded[key];
        const isEditingDate = key === normalizeDateKey(journalDate);

        return (
          <Card key={key}>
            <View style={styles.archiveHead}>
              <Pressable
                onPress={() => {
                  setJournalDate(key);
                  clearFeedback();
                }}>
                <Text style={[styles.archiveDate, { color: isEditingDate ? colors.accent : colors.text }]}>
                  {formatDayJournalDate(key)}
                  {key === today ? ' · сегодня' : ''}
                  {sections.length > 0 ? ` · ${sections.length} зап.` : ''}
                </Text>
              </Pressable>
              <Pressable onPress={() => toggleArchive(key)}>
                <Text style={{ color: colors.accent }}>{isOpen ? 'Закрыть' : 'Открыть'}</Text>
              </Pressable>
            </View>
            {isOpen ? (
              <View style={styles.archiveBody}>
                {sections.length === 0 ? (
                  <Text style={{ color: colors.muted }}>Пока нет записей за этот день</Text>
                ) : (
                  sections.map((block) => {
                    const editing =
                      editBlock?.dateKey === key &&
                      editBlock.block.entryId === block.entryId &&
                      editBlock.block.sectionId === block.sectionId;

                    return (
                      <View
                        key={block.key}
                        style={[styles.block, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>
                          {block.emoji} {block.title}
                        </Text>
                        {editing ? (
                          <>
                            <TextInput
                              multiline
                              value={editBlock.text}
                              onChangeText={(t) => setEditBlock({ ...editBlock, text: t })}
                              style={[
                                styles.editInput,
                                {
                                  color: colors.text,
                                  borderColor: colors.border,
                                  backgroundColor: colors.card,
                                },
                              ]}
                            />
                            <View style={styles.blockActions}>
                              <PrimaryButton title="Сохранить" onPress={saveEdit} disabled={archiveBusy} />
                              <PrimaryButton
                                title="Отмена"
                                variant="ghost"
                                onPress={() => setEditBlock(null)}
                              />
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={{ color: colors.text, marginTop: 6, lineHeight: 22 }}>
                              {block.text}
                            </Text>
                            <View style={styles.blockActions}>
                              <Pressable onPress={() => startEdit(key, block)}>
                                <Text style={{ color: colors.accent }}>Изменить</Text>
                              </Pressable>
                              <Pressable onPress={() => confirmDelete(key, block)}>
                                <Text style={{ color: '#c44' }}>Удалить</Text>
                              </Pressable>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </Card>
        );
      })}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  archiveHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  archiveDate: { fontSize: 15, fontWeight: '600', flex: 1 },
  archiveBody: { marginTop: 12, gap: 10 },
  block: { borderWidth: 1, borderRadius: 12, padding: 12 },
  blockActions: { flexDirection: 'row', gap: 16, marginTop: 10, alignItems: 'center' },
  editInput: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
