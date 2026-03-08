# Telegram Mini App: Todo + Секундомер задач

Готовое приложение для Telegram Mini Apps:
- сверху текущая дата;
- старт рабочего дня;
- добавление задачи и запуск секундомера кнопкой `Старт`;
- кнопка `Стоп` останавливает время задачи;
- кнопка `Завершить` завершает задачу;
- внизу `Закончить работу`;
- отдельная страница `История дней` с датой и временем каждого рабочего дня;
- сохраняются задачи, время каждой задачи и общее время дня;
- адаптивный интерфейс, модульная архитектура, хранение в Supabase (бесплатно).

## Технологии
- `React + Vite`
- `Supabase` (PostgreSQL + Auth Anonymous)
- `Telegram WebApp API`

## Быстрый запуск
1. Установить зависимости:
```bash
npm install
```
2. Создать `.env` из примера:
```bash
cp .env.example .env
```
3. Заполнить `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.
4. Запустить локально:
```bash
npm run dev
```

## Настройка Supabase (бесплатно)
1. Создайте проект на `supabase.com` (Free Plan).
2. Включите `Authentication -> Providers -> Anonymous`.
3. Выполните SQL из [supabase/schema.sql](/h:/my_project/codex/supabase/schema.sql).
4. Скопируйте URL и Anon Key в `.env`.

## Деплой бесплатно (GitHub + Vercel)
1. Создайте репозиторий на GitHub и запушьте код.
2. На `vercel.com` импортируйте репозиторий.
3. В `Environment Variables` добавьте:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
4. Deploy.
5. Получите production URL вида `https://your-app.vercel.app`.

## Подключение к Telegram боту
1. В `@BotFather` создайте/выберите бота.
2. Откройте `Bot Settings -> Menu Button -> Configure Menu Button`.
3. Вставьте URL деплоя `https://your-app.vercel.app`.
4. Откройте бота в Telegram и запустите Mini App.

## Масштабирование
- Разделены UI, Telegram-интеграция и слой хранения (`src/lib/*`).
- Запись в БД с debounce снижает количество запросов.
- Данные нормализованы в таблицы `workday_sessions` и `tasks` с индексами.
- Можно легко добавить командную работу, отчеты, фильтры, теги и экспорт.

## Комментарии в коде
В ключевых частях приложения добавлены комментарии:
- инициализация Telegram;
- логика таймеров;
- авто-сохранение;
- завершение рабочего дня.

## Важно
Если переменные Supabase не заданы, приложение работает в demo-режиме через `localStorage`.
