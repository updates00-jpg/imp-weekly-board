export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  const difference = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + difference)
  return result
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

export function formatLongDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

export function isSameDay(left: Date, right: Date): boolean {
  return toIsoDate(left) === toIsoDate(right)
}

export function formatWeekRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric' })
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' })

  if (sameMonth) {
    return `${day.format(start)}–${day.format(end)} ${month.format(end)} ${end.getFullYear()}`
  }
  if (sameYear) {
    return `${day.format(start)} ${month.format(start)} – ${day.format(end)} ${month.format(end)} ${end.getFullYear()}`
  }
  return `${day.format(start)} ${month.format(start)} ${start.getFullYear()} – ${day.format(end)} ${month.format(end)} ${end.getFullYear()}`
}
