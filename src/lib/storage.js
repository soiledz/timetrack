import { hasSupabaseConfig, supabase } from './supabase'

const LOCAL_STORAGE_KEY = 'tma-workday-state'

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function ensureAnonymousAuth() {
  const { data } = await supabase.auth.getSession()

  if (data.session) {
    return data.session.user.id
  }

  const { data: signInData, error } = await supabase.auth.signInAnonymously()

  if (error) {
    throw error
  }

  return signInData.user.id
}

export async function loadWorkdayState({ telegramUserId, workdayDate }) {
  if (!hasSupabaseConfig) {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return safeJsonParse(raw, { session: null, tasks: [] })
  }

  const userId = await ensureAnonymousAuth()

  const { data: session, error: sessionError } = await supabase
    .from('workday_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('telegram_user_id', telegramUserId)
    .eq('workday_date', workdayDate)
    .maybeSingle()

  if (sessionError) {
    throw sessionError
  }

  if (!session) {
    return { session: null, tasks: [] }
  }

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  if (tasksError) {
    throw tasksError
  }

  return {
    session,
    tasks: tasks ?? [],
  }
}

export async function saveWorkdayState({ telegramUserId, workdayDate, session, tasks }) {
  if (!hasSupabaseConfig) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ session, tasks }))
    return { session, tasks }
  }

  const userId = await ensureAnonymousAuth()
  let savedSession = session

  if (session) {
    const payload = {
      id: session.id,
      user_id: userId,
      telegram_user_id: telegramUserId,
      workday_date: workdayDate,
      started_at: session.started_at,
      ended_at: session.ended_at,
      total_seconds: session.total_seconds,
    }

    const { data, error } = await supabase
      .from('workday_sessions')
      .upsert(payload)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    savedSession = data
  }

  if (savedSession) {
    const withSession = tasks.map((task) => ({
      ...task,
      user_id: userId,
      session_id: savedSession.id,
    }))

    const { error: upsertTasksError } = await supabase.from('tasks').upsert(withSession)

    if (upsertTasksError) {
      throw upsertTasksError
    }
  }

  return {
    session: savedSession,
    tasks,
  }
}
