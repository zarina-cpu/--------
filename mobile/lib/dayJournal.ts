export type DayJournalSectionId = 'gratitude' | 'stress' | 'lesson' | 'note';

export type DayJournalEntry = {
  id?: number;
  entry_date: string;
  gratitude?: Array<{ id?: string; what?: string; whom?: string; created_at?: string }>;
  stress_text?: string;
  lesson_text?: string;
  note_text?: string;
  stress_entries?: Array<{ id?: string; text?: string; created_at?: string }>;
  lesson_entries?: Array<{ id?: string; text?: string; created_at?: string }>;
  note_entries?: Array<{ id?: string; text?: string; created_at?: string }>;
  updated_at?: string;
  deleted?: boolean;
};

export const DAY_JOURNAL_SECTION_META: Record<
  DayJournalSectionId,
  { title: string; emoji: string }
> = {
  gratitude: { title: 'Практика благодарности', emoji: '🌟' },
  stress: { title: 'Рефлексия и стресс', emoji: '💡' },
  lesson: { title: 'Урок дня', emoji: '💡' },
  note: { title: 'Заметка дня', emoji: '📖' },
};

import { localDateKey, parseServerDate } from './datetime';

export function todayDateKey(): string {
  return localDateKey(new Date());
}

export function normalizeDateKey(value: string | Date | undefined): string {
  if (!value) return todayDateKey();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : parseServerDate(value);
  if (Number.isNaN(d.getTime())) return todayDateKey();
  return localDateKey(d);
}

export function formatDayJournalDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return localDateKey(dt);
}

function gratitudeItemText(item: { what?: string; whom?: string }) {
  const what = item?.what?.trim() || '';
  const whom = item?.whom?.trim() || '';
  if (what && whom) return `${what} — ${whom}`;
  return what || whom;
}

export type DayJournalBlock = {
  key: string;
  entryId: string;
  sectionId: DayJournalSectionId;
  text: string;
  title: string;
  emoji: string;
};

export function dayJournalSectionsFromEntry(entry: DayJournalEntry | null | undefined): DayJournalBlock[] {
  if (!entry) return [];
  const items: Omit<DayJournalBlock, 'title' | 'emoji'>[] = [];

  (entry.gratitude || []).forEach((g, index) => {
    const text = gratitudeItemText(g);
    if (text) {
      const entryId = g?.id != null && String(g.id) !== '' ? String(g.id) : `gratitude-${index}`;
      items.push({ key: `gratitude-${entryId}`, entryId, sectionId: 'gratitude', text });
    }
  });

  const pushTextEntries = (
    list: Array<{ id?: string; text?: string }> | undefined,
    sectionId: DayJournalSectionId,
    legacyText?: string
  ) => {
    const entries = Array.isArray(list) ? list : [];
    entries.forEach((e, index) => {
      const text = String(e?.text ?? '').trim();
      if (text) {
        const entryId = e?.id != null && String(e.id) !== '' ? String(e.id) : `entry-${index}`;
        items.push({ key: `${sectionId}-${entryId}`, entryId, sectionId, text });
      }
    });
    if (!entries.length && legacyText?.trim()) {
      items.push({
        key: `${sectionId}-legacy`,
        entryId: 'legacy',
        sectionId,
        text: legacyText.trim(),
      });
    }
  };

  pushTextEntries(entry.stress_entries, 'stress', entry.stress_text);
  pushTextEntries(entry.lesson_entries, 'lesson', entry.lesson_text);
  pushTextEntries(entry.note_entries, 'note', entry.note_text);

  return items.map((item) => ({
    ...item,
    ...DAY_JOURNAL_SECTION_META[item.sectionId],
  }));
}

export function dayJournalListDates(entries: DayJournalEntry[]): string[] {
  const today = todayDateKey();
  const dates = new Set(entries.map((j) => normalizeDateKey(j.entry_date)));
  dates.add(today);
  return Array.from(dates).sort((a, b) => {
    if (a === today) return -1;
    if (b === today) return 1;
    return b.localeCompare(a);
  });
}

export function findDayJournalByDate(
  entries: DayJournalEntry[],
  dateKey: string
): DayJournalEntry | undefined {
  const key = normalizeDateKey(dateKey);
  return entries.find((j) => normalizeDateKey(j.entry_date) === key);
}
