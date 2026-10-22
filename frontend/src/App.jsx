import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getOAuthMeta } from './oauthUi.js';
import { applyTheme } from './theme.js';
import {
  avatarSourceHint,
  avatarUploadErrorMessage,
  MAX_AVATAR_FILE_MB,
  clearUserAvatar,
  persistAvatarInStorage,
  readImageFileAsDataUrl,
  uploadUserAvatar,
} from './userAvatar.js';
import {
  formatLocalDate,
  formatLocalTime as formatTime,
  normalizeDateKey,
  parseServerDate,
  sameLocalCalendarDay as sameCalendarDay,
  todayDateKey,
} from './datetime.js';

const MOOD_EMOJIS = ['😊', '😌', '😐', '😔', '😢', '😤', '🤔', '😠', '🥳', '😴'];

const MOOD_LABELS = {
  '😊': 'Радость',
  '😌': 'Спокойствие',
  '😐': 'Нейтрально',
  '😔': 'Грусть',
  '😢': 'Печаль',
  '😤': 'Раздражение',
  '🤔': 'Задумчивость',
  '😠': 'Злость',
  '🥳': 'Восторг',
  '😴': 'Усталость',
};

function moodLabel(emoji) {
  return MOOD_LABELS[emoji] ?? 'Настроение';
}

function ProfileIconSvg({ className = 'w-5 h-5 text-warm-800 dark:text-warm-100' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

function findDayJournalByDate(entries, dateKey) {
  const key = normalizeDateKey(dateKey);
  return entries.find((j) => normalizeDateKey(j.entry_date) === key);
}

function gratitudeTextFromEntry(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return raw.trim();
    }
  }
  if (!Array.isArray(raw)) return '';
  return raw
    .map((item) => {
      const what = item?.what?.trim() || '';
      const whom = item?.whom?.trim() || '';
      if (what && whom) return `${what} — ${whom}`;
      return what || whom;
    })
    .filter(Boolean)
    .join('\n');
}

function formatDayJournalDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const DAY_JOURNAL_SECTION_META = {
  gratitude: { title: 'Практика благодарности', emoji: '🌟' },
  stress: { title: 'Рефлексия и стресс', emoji: '💡' },
  lesson: { title: 'Урок дня', emoji: '💡' },
  note: { title: 'Заметка дня', emoji: '📖' },
};

function gratitudeItemText(item) {
  const what = item?.what?.trim() || '';
  const whom = item?.whom?.trim() || '';
  if (what && whom) return `${what} — ${whom}`;
  return what || whom;
}

