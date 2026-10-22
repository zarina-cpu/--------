# Мой Путь — Android (Expo)

Мобильное приложение для трекера «Мой Путь». Использует тот же API, что и веб-версия на Vercel.

## Требования

- Node.js 20+
- [Android Studio](https://developer.android.com/studio) (эмулятор) или телефон с [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

## Установка

```bash
cd mobile
npm install
```

## Локальный API (опционально)

В `app.json` в `expo.extra.apiUrl` укажите адрес бэкенда, например:

- продакшен: `https://my-way-tracker.vercel.app`
- локально с эмулятора Android: `http://10.0.2.2:5000` (при `npm run dev` в `backend/`)

## Запуск

```bash
npm start
```

- **Android эмулятор:** `npm run android`
- **Expo Go на телефоне:** отсканируйте QR в терминале (телефон и ПК в одной сети)

## Сборка APK / AAB

1. Установите EAS CLI: `npm i -g eas-cli`
2. `eas login`
3. `eas build:configure`
4. Первый раз: `npx eas-cli login` и `npx eas-cli init` (привязка проекта к Expo).
5. Сборка APK: `npm run build:android:preview` или `npx eas-cli build -p android --profile preview --non-interactive` (после логина).

Профиль `preview` в `eas.json` задаёт `android.buildType: "apk"` — устанавливаемый файл, не AAB.

Пакет Android: `com.myway.tracker` (см. `app.json`).

## Экраны

| Вкладка | Функции |
|--------|---------|
| Главная | Настроение, **создание** и отметка привычек |
| Твой день | Благодарность, стресс, урок, заметка, архив по дням (как на сайте) |
| Достижения | Зал славы |
| Аналитика | Сетка настроения за 15 дней, счётчики привычек |
| Настройки | Тема, **ежедневные push-напоминания** (локальные), выход |

Google OAuth и редактирование привычек на месте пока удобнее в веб-приложении.

## Тема

В настройках можно переключить светлую и тёмную тему (палитра как на сайте).
