// Безопасно получаем Telegram WebApp API: локально его может не быть.
export function getTelegramWebApp() {
  return window?.Telegram?.WebApp ?? null
}

export function getTelegramUserId() {
  const webApp = getTelegramWebApp()
  const userId = webApp?.initDataUnsafe?.user?.id

  if (userId) {
    return String(userId)
  }

  // Режим локальной разработки вне Telegram.
  return 'local-dev-user'
}

export function getTelegramUserName() {
  const webApp = getTelegramWebApp()
  const firstName = webApp?.initDataUnsafe?.user?.first_name
  const username = webApp?.initDataUnsafe?.user?.username

  if (firstName) {
    return firstName
  }

  if (username) {
    return username
  }

  // Режим локальной разработки вне Telegram.
  return 'Гость'
}

export function initTelegramUi() {
  const webApp = getTelegramWebApp()

  if (!webApp) {
    return
  }

  webApp.ready()
  webApp.expand()
}