function dayJournalSectionsFromEntry(entry) {
  if (!entry) return [];
  const items = [];

  (entry.gratitude || []).forEach((g, index) => {
    const text = gratitudeItemText(g);
    if (text) {
      const entryId =
        g?.id != null && String(g.id) !== ''
          ? String(g.id)
          : `gratitude-${index}`;
      items.push({
        key: `gratitude-${entryId}`,
        entryId,
        sectionId: 'gratitude',
        text,
      });
    }
  });

  const pushTextEntries = (list, sectionId, legacyText) => {
    const entries = Array.isArray(list) ? list : [];
    entries.forEach((e, index) => {
      const text = String(e?.text ?? '').trim();
      if (text) {
        const entryId =
          e?.id != null && String(e.id) !== '' ? String(e.id) : `entry-${index}`;
        items.push({
          key: `${sectionId}-${entryId}`,
          entryId,
          sectionId,
          text,
        });
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
    emoji: DAY_JOURNAL_SECTION_META[item.sectionId].emoji,
  }));
}

function dayJournalListDates(entries) {
  const today = todayDateKey();
  const dates = new Set(entries.map((j) => normalizeDateKey(j.entry_date)));
  dates.add(today);
  return Array.from(dates).sort((a, b) => {
    if (a === today) return -1;
    if (b === today) return 1;
    return b.localeCompare(a);
  });
}

function InsightIcon({
  className = 'w-5 h-5 shrink-0 text-accent-600 dark:text-accent-400',
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function PencilIcon({ className = 'w-4 h-4 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon({ className = 'w-4 h-4 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CheckIcon({ className = 'w-3.5 h-3.5 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ArchiveIcon({ className = 'w-3.5 h-3.5 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function RestoreIcon({ className = 'w-3.5 h-3.5 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function DayJournalBlockIcon({ blockId, emoji }) {
  if (blockId === 'stress') {
    return <InsightIcon className="w-4 h-4 inline-block align-text-bottom mr-0.5" />;
  }
  return (
    <span className={`${emojiPeachClass} mr-0.5`} aria-hidden>
      {emoji}
    </span>
  );
}

function UserAvatarImg({ url, className }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
    />
  );
}
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function saveErrorFromAxios(err) {
  const status = err.response?.status;
  const serverMsg = err.response?.data?.message;
  return (
    serverMsg ||
    (status === 404
      ? 'Сервер не поддерживает сохранение. Перезапустите backend: node server.js'
      : 'Не удалось сохранить. Проверьте подключение к серверу.')
  );
}

function last15Days() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 15; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

function startOfLocalDay(dateInput) {
  const d = parseServerDate(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

function habitLogDateSet(logs) {
  const set = new Set();
  (logs || []).forEach((log) => {
    const day = startOfLocalDay(log);
    if (!Number.isNaN(day.getTime())) set.add(day.toDateString());
  });
  return set;
}

function computeHabitAnalytics(item) {
  const logSet = habitLogDateSet(item.logs);
  const completed = logSet.size;
  const created = startOfLocalDay(item.createdAt || Date.now());
  const today = startOfLocalDay(new Date());
  const end =
    item.status === 'archived' && item.archivedAt
      ? startOfLocalDay(item.archivedAt)
      : today;
  const rangeEnd = end < created ? created : end;

  let missed = 0;
  for (let d = new Date(created); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    if (!logSet.has(d.toDateString())) missed++;
  }

  let streak = 0;
  const cursor = new Date(rangeEnd);
  if (!logSet.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (cursor >= created) {
    if (logSet.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }

  const activityDates = [...logSet]
    .map((s) => new Date(s))
    .sort((a, b) => b - a);

  return { completed, streak, missed, activityDates, logSet };
}

function CloseIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function HabitDayStatusMark({ done }) {
  if (done) {
    return (
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${borderFrame} bg-rose-50/95 dark:bg-rose-300/12 shrink-0`}
        aria-hidden
      >
        <CheckIcon className="w-3.5 h-3.5 text-accent-700 dark:text-accent-400" />
      </span>
    );
  }
  return (
    <span
      className="inline-block w-5 h-5 rounded-full border-2 border-warm-300 dark:border-warm-500 shrink-0 opacity-70"
      aria-hidden
    />
  );
}

function dayJournalAnalyticsPanelClass(sectionId) {
  const base = 'rounded-lg border p-3';
  if (sectionId === 'gratitude') {
    return `${base} border-rose-200 dark:border-rose-300/35 bg-rose-50/95 dark:bg-rose-300/10`;
  }
  if (sectionId === 'stress') {
    return `${base} border-orange-200 dark:border-orange-300/35 bg-orange-50/85 dark:bg-orange-300/10`;
  }
  if (sectionId === 'lesson') {
    return `${base} border-accent-200/80 dark:border-accent-400/30 bg-warm-50/90 dark:bg-cocoa-800/50`;
  }
  return `${base} border-warm-200 dark:border-warm-400/25 bg-cream-50/90 dark:bg-cocoa-800/40`;
}

const analyticsModalSectionTitle =
  'text-base font-bold text-warm-900 dark:text-warm-50 mb-3 tracking-tight';

const analyticsModalPanels = {
  mood: `rounded-xl border border-rose-200 dark:border-rose-300/35 bg-gradient-to-br from-rose-50/95 via-rose-50/60 to-white/80 dark:from-rose-300/14 dark:via-rose-300/6 dark:to-cocoa-900/20 p-4 shadow-sm`,
  habits: `rounded-xl border border-orange-200 dark:border-orange-300/30 bg-gradient-to-br from-orange-50/90 via-orange-50/50 to-white/70 dark:from-orange-300/10 dark:to-cocoa-900/20 p-4 shadow-sm`,
  achievements: `rounded-xl border border-rose-300/60 dark:border-rose-300/35 bg-gradient-to-br from-warm-50/95 via-rose-50/40 to-white/75 dark:from-cocoa-800/60 dark:to-cocoa-900/30 p-4 shadow-sm`,
  day: `rounded-xl border border-warm-200 dark:border-warm-400/22 bg-gradient-to-br from-warm-50/95 via-cream-50/50 to-white/70 dark:from-cocoa-800/50 dark:to-cocoa-900/25 p-4 shadow-sm`,
};

function buildAnalyticsHabitItems(habits, achievements) {
  const active = (habits || []).map((h) => ({
    key: `active-${h.id}`,
    title: h.title,
    status: 'active',
    logs: h.logs || [],
    createdAt: h.created_at,
    archivedAt: null,
  }));
  const archived = (achievements || [])
    .filter((a) => String(a.type) === 'habit_archive')
    .map((a) => {
      const snap = a.habit_snapshot || {};
      return {
        key: `archive-${a.id}`,
        title: String(snap.title || a.title || '').trim() || 'Привычка',
        status: 'archived',
        logs: Array.isArray(snap.logs) ? snap.logs : [],
        createdAt: snap.created_at || a.completed_at,
        archivedAt: a.completed_at,
      };
    });
  return [...active, ...archived];
}

function achievementTypeLabel(a) {
  if (a.type === 'habit_archive') return 'Архив привычки';
  if (a.type === 'habit_milestone') {
    const d = a.milestone_day;
    return d ? `Веха привычки — ${d} дней` : 'Веха привычки';
  }
  return 'Ручное достижение';
}

function achievementAllowsDelete(a) {
  const t = String(a.type);
  return t === 'manual_achievement' || t === 'habit_archive';
}

function achievementsForHall(achievements) {
  return (achievements || []).filter((a) => !a.hidden_from_hall);
}

const emojiPeachClass = 'emoji-peach leading-none select-none';

const borderFrame = 'border-rose-200 dark:border-rose-300/35';
const borderDivider = 'border-rose-100 dark:border-rose-300/28';
const borderFrameStrong = 'border-rose-300 dark:border-rose-300/45';

const cardClass =
  `app-card rounded-2xl shadow-soft dark:shadow-soft-dark border ${borderFrame} bg-white p-4 md:p-5 text-warm-900 dark:text-warm-50`;
const btnPrimary =
  'btn-peach px-4 py-2 rounded-xl transition-colors disabled:opacity-50 shadow-sm';
const inputClass =
  `app-input w-full rounded-xl border ${borderFrame} bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300/70 dark:focus:ring-rose-300/40 text-warm-900 dark:text-warm-50 placeholder:text-warm-400 dark:placeholder:text-warm-300`;

const habitCardClass =
  'app-card rounded-2xl p-4 border text-warm-900 dark:text-warm-50';
const fillWillDo = 'habit-fill-will-do';
const fillWontDo = 'habit-fill-wont-do';
const fillBasic =
  'bg-rose-50/90 dark:bg-rose-300/10 border-rose-200 dark:border-rose-300/35';
const habitRowIconBtn =
  `inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200/90 dark:border-rose-300/22 bg-rose-50/95 dark:bg-cocoa-800 text-warm-800 dark:text-warm-100 shadow-sm hover:bg-rose-100/90 dark:hover:bg-cocoa-750 transition-colors touch-manipulation`;
const navActiveClass = 'nav-link-active font-semibold';

const habitActionBtn =
  `text-sm font-medium text-warm-800 dark:text-warm-100 bg-warm-100 dark:bg-cocoa-800 border ${borderFrame} px-3 py-1 rounded-lg shadow-sm hover:bg-warm-200 dark:hover:bg-cocoa-700 transition-colors`;

const archiveEntryIconBtn =
  `inline-flex items-center justify-center p-1.5 rounded-md border ${borderFrame} bg-warm-100 dark:bg-cocoa-800 text-warm-800 dark:text-warm-100 shadow-sm hover:bg-warm-200 dark:hover:bg-cocoa-700 transition-colors touch-manipulation`;

const listRowIconActions = 'flex flex-row gap-1 shrink-0 self-center';
const listRowIconSize = 'w-3.5 h-3.5';

const oauthBtnBase =
  `w-full flex items-center justify-center gap-2 py-2.5 rounded-xl ${habitActionBtn}`;

const mutedText = 'text-warm-500 dark:text-warm-300';
const subtleText = 'text-warm-400 dark:text-warm-300';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [authMode, setAuthMode] = useState('login');
  const [authIdentifier, setAuthIdentifier] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail') || '');
  const [userPhone, setUserPhone] = useState(localStorage.getItem('userPhone') || '');
  const [userAvatarUrl, setUserAvatarUrl] = useState(localStorage.getItem('userAvatarUrl') || '');
  const [userAvatarSource, setUserAvatarSource] = useState(null);
  const [userOauthProvider, setUserOauthProvider] = useState(null);
  const [avatarError, setAvatarError] = useState('');
  const [darkTheme, setDarkTheme] = useState(localStorage.getItem('theme') === 'dark');

  const [moods, setMoods] = useState([]);
  const [habits, setHabits] = useState([]);
  const [basics, setBasics] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [diary, setDiary] = useState([]);
  const [dayJournals, setDayJournals] = useState([]);

  const [selectedEmoji, setSelectedEmoji] = useState('😊');
  const [moodText, setMoodText] = useState('');
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitType, setNewHabitType] = useState('will_do');
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editHabitTitle, setEditHabitTitle] = useState('');
  const [editHabitType, setEditHabitType] = useState('will_do');
  const [habitEditError, setHabitEditError] = useState('');
  const [inlineEdit, setInlineEdit] = useState(null);
  const [inlineEditError, setInlineEditError] = useState('');
  const [wantTitle, setWantTitle] = useState('');
  const [canTitle, setCanTitle] = useState('');
  const [achievementTitle, setAchievementTitle] = useState('');
  const [gratitudeText, setGratitudeText] = useState('');
  const [stressText, setStressText] = useState('');
  const [lessonText, setLessonText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [dayJournalDate, setDayJournalDate] = useState(todayDateKey);
  const [dayJournalError, setDayJournalError] = useState('');
  const [dayJournalErrorSection, setDayJournalErrorSection] = useState('');
  const [dayJournalSavingSection, setDayJournalSavingSection] = useState('');
  const [dayJournalSavedSection, setDayJournalSavedSection] = useState('');
  const dayJournalsRef = useRef([]);
  const [expandedJournalDates, setExpandedJournalDates] = useState(() => new Set());
  const [archiveEntryEdit, setArchiveEntryEdit] = useState(null);
  const [archiveEntryDelete, setArchiveEntryDelete] = useState(null);
  const [archiveEntrySaving, setArchiveEntrySaving] = useState(false);
  const [habitRestoreId, setHabitRestoreId] = useState(null);
  const [achievementDeleteId, setAchievementDeleteId] = useState(null);
  const [achievementDeleteSaving, setAchievementDeleteSaving] = useState(false);
  const [achievementDeleteError, setAchievementDeleteError] = useState('');
  const [moodDeleteId, setMoodDeleteId] = useState(null);
  const [moodDeleteSaving, setMoodDeleteSaving] = useState(false);
  const [moodDeleteError, setMoodDeleteError] = useState('');
  const [basicDeleteId, setBasicDeleteId] = useState(null);
  const [basicDeleteSaving, setBasicDeleteSaving] = useState(false);
  const [basicDeleteError, setBasicDeleteError] = useState('');
  const [analyticsDay, setAnalyticsDay] = useState(null);
  const [expandedAnalyticsHabits, setExpandedAnalyticsHabits] = useState(() => new Set());
  const [oauthProviders, setOauthProviders] = useState([]);

  const clearDayJournalForm = useCallback(() => {
    setGratitudeText('');
    setStressText('');
    setLessonText('');
    setNoteText('');
  }, []);

  const clearDayJournalSectionField = useCallback((section) => {
    if (section === 'gratitude') setGratitudeText('');
    if (section === 'stress') setStressText('');
    if (section === 'lesson') setLessonText('');
    if (section === 'note') setNoteText('');
  }, []);

  useEffect(() => {
    dayJournalsRef.current = dayJournals;
  }, [dayJournals]);

  useEffect(() => {
    if (currentScreen !== 'diary') return;
    clearDayJournalForm();
  }, [currentScreen, dayJournalDate, clearDayJournalForm]);

  const persistAuthProfile = useCallback(({ email: em, phone: ph }) => {
    if (ph) {
      localStorage.setItem('userPhone', ph);
      localStorage.removeItem('userEmail');
      setUserPhone(ph);
      setUserEmail('');
      return;
    }
    if (em) {
      localStorage.setItem('userEmail', em);
      localStorage.removeItem('userPhone');
      setUserEmail(em);
      setUserPhone('');
    }
  }, []);

  const applyUserAvatar = useCallback((url, source = null) => {
    const next = url || '';
    setUserAvatarUrl(next);
    setUserAvatarSource(source);
    persistAvatarInStorage(next);
  }, []);

  const goLogin = useCallback(() => {
    delete axios.defaults.headers.common.Authorization;
    localStorage.removeItem('token');
    localStorage.removeItem('userAvatarUrl');
    setUserAvatarUrl('');
    setUserAvatarSource(null);
    setUserOauthProvider(null);
    sessionStorage.removeItem('want_register');
    setCurrentScreen('login');
  }, []);

  const openRegisterForm = useCallback(() => {
    sessionStorage.setItem('want_register', '1');
    delete axios.defaults.headers.common.Authorization;
    localStorage.removeItem('token');
    setAuthMode('register');
    setAuthError('');
    setCurrentScreen('login');
    setLoading(false);
  }, []);

  const loadUserData = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/user/data');
      if (data.user) {
        persistAuthProfile({ email: data.user.email, phone: data.user.phone });
        applyUserAvatar(data.user.avatar_url, data.user.avatar_source);
        setUserOauthProvider(data.user.oauth_provider || null);
      }
      setMoods(data.moods || []);
      setHabits(data.habits || []);
      setBasics(data.basics || []);
      setAchievements(data.achievements || []);
      setDiary(data.diary || []);
      const journals = data.day_journals || [];
      setDayJournals(journals);
      dayJournalsRef.current = journals;
      setCurrentScreen('main');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        goLogin();
        return;
      }
      if (status === 500) {
        goLogin();
        setAuthError(
          'Не удалось загрузить данные. Перезапустите backend и примените миграции БД (migrate-achievement-hidden-hall.sql).'
        );
        return;
      }
      goLogin();
      setAuthError(saveErrorFromAxios(err));
    }
  }, [goLogin, persistAuthProfile, applyUserAvatar]);

  const openLoginForm = useCallback(() => {
    sessionStorage.removeItem('want_register');
    setAuthMode('login');
    setAuthError('');
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      setLoading(true);
      loadUserData().finally(() => setLoading(false));
      return;
    }
    setCurrentScreen('login');
  }, [loadUserData]);

  useEffect(() => {
    axios
      .get('/api/auth/providers')
      .then((res) =>
        setOauthProviders((res.data.providers || []).filter((p) => p !== 'dev'))
      )
      .catch(() => setOauthProviders([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const oauthError = params.get('oauth_error');

    if (oauthError) {
      setAuthError('Не удалось войти через внешний сервис. Попробуйте снова или используйте email.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (oauthToken) {
      sessionStorage.removeItem('want_register');
      localStorage.setItem('token', oauthToken);
      const em = params.get('email');
      if (em) {
        persistAuthProfile({ email: em });
      }
      axios.defaults.headers.common.Authorization = `Bearer ${oauthToken}`;
      window.history.replaceState({}, '', window.location.pathname);
      loadUserData().finally(() => setLoading(false));
      return;
    }

    if (sessionStorage.getItem('want_register')) {
      setLoading(false);
      setAuthMode('register');
      setCurrentScreen('login');
      return;
    }

    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      loadUserData().finally(() => setLoading(false));
    } else {
      setLoading(false);
      setCurrentScreen('login');
    }
  }, [loadUserData, persistAuthProfile]);

  const startOAuth = (provider) => {
    sessionStorage.removeItem('want_register');
    window.location.href = `/api/auth/${provider}`;
  };

  const toggleTheme = () => {
    const next = !darkTheme;
    setDarkTheme(next);
    applyTheme(next);
  };

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const savedUrl = await uploadUserAvatar(axios, dataUrl);
      applyUserAvatar(savedUrl, 'manual');
    } catch (err) {
      setAvatarError(avatarUploadErrorMessage(err));
    }
  };

  const removeAvatar = async () => {
    setAvatarError('');
    try {
      await clearUserAvatar(axios);
      applyUserAvatar('', null);
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Не удалось удалить фото');
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const authBody =
        authIdentifier === 'phone'
          ? { phone, password }
          : { email, password };

      if (authMode === 'register') {
        await axios.post('/api/auth/register', authBody);
        sessionStorage.removeItem('want_register');
        setAuthMode('login');
        setAuthError('');
        alert('Регистрация успешна. Теперь войдите с тем же email или телефоном и паролем.');
        return;
      }
      const { data } = await axios.post('/api/auth/login', authBody);
      sessionStorage.removeItem('want_register');
      localStorage.setItem('token', data.token);
      persistAuthProfile({ email: data.email || email, phone: data.phone });
      if (data.avatar_url) {
        applyUserAvatar(data.avatar_url, data.avatar_source || null);
      }
      axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      await loadUserData();
      setPassword('');
    } catch (err) {
      const msg = err.response?.data?.message;
      setAuthError(
        msg === 'SOCIAL_LOGIN_ONLY' || msg?.includes('social login')
          ? 'Этот email привязан к Google или другой соцсети. Войдите кнопкой Google ниже, а не паролем.'
          : msg === 'Invalid credentials'
            ? 'Неверные данные. Сначала зарегистрируйтесь на вкладке «Зарегистрироваться».'
            : msg || 'Ошибка авторизации'
      );
    }
  };

  const handleLogout = () => {
    goLogin();
    setMoods([]);
    setHabits([]);
    setBasics([]);
    setAchievements([]);
    setDiary([]);
    setDayJournals([]);
    clearDayJournalForm();
    setDayJournalDate(todayDateKey());
    setEmail('');
    setPassword('');
  };

  const saveMood = async () => {
    const { data } = await axios.post('/api/moods', {
      emoji: selectedEmoji,
      text_reason: moodText,
    });
    setMoods((prev) => [data, ...prev]);
    setMoodText('');
  };

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    const { data } = await axios.post('/api/habits', {
      title: newHabitTitle.trim(),
      type: newHabitType,
    });
    setHabits((prev) => [data, ...prev]);
    setNewHabitTitle('');
  };

  const logHabit = async (id) => {
    const { data } = await axios.put(`/api/habits/${id}/log`);
    const habit = data.habit ?? data;
    const newAchievements = data.newAchievements ?? [];
    setHabits((prev) => prev.map((h) => (Number(h.id) === Number(id) ? habit : h)));
    if (newAchievements.length > 0) {
      setAchievements((prev) => [...newAchievements, ...prev]);
    }
  };

  const archiveHabit = async (id) => {
    const { data } = await axios.delete(`/api/habits/${id}/archive`);
    setHabits((prev) => prev.filter((h) => h.id !== id));
    if (editingHabitId === id) setEditingHabitId(null);
    if (data.achievement) {
      setAchievements((prev) => [data.achievement, ...prev]);
    }
  };

  const requestAchievementDelete = (achievementId) => {
    cancelInlineEdit();
    setAchievementDeleteError('');
    setAchievementDeleteId(achievementId);
  };

  const cancelAchievementDelete = () => {
    if (achievementDeleteSaving) return;
    setAchievementDeleteId(null);
    setAchievementDeleteError('');
  };

  const confirmAchievementDelete = async (achievementId) => {
    const targetId = achievementId ?? achievementDeleteId;
    if (targetId == null || targetId === '' || achievementDeleteSaving) return;
    setAchievementDeleteSaving(true);
    setAchievementDeleteError('');
    try {
      const { data } = await axios.post(`/api/achievements/${targetId}/delete`);
      if (!data?.ok) {
        throw new Error('Не удалось удалить достижение');
      }
      const idKey = String(targetId);
      if (data.hiddenFromHall && data.achievement) {
        setAchievements((prev) =>
          prev.map((a) => (String(a.id) === idKey ? data.achievement : a)),
        );
      } else {
        setAchievements((prev) => prev.filter((a) => String(a.id) !== idKey));
      }
      setAchievementDeleteId(null);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 404
          ? 'Сервер не знает про удаление. Перезапустите backend: node server.js'
          : saveErrorFromAxios(err));
      setAchievementDeleteError(msg);
    } finally {
      setAchievementDeleteSaving(false);
    }
  };

  const restoreArchivedHabit = async (achievementId) => {
    if (habitRestoreId != null) return;
    setHabitRestoreId(achievementId);
    try {
      const { data } = await axios.post(`/api/achievements/${achievementId}/restore-habit`);
      if (data.habit) {
        setHabits((prev) => [data.habit, ...prev]);
      }
      setAchievements((prev) => prev.filter((a) => Number(a.id) !== Number(achievementId)));
      cancelInlineEdit();
    } catch (err) {
      alert(saveErrorFromAxios(err));
    } finally {
      setHabitRestoreId(null);
    }
  };

  const startEditHabit = (habit) => {
    cancelInlineEdit();
    setHabitEditError('');
    setEditingHabitId(habit.id);
    setEditHabitTitle(habit.title);
    setEditHabitType(habit.type);
  };

  const cancelEditHabit = () => {
    setEditingHabitId(null);
    setEditHabitTitle('');
    setEditHabitType('will_do');
    setHabitEditError('');
  };

  const saveEditHabit = async (e) => {
    e.preventDefault();
    setHabitEditError('');
    const id = editingHabitId;
    if (id == null || !editHabitTitle.trim()) return;
    try {
      const { data } = await axios.put(`/api/habits/${id}`, {
        title: editHabitTitle.trim(),
        type: editHabitType,
      });
      setHabits((prev) =>
        prev.map((h) => (Number(h.id) === Number(id) ? data : h)),
      );
      cancelEditHabit();
    } catch (err) {
      setHabitEditError(saveErrorFromAxios(err));
    }
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
    setInlineEditError('');
  };

  const patchInlineEdit = (patch) => {
    setInlineEdit((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const requestMoodDelete = (moodId) => {
    cancelInlineEdit();
    cancelBasicDelete();
    setMoodDeleteError('');
    setMoodDeleteId(moodId);
  };

  const cancelMoodDelete = () => {
    if (moodDeleteSaving) return;
    setMoodDeleteId(null);
    setMoodDeleteError('');
  };

  const confirmMoodDelete = async (moodId) => {
    const targetId = moodId ?? moodDeleteId;
    if (targetId == null || targetId === '' || moodDeleteSaving) return;
    setMoodDeleteSaving(true);
    setMoodDeleteError('');
    try {
      const { data } = await axios.post(`/api/moods/${targetId}/delete`);
      if (!data?.ok) {
        throw new Error('Не удалось удалить запись');
      }
      const idKey = String(targetId);
      setMoods((prev) => prev.filter((m) => String(m.id) !== idKey));
      setMoodDeleteId(null);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 404
          ? 'Сервер не знает про удаление. Перезапустите backend: node server.js'
          : saveErrorFromAxios(err));
      setMoodDeleteError(msg);
    } finally {
      setMoodDeleteSaving(false);
    }
  };

  const requestBasicDelete = (basicId) => {
    cancelInlineEdit();
    setBasicDeleteError('');
    setBasicDeleteId(basicId);
  };

  const cancelBasicDelete = () => {
    if (basicDeleteSaving) return;
    setBasicDeleteId(null);
    setBasicDeleteError('');
  };

  const confirmBasicDelete = async (basicId) => {
    const targetId = basicId ?? basicDeleteId;
    if (targetId == null || targetId === '' || basicDeleteSaving) return;
    setBasicDeleteSaving(true);
    setBasicDeleteError('');
    try {
      const { data } = await axios.post(`/api/basics/${targetId}/delete`);
      if (!data?.ok) {
        throw new Error('Не удалось удалить пункт');
      }
      const idKey = String(targetId);
      setBasics((prev) => prev.filter((b) => String(b.id) !== idKey));
      setBasicDeleteId(null);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 404
          ? 'Сервер не знает про удаление. Перезапустите backend: node server.js'
          : saveErrorFromAxios(err));
      setBasicDeleteError(msg);
    } finally {
      setBasicDeleteSaving(false);
    }
  };

  const startInlineEdit = (type, item) => {
    cancelEditHabit();
    cancelMoodDelete();
    cancelBasicDelete();
    setInlineEditError('');
    if (type === 'mood') {
      setInlineEdit({
        type,
        id: item.id,
        text: item.text_reason || '',
        emoji: item.emoji,
      });
    } else if (type === 'diary') {
      setInlineEdit({ type, id: item.id, text: item.text_reflection });
    } else if (type === 'basic') {
      setInlineEdit({ type, id: item.id, text: item.title, basicType: item.type });
    } else if (type === 'achievement') {
      setInlineEdit({ type, id: item.id, text: item.title });
    }
  };

  const isInlineEditing = (type, id) =>
    inlineEdit?.type === type && Number(inlineEdit.id) === Number(id);

  const saveInlineEdit = async (e) => {
    e.preventDefault();
    if (!inlineEdit) return;
    if (inlineEdit.type !== 'mood' && !inlineEdit.text?.trim()) return;
    setInlineEditError('');
    const id = inlineEdit.id;
    try {
      let data;
      switch (inlineEdit.type) {
        case 'mood':
          ({ data } = await axios.put(`/api/moods/${id}`, {
            emoji: inlineEdit.emoji,
            text_reason: inlineEdit.text.trim() || null,
          }));
          setMoods((prev) => prev.map((m) => (Number(m.id) === Number(id) ? data : m)));
          break;
        case 'diary':
          ({ data } = await axios.put(`/api/diary/${id}`, {
            text_reflection: inlineEdit.text.trim(),
          }));
          setDiary((prev) => prev.map((d) => (Number(d.id) === Number(id) ? data : d)));
          break;
        case 'basic':
          ({ data } = await axios.put(`/api/basics/${id}`, {
            title: inlineEdit.text.trim(),
            type: inlineEdit.basicType,
          }));
          setBasics((prev) => prev.map((b) => (Number(b.id) === Number(id) ? data : b)));
          break;
        case 'achievement':
          ({ data } = await axios.put(`/api/achievements/${id}`, {
            title: inlineEdit.text.trim(),
          }));
          setAchievements((prev) => prev.map((a) => (Number(a.id) === Number(id) ? data : a)));
          break;
        default:
          return;
      }
      cancelInlineEdit();
    } catch (err) {
      setInlineEditError(saveErrorFromAxios(err));
    }
  };

  const addBasic = async (type, title, clear) => {
    if (!title.trim()) return;
    const { data } = await axios.post('/api/basics', { type, title: title.trim() });
    setBasics((prev) => [data, ...prev]);
    clear('');
  };

  const completeBasic = async (id) => {
    const { data } = await axios.post(`/api/basics/${id}/complete`);
    setBasics((prev) => prev.filter((b) => b.id !== id));
    setAchievements((prev) => [data.achievement, ...prev]);
  };

  const addAchievement = async (e) => {
    e.preventDefault();
    if (!achievementTitle.trim()) return;
    const { data } = await axios.post('/api/achievements', {
      title: achievementTitle.trim(),
      type: 'manual_achievement',
    });
    setAchievements((prev) => [data, ...prev]);
    setAchievementTitle('');
  };

  const applyDayJournalResponse = useCallback((data) => {
    if (data?.deleted) {
      setDayJournals((prev) => {
        const next = prev.filter(
          (j) => normalizeDateKey(j.entry_date) !== normalizeDateKey(data.entry_date)
        );
        dayJournalsRef.current = next;
        return next;
      });
      return;
    }
    const saved = {
      ...data,
      entry_date: normalizeDateKey(data.entry_date),
    };
    setDayJournals((prev) => {
      const rest = prev.filter(
        (j) => normalizeDateKey(j.entry_date) !== saved.entry_date
      );
      const next = [saved, ...rest].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      dayJournalsRef.current = next;
      return next;
    });
  }, []);

  const persistDayJournal = async (activeSection) => {
    const textBySection = {
      gratitude: gratitudeText.trim(),
      stress: stressText.trim(),
      lesson: lessonText.trim(),
      note: noteText.trim(),
    };
    const text = textBySection[activeSection];
    const { data } = await axios.post('/api/day-journal/entry', {
      entry_date: dayJournalDate,
      section: activeSection,
      text,
    });
    applyDayJournalResponse(data);
    clearDayJournalSectionField(activeSection);
    return data;
  };

  const isArchiveEntryEditing = (dateKey, block) =>
    archiveEntryEdit &&
    archiveEntryEdit.dateKey === normalizeDateKey(dateKey) &&
    archiveEntryEdit.entryId === block.entryId &&
    archiveEntryEdit.sectionId === block.sectionId;

  const isArchiveEntryDeletePending = (dateKey, block) =>
    archiveEntryDelete &&
    archiveEntryDelete.dateKey === normalizeDateKey(dateKey) &&
    archiveEntryDelete.entryId === block.entryId &&
    archiveEntryDelete.sectionId === block.sectionId;

  const startArchiveEntryEdit = (dateKey, block) => {
    setArchiveEntryDelete(null);
    setArchiveEntryEdit({
      dateKey: normalizeDateKey(dateKey),
      entryId: block.entryId,
      sectionId: block.sectionId,
      text: block.text,
    });
  };

  const cancelArchiveEntryEdit = () => setArchiveEntryEdit(null);

  const requestArchiveEntryDelete = (dateKey, block) => {
    setArchiveEntryEdit(null);
    setArchiveEntryDelete({
      dateKey: normalizeDateKey(dateKey),
      entryId: block.entryId,
      sectionId: block.sectionId,
    });
  };

  const cancelArchiveEntryDelete = () => setArchiveEntryDelete(null);

  const saveArchiveEntryEdit = async () => {
    if (!archiveEntryEdit?.text.trim() || archiveEntrySaving) return;
    setArchiveEntrySaving(true);
    try {
      const { data } = await axios.put('/api/day-journal/entry', {
        entry_date: archiveEntryEdit.dateKey,
        section: archiveEntryEdit.sectionId,
        entry_id: archiveEntryEdit.entryId,
        text: archiveEntryEdit.text.trim(),
      });
      applyDayJournalResponse(data);
      setArchiveEntryEdit(null);
    } catch (err) {
      alert(saveErrorFromAxios(err));
    } finally {
      setArchiveEntrySaving(false);
    }
  };

  const confirmArchiveEntryDelete = async () => {
    if (!archiveEntryDelete || archiveEntrySaving) return;
    setArchiveEntrySaving(true);
    try {
      const { data } = await axios.delete('/api/day-journal/entry', {
        data: {
          entry_date: archiveEntryDelete.dateKey,
          section: archiveEntryDelete.sectionId,
          entry_id: archiveEntryDelete.entryId,
        },
      });
      applyDayJournalResponse(data);
      setArchiveEntryDelete(null);
      setArchiveEntryEdit(null);
    } catch (err) {
      alert(saveErrorFromAxios(err));
    } finally {
      setArchiveEntrySaving(false);
    }
  };

  const saveDayJournalSection = async (section) => {
    if (dayJournalSavingSection) return;
    setDayJournalError('');
    setDayJournalErrorSection('');
    setDayJournalSavedSection('');
    const sectionFilled = {
      gratitude: () => Boolean(gratitudeText.trim()),
      stress: () => Boolean(stressText.trim()),
      lesson: () => Boolean(lessonText.trim()),
      note: () => Boolean(noteText.trim()),
    };
    if (!sectionFilled[section]?.()) {
      setDayJournalErrorSection(section);
      setDayJournalError('Заполните поле перед сохранением');
      return;
    }
    setDayJournalSavingSection(section);
    try {
      const saved = await persistDayJournal(section);
      setDayJournalSavedSection(section);
      window.setTimeout(() => setDayJournalSavedSection(''), 2500);
      if (saved?.entry_date) {
        setExpandedJournalDates((prev) => {
          const next = new Set(prev);
          next.add(normalizeDateKey(saved.entry_date));
          return next;
        });
      }
    } catch (err) {
      setDayJournalErrorSection(section);
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message;
      setDayJournalError(
        serverMsg ||
          (status === 404
            ? 'Сервер устарел: перезапустите backend (node server.js в папке backend) и обновите страницу.'
            : status === 500
              ? 'Ошибка сервера. Перезапустите backend и проверьте миграцию day_journal_entries.'
              : saveErrorFromAxios(err))
      );
    } finally {
      setDayJournalSavingSection('');
    }
  };

  const dayJournalSaveLabel = (section) =>
    dayJournalSavingSection === section ? 'Сохранение…' : 'Сохранить';

  const dayJournalSectionFeedback = (section) => {
    if (dayJournalErrorSection === section && dayJournalError) {
      return (
        <p className="text-sm text-accent-700 dark:text-accent-400 mt-2">{dayJournalError}</p>
      );
    }
    if (dayJournalSavedSection === section) {
      return <p className="text-sm text-warm-600 dark:text-warm-200 mt-2">Сохранено</p>;
    }
    return null;
  };

  const editDayJournal = (entryDate) => {
    const key = normalizeDateKey(entryDate);
    setDayJournalDate(key);
    setDayJournalError('');
    setDayJournalErrorSection('');
    setDayJournalSavedSection('');
    clearDayJournalForm();
    window.requestAnimationFrame(() => {
      document.getElementById('day-journal-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openTodayJournal = () => {
    editDayJournal(todayDateKey());
  };

  const toggleJournalArchive = (entryDate) => {
    const key = normalizeDateKey(entryDate);
    setExpandedJournalDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const resetAllData = async () => {
    if (!window.confirm('Удалить все данные? Учётная запись останется.')) return;
    await axios.delete('/api/user/reset');
    setMoods([]);
    setHabits([]);
    setBasics([]);
    setAchievements([]);
    setDiary([]);
    setDayJournals([]);
    clearDayJournalForm();
    setDayJournalDate(todayDateKey());
  };

  const analyticsModalData = useMemo(() => {
    if (!analyticsDay) return null;
    const target = analyticsDay;

    const dayMoods = moods.filter((m) => sameCalendarDay(m.created_at, target));
    const dayHabitStatuses = habits.map((h) => ({
      id: h.id,
      title: h.title,
      completed: (h.logs || []).some((log) => sameCalendarDay(log, target)),
    }));
    const dayAchievements = achievements.filter((a) =>
      sameCalendarDay(a.completed_at, target)
    );
    const dayDiary = diary.filter((d) => sameCalendarDay(d.created_at, target));
    const dayJournal = dayJournals.find((j) => {
      const [y, m, d] = normalizeDateKey(j.entry_date).split('-').map(Number);
      const entryDay = new Date(y, m - 1, d);
      return sameCalendarDay(entryDay, target);
    });

    return { dayMoods, dayHabitStatuses, dayAchievements, dayDiary, dayJournal };
  }, [analyticsDay, moods, habits, achievements, diary, dayJournals]);

  const analyticsHabitItems = useMemo(
    () => buildAnalyticsHabitItems(habits, achievements),
    [habits, achievements]
  );

  const toggleAnalyticsHabit = (key) => {
    setExpandedAnalyticsHabits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const navItems = [
    { id: 'main', label: 'Главная' },
    { id: 'diary', label: 'Твой день' },
    { id: 'hall', label: 'Достижения' },
    { id: 'analytics', label: 'Аналитика' },
    { id: 'settings', label: 'Настройки' },
  ];

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${mutedText}`}>
        Загрузка…
      </div>
    );
  }

  if (currentScreen === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className={`${cardClass} w-full max-w-md`}>
          <h1 className="text-2xl font-bold text-center mb-1">Мой Путь</h1>
          <p className={`text-center text-sm mb-6 ${mutedText}`}>
            Психологический трекер осознанности
          </p>
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                authMode === 'login' ? btnPrimary : habitActionBtn
              }`}
              onClick={openLoginForm}
            >
              Войти
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                authMode === 'register' ? btnPrimary : habitActionBtn
              }`}
              onClick={openRegisterForm}
            >
              Зарегистрироваться
            </button>
          </div>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                authIdentifier === 'email' ? navActiveClass : habitActionBtn
              }`}
              onClick={() => setAuthIdentifier('email')}
            >
              Email
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                authIdentifier === 'phone' ? navActiveClass : habitActionBtn
              }`}
              onClick={() => setAuthIdentifier('phone')}
            >
              Телефон
            </button>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authIdentifier === 'email' ? (
              <div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  aria-label="Email"
                  className={inputClass}
                  placeholder="maria.ivanova@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="text-sm text-warm-600 dark:text-warm-200">Номер телефона</label>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  className={inputClass}
                  placeholder="+7 900 123-45-67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-warm-600 dark:text-warm-200">Пароль</label>
              <input
                type="password"
                required
                minLength={6}
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {authError && <p className="text-sm text-accent-700 dark:text-accent-400">{authError}</p>}
            <button type="submit" className={`${btnPrimary} w-full`}>
              {authMode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          {authMode === 'login' && oauthProviders.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-rose-200 dark:bg-rose-300/30" />
                <span className={`text-xs ${mutedText}`}>или войти через</span>
                <div className="flex-1 h-px bg-rose-200 dark:bg-rose-300/30" />
              </div>
              <div className="space-y-2">
                {oauthProviders.map((provider) => {
                  const meta = getOAuthMeta(provider);
                  return (
                    <button
                      key={provider}
                      type="button"
                      className={`${oauthBtnBase} ${meta.buttonClass}`}
                      onClick={() => startOAuth(provider)}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-warm-50 dark:bg-cocoa-800 shrink-0 ${meta.iconClass}`}
                        aria-hidden
                      >
                        {meta.icon}
                      </span>
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className={`mt-4 w-full py-2 rounded-xl text-sm font-medium ${habitActionBtn}`}
          >
            {darkTheme ? '☀️ Светлая тема' : '🌙 Тёмная тема'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 md:pb-8">
      <header className={`sticky top-0 z-10 bg-ivory/80 dark:bg-cocoa-950/92 backdrop-blur-md border-b ${borderFrame} shadow-soft dark:shadow-none`}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold text-lg text-warm-900 dark:text-warm-50">Мой Путь</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentScreen('settings')}
              className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors overflow-hidden ${
                currentScreen === 'settings'
                  ? navActiveClass
                  : 'bg-warm-200 dark:bg-cocoa-800 hover:bg-warm-300 dark:hover:bg-cocoa-700'
              }`}
              aria-label="Профиль и настройки"
              title="Профиль"
            >
              {userAvatarUrl ? (
                <UserAvatarImg url={userAvatarUrl} className="w-full h-full object-cover" />
              ) : (
                <ProfileIconSvg />
              )}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="text-sm px-3 py-1.5 rounded-xl bg-warm-200 dark:bg-cocoa-800 hover:bg-warm-300 dark:hover:bg-cocoa-700 transition-colors"
              aria-label="Переключить тему"
            >
              {darkTheme ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 pb-2 hidden md:flex gap-2 flex-wrap">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentScreen(item.id)}
              className={`px-3 py-1.5 rounded-xl text-sm transition-colors ${
                currentScreen === item.id
                  ? navActiveClass
                  : 'text-warm-700 dark:text-warm-200 hover:bg-accent-100 dark:hover:bg-cocoa-800 border border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {currentScreen === 'main' && (
          <div className="space-y-6">
            <section className={cardClass}>
              <h2 className="font-semibold mb-4">Настроение</h2>
              <div className="flex w-full flex-nowrap justify-between gap-1 sm:gap-2 mb-3">
                {MOOD_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    title={moodLabel(em)}
                    aria-label={moodLabel(em)}
                    onClick={() => setSelectedEmoji(em)}
                    className={`flex-1 min-w-0 max-w-[3rem] sm:max-w-none aspect-square flex items-center justify-center text-xl sm:text-2xl rounded-xl border-2 transition-colors focus:outline-none focus-visible:outline-none ${
                      selectedEmoji === em
                        ? 'bg-rose-50 dark:bg-rose-300/15 border-rose-300 dark:border-rose-300/45'
                        : 'border-transparent hover:bg-warm-100 dark:hover:bg-cocoa-800 focus-visible:border-rose-300 dark:focus-visible:border-rose-300/55'
                    }`}
                  >
                    <span className={`${emojiPeachClass} text-xl sm:text-2xl`} aria-hidden>
                      {em}
                    </span>
                  </button>
                ))}
              </div>
              <input
                className={`${inputClass} mb-3`}
                placeholder="Почему такое настроение?"
                value={moodText}
                onChange={(e) => setMoodText(e.target.value)}
              />
              <button type="button" className={btnPrimary} onClick={saveMood}>
                Сохранить
              </button>
              <ul className="mt-4 space-y-3">
                {moods.slice(0, 3).map((m) => (
                  <li
                    key={m.id}
                    className={`text-sm border-t ${borderDivider} pt-3`}
                  >
                    {String(moodDeleteId) === String(m.id) ? (
                      <div className="space-y-2">
                        <div className="flex gap-2 items-start">
                          <span className={`${emojiPeachClass} text-xl shrink-0`}>{m.emoji}</span>
                          <span className="min-w-0">
                            {m.text_reason || '—'}
                            <span className={`block text-xs ${subtleText}`}>
                              {formatTime(m.created_at)}
                            </span>
                          </span>
                        </div>
                        <div
                          className={`rounded-lg border ${borderFrame} bg-warm-100/90 dark:bg-cocoa-900/50 p-3 space-y-2`}
                          role="alert"
                        >
                          <p className="text-sm font-medium">
                            Удалить эту запись настроения безвозвратно?
                          </p>
                          {moodDeleteError && (
                            <p className="text-sm text-accent-700 dark:text-accent-400">
                              {moodDeleteError}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`${btnPrimary} bg-accent-700 hover:bg-accent-800 dark:bg-accent-600`}
                              disabled={moodDeleteSaving}
                              onClick={() => confirmMoodDelete(m.id)}
                            >
                              {moodDeleteSaving ? 'Удаление…' : 'Да, удалить'}
                            </button>
                            <button
                              type="button"
                              className={habitActionBtn}
                              disabled={moodDeleteSaving}
                              onClick={cancelMoodDelete}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : isInlineEditing('mood', m.id) ? (
                      <form onSubmit={saveInlineEdit} className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {MOOD_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              title={moodLabel(em)}
                              aria-label={moodLabel(em)}
                              className={`text-lg p-1 rounded-lg border-2 transition-colors ${
                                inlineEdit.emoji === em
                                  ? 'border-rose-300 bg-rose-50 dark:bg-rose-300/15'
                                  : 'border-transparent hover:bg-warm-100 dark:hover:bg-cocoa-800'
                              }`}
                              onClick={() => patchInlineEdit({ emoji: em })}
                            >
                              <span className={emojiPeachClass}>{em}</span>
                            </button>
                          ))}
                        </div>
                        <input
                          className={inputClass}
                          value={inlineEdit.text}
                          onChange={(e) => patchInlineEdit({ text: e.target.value })}
                          placeholder="Почему такое настроение?"
                        />
                        {inlineEditError && (
                          <p className="text-sm text-accent-700 dark:text-accent-400">
                            {inlineEditError}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <button type="submit" className={btnPrimary}>Сохранить</button>
                          <button type="button" className={habitActionBtn} onClick={cancelInlineEdit}>
                            Отмена
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex gap-2 items-start min-w-0 flex-1">
                          <span className={`${emojiPeachClass} text-xl shrink-0`}>{m.emoji}</span>
                          <span className="min-w-0">
                            {m.text_reason || '—'}
                            <span className={`block text-xs ${subtleText}`}>
                              {formatTime(m.created_at)}
                            </span>
                          </span>
                        </div>
                        <div className={listRowIconActions}>
                          <button
                            type="button"
                            className={archiveEntryIconBtn}
                            title="Изменить"
                            aria-label="Изменить запись настроения"
                            onClick={() => startInlineEdit('mood', m)}
                          >
                            <PencilIcon className={listRowIconSize} />
                          </button>
                          <button
                            type="button"
                            className={`${archiveEntryIconBtn} text-accent-700 dark:text-accent-400`}
                            title="Удалить"
                            aria-label="Удалить запись настроения"
                            disabled={moodDeleteSaving}
                            onClick={() => requestMoodDelete(m.id)}
                          >
                            <TrashIcon className={listRowIconSize} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardClass}>
              <h2 className="font-semibold mb-4">Привычки</h2>
              <form onSubmit={addHabit} className="flex flex-col md:flex-row gap-2 mb-4">
                <input
                  className={inputClass}
                  placeholder="Новая привычка"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                />
                <select
                  className={inputClass}
                  value={newHabitType}
                  onChange={(e) => setNewHabitType(e.target.value)}
                >
                  <option value="will_do">Буду делать</option>
                  <option value="wont_do">Не буду делать</option>
                </select>
                <button type="submit" className={btnPrimary}>Добавить</button>
              </form>
              <ul className="space-y-4">
                {habits.map((h) => (
                  <li
                    key={h.id}
                    className={`${habitCardClass} ${
                      h.type === 'wont_do' ? fillWontDo : fillWillDo
                    }`}
                  >
                    {Number(editingHabitId) === Number(h.id) ? (
                      <form
                        onSubmit={saveEditHabit}
                        className="flex flex-col gap-2"
                      >
                        <input
                          className={inputClass}
                          value={editHabitTitle}
                          onChange={(e) => setEditHabitTitle(e.target.value)}
                          required
                        />
                        {habitEditError && (
                          <p className="text-sm text-accent-700 dark:text-accent-400">
                            {habitEditError}
                          </p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            className={inputClass}
                            value={editHabitType}
                            onChange={(e) => setEditHabitType(e.target.value)}
                          >
                            <option value="will_do">Буду делать</option>
                            <option value="wont_do">Не буду делать</option>
                          </select>
                          <button type="submit" className={btnPrimary}>
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className={habitActionBtn}
                            onClick={cancelEditHabit}
                          >
                            Отмена
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium flex-1 min-w-0">{h.title}</span>
                        <div className={listRowIconActions}>
                          <button
                            type="button"
                            className={habitRowIconBtn}
                            title="Изменить"
                            aria-label="Изменить привычку"
                            onClick={() => startEditHabit(h)}
                          >
                            <PencilIcon className={listRowIconSize} />
                          </button>
                          <button
                            type="button"
                            className={habitRowIconBtn}
                            title="Выполнено"
                            aria-label="Отметить выполненным"
                            onClick={() => logHabit(h.id)}
                          >
                            <CheckIcon className={listRowIconSize} />
                          </button>
                          <button
                            type="button"
                            className={habitRowIconBtn}
                            title="Убрать в архив"
                            aria-label="Убрать привычку в архив"
                            onClick={() => archiveHabit(h.id)}
                          >
                            <ArchiveIcon className={listRowIconSize} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardClass}>
              <h2 className="font-semibold mb-4">Базис</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-warm-600 dark:text-warm-200 mb-2">
                    Хочу
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addBasic('want', wantTitle, setWantTitle);
                    }}
                    className="flex gap-2 mb-3"
                  >
                    <input
                      className={inputClass}
                      value={wantTitle}
                      onChange={(e) => setWantTitle(e.target.value)}
                      placeholder="Добавить…"
                    />
                    <button type="submit" className={btnPrimary}>+</button>
                  </form>
                  <ul className="space-y-3 text-sm">
                    {basics
                      .filter((b) => b.type === 'want')
                      .map((b) => (
                        <li key={b.id} className={`${habitCardClass} ${fillBasic}`}>
                          {String(basicDeleteId) === String(b.id) ? (
                            <div className="space-y-2">
                              <span className="font-medium block">{b.title}</span>
                              <div
                                className={`rounded-lg border ${borderFrame} bg-warm-100/90 dark:bg-cocoa-900/50 p-3 space-y-2`}
                                role="alert"
                              >
                                <p className="text-sm font-medium">
                                  Удалить этот пункт безвозвратно?
                                </p>
                                {basicDeleteError && (
                                  <p className="text-sm text-accent-700 dark:text-accent-400">
                                    {basicDeleteError}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={`${btnPrimary} bg-accent-700 hover:bg-accent-800 dark:bg-accent-600`}
                                    disabled={basicDeleteSaving}
                                    onClick={() => confirmBasicDelete(b.id)}
                                  >
                                    {basicDeleteSaving ? 'Удаление…' : 'Да, удалить'}
                                  </button>
                                  <button
                                    type="button"
                                    className={habitActionBtn}
                                    disabled={basicDeleteSaving}
                                    onClick={cancelBasicDelete}
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : isInlineEditing('basic', b.id) ? (
                            <form onSubmit={saveInlineEdit} className="space-y-2">
                              <input
                                className={inputClass}
                                value={inlineEdit.text}
                                onChange={(e) => patchInlineEdit({ text: e.target.value })}
                                required
                              />
                              {inlineEditError && (
                                <p className="text-sm text-accent-700 dark:text-accent-400">
                                  {inlineEditError}
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button type="submit" className={btnPrimary}>Сохранить</button>
                                <button
                                  type="button"
                                  className={habitActionBtn}
                                  onClick={cancelInlineEdit}
                                >
                                  Отмена
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium flex-1 min-w-0">{b.title}</span>
                              <div className={listRowIconActions}>
                                <button
                                  type="button"
                                  className={archiveEntryIconBtn}
                                  title="Изменить"
                                  aria-label="Изменить пункт"
                                  onClick={() => startInlineEdit('basic', b)}
                                >
                                  <PencilIcon className={listRowIconSize} />
                                </button>
                                <button
                                  type="button"
                                  className={archiveEntryIconBtn}
                                  title="Выполнено"
                                  aria-label="Отметить выполненным"
                                  onClick={() => completeBasic(b.id)}
                                >
                                  <CheckIcon className={listRowIconSize} />
                                </button>
                                <button
                                  type="button"
                                  className={`${archiveEntryIconBtn} text-accent-700 dark:text-accent-400`}
                                  title="Удалить"
                                  aria-label="Удалить пункт"
                                  disabled={basicDeleteSaving}
                                  onClick={() => requestBasicDelete(b.id)}
                                >
                                  <TrashIcon className={listRowIconSize} />
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-warm-600 dark:text-warm-200 mb-2">
                    Могу
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addBasic('can', canTitle, setCanTitle);
                    }}
                    className="flex gap-2 mb-3"
                  >
                    <input
                      className={inputClass}
                      value={canTitle}
                      onChange={(e) => setCanTitle(e.target.value)}
                      placeholder="Добавить…"
                    />
                    <button type="submit" className={btnPrimary}>+</button>
                  </form>
                  <ul className="space-y-3 text-sm">
                    {basics
                      .filter((b) => b.type === 'can')
                      .map((b) => (
                        <li key={b.id} className={`${habitCardClass} ${fillBasic}`}>
                          {String(basicDeleteId) === String(b.id) ? (
                            <div className="space-y-2">
                              <span className="font-medium block">{b.title}</span>
                              <div
                                className={`rounded-lg border ${borderFrame} bg-warm-100/90 dark:bg-cocoa-900/50 p-3 space-y-2`}
                                role="alert"
                              >
                                <p className="text-sm font-medium">
                                  Удалить этот пункт безвозвратно?
                                </p>
                                {basicDeleteError && (
                                  <p className="text-sm text-accent-700 dark:text-accent-400">
                                    {basicDeleteError}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={`${btnPrimary} bg-accent-700 hover:bg-accent-800 dark:bg-accent-600`}
                                    disabled={basicDeleteSaving}
                                    onClick={() => confirmBasicDelete(b.id)}
                                  >
                                    {basicDeleteSaving ? 'Удаление…' : 'Да, удалить'}
                                  </button>
                                  <button
                                    type="button"
                                    className={habitActionBtn}
                                    disabled={basicDeleteSaving}
                                    onClick={cancelBasicDelete}
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : isInlineEditing('basic', b.id) ? (
                            <form onSubmit={saveInlineEdit} className="space-y-2">
                              <input
                                className={inputClass}
                                value={inlineEdit.text}
                                onChange={(e) => patchInlineEdit({ text: e.target.value })}
                                required
                              />
                              {inlineEditError && (
                                <p className="text-sm text-accent-700 dark:text-accent-400">
                                  {inlineEditError}
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button type="submit" className={btnPrimary}>Сохранить</button>
                                <button
                                  type="button"
                                  className={habitActionBtn}
                                  onClick={cancelInlineEdit}
                                >
                                  Отмена
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium flex-1 min-w-0">{b.title}</span>
                              <div className={listRowIconActions}>
                                <button
                                  type="button"
                                  className={archiveEntryIconBtn}
                                  title="Изменить"
                                  aria-label="Изменить пункт"
                                  onClick={() => startInlineEdit('basic', b)}
                                >
                                  <PencilIcon className={listRowIconSize} />
                                </button>
                                <button
                                  type="button"
                                  className={archiveEntryIconBtn}
                                  title="Выполнено"
                                  aria-label="Отметить выполненным"
                                  onClick={() => completeBasic(b.id)}
                                >
                                  <CheckIcon className={listRowIconSize} />
                                </button>
                                <button
                                  type="button"
                                  className={`${archiveEntryIconBtn} text-accent-700 dark:text-accent-400`}
                                  title="Удалить"
                                  aria-label="Удалить пункт"
                                  disabled={basicDeleteSaving}
                                  onClick={() => requestBasicDelete(b.id)}
                                >
                                  <TrashIcon className={listRowIconSize} />
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}

        {currentScreen === 'hall' && (
          <section className={cardClass}>
            <h2 className="font-semibold mb-4">Достижения</h2>
            <form onSubmit={addAchievement} className="flex flex-col md:flex-row gap-2 mb-6">
              <input
                className={inputClass}
                placeholder="Мои успехи"
                value={achievementTitle}
                onChange={(e) => setAchievementTitle(e.target.value)}
              />
              <button type="submit" className={btnPrimary}>Добавить</button>
            </form>
            <ul className="space-y-3">
              {achievementsForHall(achievements).map((a) => (
                <li
                  key={a.id}
                  className={`py-3 border-b ${borderDivider}`}
                >
                  {String(achievementDeleteId) === String(a.id) ? (
                    <div className="space-y-2">
                      <div className="min-w-0">
                        <p className="font-medium">{a.title}</p>
                        <p className={`text-xs ${mutedText}`}>{achievementTypeLabel(a)}</p>
                      </div>
                      <div
                        className={`rounded-lg border ${borderFrame} bg-warm-100/90 dark:bg-cocoa-900/50 p-3 space-y-2`}
                        role="alert"
                      >
                        <p className="text-sm font-medium">
                          {String(a.type) === 'habit_archive'
                            ? 'Убрать из списка достижений? В аналитике привычка останется в архиве, на главной не появится.'
                            : 'Удалить это достижение безвозвратно?'}
                        </p>
                        {achievementDeleteError && (
                          <p className="text-sm text-accent-700 dark:text-accent-400">
                            {achievementDeleteError}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={`${btnPrimary} bg-accent-700 hover:bg-accent-800 dark:bg-accent-600`}
                            disabled={achievementDeleteSaving}
                            onClick={() => confirmAchievementDelete(a.id)}
                          >
                            {achievementDeleteSaving ? 'Удаление…' : 'Да, удалить'}
                          </button>
                          <button
                            type="button"
                            className={habitActionBtn}
                            disabled={achievementDeleteSaving}
                            onClick={cancelAchievementDelete}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isInlineEditing('achievement', a.id) ? (
                    <form onSubmit={saveInlineEdit} className="space-y-2">
                      <input
                        className={inputClass}
                        value={inlineEdit.text}
                        onChange={(e) => patchInlineEdit({ text: e.target.value })}
                        required
                      />
                      {inlineEditError && (
                        <p className="text-sm text-accent-700 dark:text-accent-400">
                          {inlineEditError}
                        </p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button type="submit" className={btnPrimary}>Сохранить</button>
                        <button type="button" className={habitActionBtn} onClick={cancelInlineEdit}>
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.title}</p>
                        <p className={`text-xs ${mutedText}`}>{achievementTypeLabel(a)}</p>
                        <time className={`text-xs ${subtleText}`}>
                          {formatLocalDate(a.completed_at)}
                        </time>
                      </div>
                      <div className={listRowIconActions}>
                        {String(a.type) === 'habit_archive' ? (
                          <button
                            type="button"
                            className={`${archiveEntryIconBtn} relative z-10 touch-manipulation`}
                            title="Восстановить"
                            aria-label="Восстановить привычку на главной"
                            disabled={habitRestoreId != null}
                            onClick={() => restoreArchivedHabit(a.id)}
                          >
                            <RestoreIcon className={listRowIconSize} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={archiveEntryIconBtn}
                            title="Изменить"
                            aria-label="Изменить достижение"
                            onClick={() => startInlineEdit('achievement', a)}
                          >
                            <PencilIcon className={listRowIconSize} />
                          </button>
                        )}
                        {achievementAllowsDelete(a) && (
                          <button
                            type="button"
                            className={`${archiveEntryIconBtn} text-accent-700 dark:text-accent-400`}
                            title="Удалить"
                            aria-label="Удалить достижение"
                            disabled={achievementDeleteSaving}
                            onClick={() => requestAchievementDelete(a.id)}
                          >
                            <TrashIcon className={listRowIconSize} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {achievementsForHall(achievements).length === 0 && (
                <p className={`${mutedText} text-sm`}>Пока нет достижений</p>
              )}
            </ul>
          </section>
        )}

        {currentScreen === 'analytics' && (
          <section className={cardClass}>
            <h2 className="font-semibold mb-4">Аналитика — 15 дней</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-5 gap-2">
              {last15Days().map((day) => {
                const isToday = sameCalendarDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setAnalyticsDay(day)}
                    className={`rounded-2xl border p-3 text-center transition-colors ${
                      isToday
                        ? 'border-rose-400 bg-rose-50/90 dark:bg-rose-300/10 ring-2 ring-rose-300/55 dark:ring-rose-300/35'
                        : 'border-rose-200 dark:border-rose-300/35'
                    } hover:bg-rose-50 dark:hover:bg-rose-300/10 hover:border-rose-300`}
                  >
                    <span className={`block text-xs ${mutedText}`}>{DAY_NAMES[day.getDay()]}</span>
                    <span className="block text-lg font-semibold text-warm-900 dark:text-warm-50">
                      {day.getDate()}
                    </span>
                    <span className={`block text-xs ${subtleText}`}>{MONTH_NAMES[day.getMonth()]}</span>
                  </button>
                );
              })}
            </div>

            <div className={`mt-8 pt-6 border-t ${borderDivider}`}>
              <h3 className="font-semibold mb-3">Привычки</h3>
              <p className={`text-sm mb-4 ${mutedText}`}>
                Список синхронизирован с главной страницей и архивом достижений.
              </p>
              {analyticsHabitItems.length === 0 ? (
                <p className={`text-sm ${mutedText}`}>Пока нет привычек для статистики</p>
              ) : (
                <ul className="space-y-2">
                  {analyticsHabitItems.map((item) => {
                    const expanded = expandedAnalyticsHabits.has(item.key);
                    const stats = computeHabitAnalytics(item);
                    const isActive = item.status === 'active';
                    return (
                      <li
                        key={item.key}
                        className={`rounded-xl border ${borderFrame} bg-warm-50/80 dark:bg-cocoa-800/40 overflow-hidden`}
                      >
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 p-3 text-left touch-manipulation hover:bg-warm-100/80 dark:hover:bg-cocoa-700/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 dark:focus-visible:ring-rose-300/35"
                          aria-expanded={expanded}
                          onClick={() => toggleAnalyticsHabit(item.key)}
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isActive
                                ? 'bg-accent-600 dark:bg-accent-400'
                                : 'bg-warm-400 dark:bg-warm-500'
                            }`}
                            aria-hidden
                          />
                          <span className="flex-1 min-w-0 font-medium text-sm">{item.title}</span>
                          <span
                            className={`text-xs shrink-0 px-2 py-0.5 rounded-full border ${borderFrame} ${
                              isActive
                                ? 'text-accent-800 dark:text-accent-300 bg-rose-50/95 dark:bg-rose-300/12'
                                : `${mutedText} bg-warm-100/90 dark:bg-cocoa-700/50`
                            }`}
                          >
                            {isActive ? 'Активна' : 'Архив'}
                          </span>
                          <span
                            className={`text-sm shrink-0 w-6 text-center font-medium ${mutedText}`}
                            aria-hidden
                          >
                            {expanded ? '↑' : '↓'}
                          </span>
                        </button>
                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div
                              className={`px-3 pb-3 pt-0 border-t ${borderDivider} text-sm space-y-3`}
                              aria-hidden={!expanded}
                            >
                              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                                <div
                                  className={`rounded-lg border ${borderFrame} bg-white/70 dark:bg-cocoa-900/30 p-3`}
                                >
                                  <dt className={`text-xs ${mutedText}`}>Всего выполнено</dt>
                                  <dd className="font-semibold mt-1">
                                    {stats.completed}{' '}
                                    {stats.completed === 1 ? 'день' : stats.completed < 5 ? 'дня' : 'дней'}
                                  </dd>
                                </div>
                                <div
                                  className={`rounded-lg border ${borderFrame} bg-white/70 dark:bg-cocoa-900/30 p-3`}
                                >
                                  <dt className={`text-xs ${mutedText}`}>Текущая серия</dt>
                                  <dd className="font-semibold mt-1">
                                    {stats.streak}{' '}
                                    {stats.streak === 1 ? 'день' : stats.streak < 5 ? 'дня' : 'дней'}
                                  </dd>
                                </div>
                                <div
                                  className={`rounded-lg border ${borderFrame} bg-white/70 dark:bg-cocoa-900/30 p-3`}
                                >
                                  <dt className={`text-xs ${mutedText}`}>Пропущено</dt>
                                  <dd className="font-semibold mt-1">
                                    {stats.missed}{' '}
                                    {stats.missed === 1 ? 'день' : stats.missed < 5 ? 'дня' : 'дней'}
                                  </dd>
                                </div>
                              </dl>
                              <div>
                                <p className={`text-xs font-medium mb-2 ${mutedText}`}>
                                  Дни активности (15 дней)
                                </p>
                                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                                  {last15Days().map((day) => {
                                    const done = stats.logSet.has(day.toDateString());
                                    return (
                                      <div
                                        key={`${item.key}-${day.toISOString()}`}
                                        title={day.toLocaleDateString('ru-RU')}
                                        className={`rounded-lg border text-center py-1.5 text-xs ${
                                          done
                                            ? 'border-rose-300 dark:border-rose-300/45 bg-rose-50/95 dark:bg-rose-300/12 text-accent-800 dark:text-accent-300 font-medium'
                                            : `border-rose-100 dark:border-rose-300/20 ${subtleText} bg-white/50 dark:bg-cocoa-900/20`
                                        }`}
                                      >
                                        {day.getDate()}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              {stats.activityDates.length > 0 && (
                                <div>
                                  <p className={`text-xs font-medium mb-2 ${mutedText}`}>
                                    Все отметки
                                  </p>
                                  <ul className="flex flex-wrap gap-1.5">
                                    {stats.activityDates.map((d) => (
                                      <li
                                        key={`${item.key}-${d.toISOString()}`}
                                        className={`text-xs px-2 py-1 rounded-lg border ${borderFrame} bg-white/70 dark:bg-cocoa-900/30`}
                                      >
                                        {d.toLocaleDateString('ru-RU', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        })}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {currentScreen === 'diary' && (
          <div className="space-y-6 pb-8 md:pb-0">
            <div
              id="day-journal-top"
              className="flex flex-wrap items-center justify-between gap-2 scroll-mt-24"
            >
              <div>
                <h2 className="font-semibold text-lg">Твой день</h2>
                <p className={`text-sm mt-1 ${mutedText}`}>
                  {dayJournalDate === todayDateKey()
                    ? 'Запись за сегодня'
                    : `Запись за ${formatDayJournalDate(dayJournalDate)}`}
                </p>
              </div>
              {dayJournalDate !== todayDateKey() && (
                <button type="button" className={habitActionBtn} onClick={openTodayJournal}>
                  Сегодня
                </button>
              )}
            </div>

            <section className={cardClass}>
              <h3 className="font-semibold mb-1">
                <span className={emojiPeachClass} aria-hidden>🌟</span> Практика благодарности
              </h3>
              <p className={`text-sm mb-3 ${mutedText}`}>
                За что вы благодарны и кому хотите сказать спасибо. После сохранения поле
                очищается — запись появится в «Записи по дням».
              </p>
              <textarea
                className={`${inputClass} min-h-[120px]`}
                placeholder="Например: за поддержку близких — маме; за спокойное утро…"
                value={gratitudeText}
                onChange={(e) => setGratitudeText(e.target.value)}
              />
              {dayJournalSectionFeedback('gratitude')}
              <button
                type="button"
                className={`${btnPrimary} mt-3 touch-manipulation`}
                disabled={Boolean(dayJournalSavingSection)}
                onClick={() => saveDayJournalSection('gratitude')}
              >
                {dayJournalSaveLabel('gratitude')}
              </button>
            </section>

            <section className={cardClass}>
              <h3 className="font-semibold mb-1 flex items-center gap-1.5">
                <InsightIcon />
                Рефлексия и уроки
              </h3>
              <p className={`text-sm mb-3 ${mutedText}`}>
                Что сегодня огорчило и вызвало стресс
              </p>
              <textarea
                className={`${inputClass} min-h-[120px]`}
                placeholder="Опишите ситуации и чувства…"
                value={stressText}
                onChange={(e) => setStressText(e.target.value)}
              />
              {dayJournalSectionFeedback('stress')}
              <button
                type="button"
                className={`${btnPrimary} mt-3 mb-5 touch-manipulation`}
                disabled={Boolean(dayJournalSavingSection)}
                onClick={() => saveDayJournalSection('stress')}
              >
                {dayJournalSaveLabel('stress')}
              </button>
              <h4 className="text-sm font-medium text-warm-800 dark:text-warm-100 mb-1">
                Урок дня
              </h4>
              <p className={`text-sm mb-3 ${mutedText}`}>
                Положительный вывод из сегодняшних событий
              </p>
              <textarea
                className={`${inputClass} min-h-[120px]`}
                placeholder="Чему научились, что возьмёте с собой…"
                value={lessonText}
                onChange={(e) => setLessonText(e.target.value)}
              />
              {dayJournalSectionFeedback('lesson')}
              <button
                type="button"
                className={`${btnPrimary} mt-3 touch-manipulation`}
                disabled={Boolean(dayJournalSavingSection)}
                onClick={() => saveDayJournalSection('lesson')}
              >
                {dayJournalSaveLabel('lesson')}
              </button>
            </section>

            <section className={cardClass}>
              <h3 className="font-semibold mb-1">
                <span className={emojiPeachClass} aria-hidden>📖</span> Заметка дня
              </h3>
              <p className={`text-sm mb-3 ${mutedText}`}>Свободные мысли и наблюдения</p>
              <textarea
                className={`${inputClass} min-h-[140px]`}
                placeholder="Всё, что хочется зафиксировать…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              {dayJournalSectionFeedback('note')}
              <button
                type="button"
                className={`${btnPrimary} mt-3 touch-manipulation relative z-10`}
                disabled={Boolean(dayJournalSavingSection)}
                onClick={() => saveDayJournalSection('note')}
              >
                {dayJournalSaveLabel('note')}
              </button>
            </section>

            <section className={`${cardClass} relative z-10`}>
              <h3 className="font-semibold mb-3">Записи по дням</h3>
              <ul className="space-y-1 pb-4">
                {dayJournalListDates(dayJournals).map((dateKey) => {
                  const key = normalizeDateKey(dateKey);
                  const entry = findDayJournalByDate(dayJournals, key);
                  const sections = dayJournalSectionsFromEntry(entry);
                  const expanded = expandedJournalDates.has(key);
                  const isToday = key === todayDateKey();
                  const isEditing = key === normalizeDateKey(dayJournalDate);
                  return (
                    <li
                      key={key}
                      className={`py-2 border-b ${borderDivider} last:border-0`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className={`text-sm font-medium text-left hover:underline ${
                            isEditing ? 'text-accent-700 dark:text-accent-400' : ''
                          }`}
                          onClick={() => editDayJournal(key)}
                        >
                          {formatDayJournalDate(key)}
                          {isToday && (
                            <span className={`ml-2 text-xs font-normal ${mutedText}`}>сегодня</span>
                          )}
                          {sections.length > 0 && (
                            <span className={`ml-2 text-xs font-normal ${mutedText}`}>
                              · {sections.length}{' '}
                              {sections.length === 1
                                ? 'запись'
                                : sections.length < 5
                                  ? 'записи'
                                  : 'записей'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`${habitActionBtn} touch-manipulation relative z-10 shrink-0`}
                          aria-expanded={expanded}
                          onClick={() => toggleJournalArchive(key)}
                        >
                          {expanded ? 'Закрыть ↑' : 'Открыть ↓'}
                        </button>
                      </div>
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <ul className="pt-3 space-y-3" aria-hidden={!expanded}>
                            {sections.length === 0 ? (
                              <li className={`text-sm ${mutedText} pl-1`}>
                                Пока нет сохранённых записей за этот день
                              </li>
                            ) : (
                              sections.map((block) => {
                                const editing = isArchiveEntryEditing(key, block);
                                const deletePending = isArchiveEntryDeletePending(key, block);
                                return (
                                  <li
                                    key={block.key}
                                    className={`text-sm rounded-xl border ${borderFrame} bg-warm-50/80 dark:bg-cocoa-800/40 p-3`}
                                  >
                                    {deletePending ? (
                                      <div className="space-y-2">
                                        <p className="font-medium flex items-center gap-1 flex-wrap">
                                          <DayJournalBlockIcon
                                            blockId={block.sectionId}
                                            emoji={block.emoji}
                                          />
                                          {block.title}
                                        </p>
                                        <p className="whitespace-pre-wrap opacity-80">{block.text}</p>
                                        <div
                                          className={`rounded-lg border ${borderFrame} bg-warm-100/90 dark:bg-cocoa-900/50 p-3 space-y-2`}
                                          role="alert"
                                        >
                                          <p className="text-sm font-medium">
                                            Удалить эту запись безвозвратно?
                                          </p>
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            className={`${btnPrimary} bg-accent-700 hover:bg-accent-800 dark:bg-accent-600`}
                                            disabled={archiveEntrySaving}
                                            onClick={confirmArchiveEntryDelete}
                                          >
                                            {archiveEntrySaving ? 'Удаление…' : 'Да, удалить'}
                                          </button>
                                          <button
                                            type="button"
                                            className={habitActionBtn}
                                            disabled={archiveEntrySaving}
                                            onClick={cancelArchiveEntryDelete}
                                          >
                                            Отмена
                                          </button>
                                        </div>
                                        </div>
                                      </div>
                                    ) : editing ? (
                                      <div className="space-y-2">
                                        <p className="font-medium flex items-center gap-1 flex-wrap">
                                          <DayJournalBlockIcon
                                            blockId={block.sectionId}
                                            emoji={block.emoji}
                                          />
                                          {block.title}
                                        </p>
                                        <textarea
                                          className={`${inputClass} min-h-[100px] text-sm`}
                                          value={archiveEntryEdit.text}
                                          onChange={(e) =>
                                            setArchiveEntryEdit((prev) => ({
                                              ...prev,
                                              text: e.target.value,
                                            }))
                                          }
                                        />
                                        <div className="flex gap-2 flex-wrap">
                                          <button
                                            type="button"
                                            className={btnPrimary}
                                            disabled={archiveEntrySaving}
                                            onClick={saveArchiveEntryEdit}
                                          >
                                            {archiveEntrySaving ? 'Сохранение…' : 'Сохранить'}
                                          </button>
                                          <button
                                            type="button"
                                            className={habitActionBtn}
                                            onClick={cancelArchiveEntryEdit}
                                          >
                                            Отмена
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium mb-1 flex items-center gap-1 flex-wrap">
                                            <DayJournalBlockIcon
                                              blockId={block.sectionId}
                                              emoji={block.emoji}
                                            />
                                            {block.title}
                                          </p>
                                          <p className="whitespace-pre-wrap">{block.text}</p>
                                        </div>
                                        <div className="flex flex-col gap-0.5 shrink-0 self-center">
                                          <button
                                            type="button"
                                            className={archiveEntryIconBtn}
                                            title="Изменить"
                                            aria-label="Изменить запись"
                                            onClick={() => startArchiveEntryEdit(key, block)}
                                          >
                                            <PencilIcon className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className={`${archiveEntryIconBtn} text-accent-700 dark:text-accent-400`}
                                            title="Удалить"
                                            aria-label="Удалить запись"
                                            onClick={() => requestArchiveEntryDelete(key, block)}
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}

        {currentScreen === 'settings' && (
          <section className={cardClass}>
            <h2 className="font-semibold mb-4">Настройки</h2>
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div
                className={`w-16 h-16 rounded-xl overflow-hidden border ${borderFrame} bg-warm-100 dark:bg-cocoa-700 flex items-center justify-center shrink-0`}
              >
                {userAvatarUrl ? (
                  <UserAvatarImg url={userAvatarUrl} className="w-full h-full object-cover" />
                ) : (
                  <ProfileIconSvg className="w-8 h-8 text-warm-600 dark:text-warm-200" />
                )}
              </div>
              <div className="space-y-2">
                <label className={`inline-block cursor-pointer ${btnPrimary}`}>
                  Выбрать фото
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFile}
                  />
                </label>
                {userAvatarUrl && (
                  <button type="button" className={habitActionBtn} onClick={removeAvatar}>
                    Убрать фото
                  </button>
                )}
                <p className={`text-xs ${mutedText}`}>
                  {avatarSourceHint(userOauthProvider, userAvatarSource)} Файл до {MAX_AVATAR_FILE_MB} МБ.
                </p>
                {avatarError && (
                  <p className="text-sm text-accent-700 dark:text-accent-400">{avatarError}</p>
                )}
              </div>
            </div>
            <p className="text-sm text-warm-600 dark:text-warm-200 mb-1">
              {userPhone ? 'Телефон' : 'Email'}
            </p>
            <p className="font-medium mb-6">{userPhone || userEmail || '—'}</p>

            <div className={`flex items-center justify-between py-3 border-y ${borderDivider} mb-6`}>
              <span>Тема оформления</span>
              <button type="button" onClick={toggleTheme} className={btnPrimary}>
                {darkTheme ? 'Светлая' : 'Тёмная'}
              </button>
            </div>

            <button
              type="button"
              onClick={resetAllData}
              className={`w-full mb-3 ${btnPrimary}`}
            >
              Стереть все данные
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`w-full py-2 rounded-xl border ${borderFrameStrong} text-warm-900 dark:text-warm-50 hover:bg-warm-100 dark:hover:bg-cocoa-700 transition-colors`}
            >
              Выйти из аккаунта
            </button>
          </section>
        )}
      </main>

      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 bg-ivory/90 dark:bg-cocoa-950/96 backdrop-blur-md border-t ${borderFrame} flex justify-around py-2 z-20`}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCurrentScreen(item.id)}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${
              currentScreen === item.id
                ? navActiveClass
                : 'text-warm-600 dark:text-warm-300 border border-transparent'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {analyticsDay && analyticsModalData && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-cocoa-950/40 dark:bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analytics-day-title"
          onClick={() => setAnalyticsDay(null)}
        >
          <div
            className={`app-card w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-calm rounded-2xl border ${borderFrame} bg-white dark:bg-cocoa-900 text-warm-900 dark:text-warm-50 p-5 md:p-6 shadow-[0_24px_48px_-12px_rgba(82,61,55,0.28)] dark:shadow-[0_28px_56px_-12px_rgba(0,0,0,0.78)]`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-3 mb-5 pb-4 border-b border-rose-100 dark:border-rose-300/25">
              <h3 id="analytics-day-title" className="text-lg font-bold leading-snug pr-2">
                {analyticsDay.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              <button
                type="button"
                className={`${archiveEntryIconBtn} hover:bg-rose-100 dark:hover:bg-rose-300/15 hover:border-rose-300 dark:hover:border-rose-300/45 text-warm-700 dark:text-warm-100 transition-colors`}
                aria-label="Закрыть"
                onClick={() => setAnalyticsDay(null)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <section className={analyticsModalPanels.mood}>
                <h4 className={analyticsModalSectionTitle}>
                  <span className={emojiPeachClass} aria-hidden>💭</span> Настроение
                </h4>
                {analyticsModalData.dayMoods.length === 0 ? (
                  <p className={mutedText}>Нет записей</p>
                ) : (
                  <ul className="space-y-2.5">
                    {analyticsModalData.dayMoods.map((m) => (
                      <li
                        key={m.id}
                        className={`rounded-lg border ${borderFrame} bg-white/75 dark:bg-cocoa-900/35 px-3 py-2`}
                      >
                        <span className={`${emojiPeachClass} text-lg mr-1.5`}>{m.emoji}</span>
                        <span className="font-medium text-warm-900 dark:text-warm-50">
                          {m.text_reason || '—'}
                        </span>
                        <span className={`block text-xs mt-1 ${subtleText}`}>
                          {formatTime(m.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={analyticsModalPanels.habits}>
                <h4 className={analyticsModalSectionTitle}>Привычки</h4>
                {analyticsModalData.dayHabitStatuses.length === 0 ? (
                  <p className={mutedText}>Нет активных привычек</p>
                ) : (
                  <ul className="space-y-2">
                    {analyticsModalData.dayHabitStatuses.map((h) => (
                      <li
                        key={h.id}
                        className={`flex items-center gap-2.5 rounded-lg border ${borderFrame} bg-white/70 dark:bg-cocoa-900/30 px-3 py-2`}
                      >
                        <HabitDayStatusMark done={h.completed} />
                        <span
                          className={
                            h.completed
                              ? 'font-medium text-warm-900 dark:text-warm-50'
                              : mutedText
                          }
                        >
                          {h.title}
                        </span>
                        <span className={`ml-auto text-xs shrink-0 ${subtleText}`}>
                          {h.completed ? 'Выполнено' : 'Не отмечено'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={analyticsModalPanels.achievements}>
                <h4 className={analyticsModalSectionTitle}>
                  <span className={emojiPeachClass} aria-hidden>🏆</span> Достижения
                </h4>
                {analyticsModalData.dayAchievements.length === 0 ? (
                  <p className={mutedText}>Нет записей</p>
                ) : (
                  <ul className="space-y-2">
                    {analyticsModalData.dayAchievements.map((a) => (
                      <li
                        key={a.id}
                        className={`rounded-lg border ${borderFrame} bg-white/75 dark:bg-cocoa-900/35 px-3 py-2 font-medium text-warm-900 dark:text-warm-50`}
                      >
                        {a.title}
                        <span className={`block text-xs font-normal mt-0.5 ${mutedText}`}>
                          {achievementTypeLabel(a)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={analyticsModalPanels.day}>
                <h4 className={analyticsModalSectionTitle}>Твой день</h4>
                {!analyticsModalData.dayJournal &&
                analyticsModalData.dayDiary.length === 0 ? (
                  <p className={mutedText}>Нет записей</p>
                ) : (
                  <div className="space-y-3">
                    {analyticsModalData.dayJournal &&
                      dayJournalSectionsFromEntry(analyticsModalData.dayJournal).map((block) => (
                        <div key={block.key} className={dayJournalAnalyticsPanelClass(block.sectionId)}>
                          <p className="font-semibold text-sm text-warm-900 dark:text-warm-50 mb-1.5 flex items-center gap-1">
                            <DayJournalBlockIcon blockId={block.sectionId} emoji={block.emoji} />
                            {block.title}
                          </p>
                          <p className="whitespace-pre-wrap text-warm-800 dark:text-warm-100 leading-relaxed">
                            {block.text}
                          </p>
                        </div>
                      ))}
                    {analyticsModalData.dayDiary.map((d) => (
                      <div
                        key={d.id}
                        className={`rounded-lg border ${borderDivider} bg-white/60 dark:bg-cocoa-900/25 p-3`}
                      >
                        <p className="font-semibold text-sm mb-1.5">Рефлексия (дневник)</p>
                        <p className={`whitespace-pre-wrap leading-relaxed ${mutedText}`}>
                          {d.text_reflection}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
