export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function getLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return getLocalDateKey(a) === getLocalDateKey(b);
}

export function getStartOfWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  return addLocalDays(day, -mondayOffset);
}

export function getWeekDays(date: Date): readonly Date[] {
  const monday = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}

export function shiftWeek(date: Date, amount: number): Date {
  return addLocalDays(date, amount * 7);
}
