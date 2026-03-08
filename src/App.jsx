import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { loadWorkdayHistory, loadWorkdayState, saveWorkdayState } from './lib/storage'
import { hasSupabaseConfig } from './lib/supabase'
import { getTelegramUserId, getTelegramUserName, initTelegramUi } from './lib/telegram'

function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, totalSeconds)
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return [hrs, mins, secs].map((part) => String(part).padStart(2, '0')).join(':')
}

function currentIso() {
  return new Date().toISOString()
}

function createTask(title, orderIndex) {
  return {
    id: crypto.randomUUID(),
    title,
    elapsed_seconds: 0,
    is_running: true,
    is_completed: false,
    running_started_at: currentIso(),
    completed_at: null,
    created_at: currentIso(),
    updated_at: currentIso(),
    order_index: orderIndex,
  }
}

function getTaskLiveSeconds(task, nowMs) {
  if (!task.is_running || !task.running_started_at) {
    return task.elapsed_seconds
  }

  const delta = Math.floor((nowMs - new Date(task.running_started_at).getTime()) / 1000)
  return task.elapsed_seconds + Math.max(0, delta)
}

function App() {
  const [page, setPage] = useState('today')
  const [telegramUserId, setTelegramUserId] = useState('local-dev-user')
  const [telegramUserName, setTelegramUserName] = useState('Гость')
  const [session, setSession] = useState(null)
  const [history, setHistory] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [tasks, setTasks] = useState([])
  const [taskInput, setTaskInput] = useState('')
  const [tick, setTick] = useState(Date.now())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  // Ref нужен, чтобы не запускать авто-сохранение до первой загрузки данных.
  const initializedRef = useRef(false)

  const workdayDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const activeTask = useMemo(() => tasks.find((task) => task.is_running), [tasks])

  const totalDaySeconds = useMemo(() => {
    const nowMs = tick
    return tasks.reduce((sum, task) => sum + getTaskLiveSeconds(task, nowMs), 0)
  }, [tasks, tick])

  useEffect(() => {
    // В Telegram раскрываем mini app на весь экран.
    initTelegramUi()

    const userId = getTelegramUserId()
    const userName = getTelegramUserName()
    setTelegramUserId(userId)
    setTelegramUserName(userName)

    async function bootstrap() {
      try {
        const data = await loadWorkdayState({ telegramUserId: userId, workdayDate })
        setSession(data.session)
        setTasks(data.tasks ?? [])

        const historyRows = await loadWorkdayHistory({ telegramUserId: userId })
        setHistory(historyRows)
      } catch (error) {
        setErrorText(`Ошибка загрузки: ${error.message}`)
      } finally {
        initializedRef.current = true
        setIsLoading(false)
      }
    }

    bootstrap()
  }, [workdayDate])

  useEffect(() => {
    // Тик раз в секунду обновляет отображение секундомеров.
    const intervalId = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!initializedRef.current) {
      return
    }

    // Debounce сохраняет в БД реже и снижает нагрузку при масштабировании.
    const timeoutId = setTimeout(async () => {
      try {
        setIsSaving(true)
        setErrorText('')
        await saveWorkdayState({ telegramUserId, workdayDate, session, tasks })
      } catch (error) {
        setErrorText(`Ошибка сохранения: ${error.message}`)
      } finally {
        setIsSaving(false)
      }
    }, 700)

    return () => clearTimeout(timeoutId)
  }, [telegramUserId, workdayDate, session, tasks])

  useEffect(() => {
    if (page !== 'history' || !initializedRef.current) {
      return
    }

    async function refreshHistory() {
      try {
        setIsHistoryLoading(true)
        const rows = await loadWorkdayHistory({ telegramUserId })
        setHistory(rows)
      } catch (error) {
        setErrorText(`Ошибка загрузки истории: ${error.message}`)
      } finally {
        setIsHistoryLoading(false)
      }
    }

    refreshHistory()
  }, [page, telegramUserId, session])

  function startWorkday() {
    if (session) {
      return
    }

    setSession({
      id: crypto.randomUUID(),
      started_at: currentIso(),
      ended_at: null,
      total_seconds: 0,
    })
    setSuccessText('Рабочий день начат')
  }

  function startTask() {
    const title = taskInput.trim()

    if (!title || !session || activeTask || session.ended_at) {
      return
    }

    const task = createTask(title, tasks.length)
    setTasks((prev) => [...prev, task])
    setTaskInput('')
    setSuccessText('Задача запущена')
  }

  function stopTask(taskId) {
    const now = Date.now()

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || !task.is_running || !task.running_started_at) {
          return task
        }

        const seconds = getTaskLiveSeconds(task, now)

        return {
          ...task,
          elapsed_seconds: seconds,
          is_running: false,
          running_started_at: null,
          updated_at: currentIso(),
        }
      }),
    )

    setSuccessText('Задача остановлена')
  }

  function completeTask(taskId) {
    const now = Date.now()

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || task.is_completed) {
          return task
        }

        const seconds = getTaskLiveSeconds(task, now)

        return {
          ...task,
          elapsed_seconds: seconds,
          is_running: false,
          is_completed: true,
          running_started_at: null,
          completed_at: currentIso(),
          updated_at: currentIso(),
        }
      }),
    )

    setSuccessText('Задача завершена')
  }

  function finishWorkday() {
    if (!session || session.ended_at) {
      return
    }

    const now = Date.now()

    // На завершение дня принудительно останавливаем все запущенные задачи.
    const normalizedTasks = tasks.map((task) => {
      if (!task.is_running || !task.running_started_at) {
        return task
      }

      const seconds = getTaskLiveSeconds(task, now)

      return {
        ...task,
        elapsed_seconds: seconds,
        is_running: false,
        running_started_at: null,
        updated_at: currentIso(),
      }
    })

    const totalSeconds = normalizedTasks.reduce((sum, task) => sum + task.elapsed_seconds, 0)

    setTasks(normalizedTasks)
    setSession((prev) => ({
      ...prev,
      ended_at: currentIso(),
      total_seconds: totalSeconds,
    }))
    setSuccessText('Рабочий день завершен')
  }

  const prettyDate = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  if (isLoading) {
    return <main className="app-shell">Загрузка...</main>
  }

  const renderHistory = page === 'history'

  return (
    <main className="app-shell">
      <section className="tabs">
        <button className={`tab-button ${page === 'today' ? 'tab-active' : ''}`} onClick={() => setPage('today')}>
          Сегодня
        </button>
        <button className={`tab-button ${page === 'history' ? 'tab-active' : ''}`} onClick={() => setPage('history')}>
          История дней
        </button>
      </section>

      {renderHistory ? (
        <>
          <section className="card">
            <h2>Рабочие дни</h2>
            <p className="muted">Дата, время начала, время окончания и суммарно отработанное время</p>
            {isHistoryLoading ? <p className="muted">Загрузка истории...</p> : null}
            {!isHistoryLoading && history.length === 0 ? <p className="muted">История пока пустая</p> : null}
            <div className="task-list">
              {history.map((day) => (
                <article key={day.id} className="task-item">
                  <div>
                    <h3>{new Date(day.workday_date).toLocaleDateString('ru-RU')}</h3>
                    <p className="muted">
                      Старт: {day.started_at ? new Date(day.started_at).toLocaleTimeString('ru-RU') : '—'} | Финиш:{' '}
                      {day.ended_at ? new Date(day.ended_at).toLocaleTimeString('ru-RU') : '—'}
                    </p>
                  </div>
                  <strong>{formatSeconds(day.total_seconds ?? 0)}</strong>
                </article>
              ))}
            </div>
          </section>

          <footer className="status-bar">
            {errorText ? <span className="status-error">{errorText}</span> : null}
            <span className="muted">Режим хранения: {hasSupabaseConfig ? 'Supabase' : 'localStorage (demo)'}</span>
          </footer>
        </>
      ) : (
        <>
          <section className="card">
            <p className="muted">Сегодня</p>
            <h1>{prettyDate}</h1>
            <p className="muted">Привет, {telegramUserName}</p>
          </section>

          <section className="card">
            <h2>Рабочий день</h2>
            <p>
              Старт:{' '}
              <strong>{session?.started_at ? new Date(session.started_at).toLocaleTimeString('ru-RU') : 'еще не начат'}</strong>
            </p>
            <p>
              Общее время: <strong>{formatSeconds(totalDaySeconds)}</strong>
            </p>
            {!session ? (
              <button className="button button-main" onClick={startWorkday}>
                Старт рабочего дня
              </button>
            ) : (
              <button className="button button-stop" onClick={finishWorkday} disabled={Boolean(session.ended_at)}>
                Закончить работу
              </button>
            )}
          </section>

          <section className="card">
            <h2>Новая задача</h2>
            <div className="task-input-row">
              <input
                value={taskInput}
                onChange={(event) => setTaskInput(event.target.value)}
                className="task-input"
                placeholder="Например: Подготовить отчет"
                disabled={!session || Boolean(activeTask) || Boolean(session?.ended_at)}
              />
              <button
                className="button button-main"
                onClick={startTask}
                disabled={!taskInput.trim() || !session || Boolean(activeTask) || Boolean(session?.ended_at)}
              >
                Старт
              </button>
            </div>
            {activeTask ? <p className="muted">Сначала остановите текущую задачу: {activeTask.title}</p> : null}
          </section>

          <section className="card">
            <h2>Список задач</h2>
            {tasks.length === 0 ? <p className="muted">Задач пока нет</p> : null}

            <div className="task-list">
              {tasks.map((task) => {
                const seconds = getTaskLiveSeconds(task, tick)

                return (
                  <article key={task.id} className="task-item">
                    <div>
                      <h3>{task.title}</h3>
                      <p className="muted">Время: {formatSeconds(seconds)}</p>
                    </div>
                    <div className="task-actions">
                      <button className="button button-stop" onClick={() => stopTask(task.id)} disabled={!task.is_running || task.is_completed}>
                        Стоп
                      </button>
                      <button className="button button-success" onClick={() => completeTask(task.id)} disabled={task.is_completed}>
                        Завершить
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <footer className="status-bar">
            {isSaving ? <span className="muted">Сохраняем...</span> : <span className="muted">Синхронизировано</span>}
            {errorText ? <span className="status-error">{errorText}</span> : null}
            {!errorText && successText ? <span className="status-ok">{successText}</span> : null}
            <span className="muted">Режим хранения: {hasSupabaseConfig ? 'Supabase' : 'localStorage (demo)'}</span>
          </footer>
        </>
      )}
    </main>
  )
}

export default App
