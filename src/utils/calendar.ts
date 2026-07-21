import {
  CalendarEvent,
  CareOverride,
  CareScheduleRule,
  HomeLocation,
  TrackedItem,
} from '../types';

const DAY_MS = 86_400_000;

export function startOfLocalDay(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addCalendarDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addCalendarDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
}

export function monthTitle(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(value);
}

export function otherHome(home: HomeLocation): HomeLocation {
  return home === "Dad's house" ? "Mum's house" : "Dad's house";
}

function normalisedModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function careOverrideForDate(date: Date, overrides: CareOverride[]): CareOverride | undefined {
  const key = dateKey(date);
  return overrides.find((override) => key >= override.startsOn && key <= override.endsOn);
}

export function householdForDate(
  date: Date,
  rules: CareScheduleRule[],
  overrides: CareOverride[],
  fallback: HomeLocation,
): HomeLocation {
  const override = careOverrideForDate(date, overrides);
  if (override) return override.householdLabel;

  const rule = rules[0];
  if (!rule) return fallback;

  const target = startOfLocalDay(date).getTime();
  const anchor = startOfLocalDay(`${rule.startsOn}T12:00:00`).getTime();
  const days = Math.round((target - anchor) / DAY_MS);
  const weekIndex = Math.floor(days / 7);
  return normalisedModulo(weekIndex, 2) === 0
    ? rule.householdLabel
    : otherHome(rule.householdLabel);
}

export function isHandoverDate(date: Date, rules: CareScheduleRule[]): boolean {
  const rule = rules[0];
  if (!rule) return false;
  const target = startOfLocalDay(date).getTime();
  const anchor = startOfLocalDay(`${rule.startsOn}T12:00:00`).getTime();
  const days = Math.round((target - anchor) / DAY_MS);
  return normalisedModulo(days, 7) === 0;
}

export function eventsOnDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const dayStart = startOfLocalDay(date).getTime();
  const dayEnd = dayStart + DAY_MS - 1;
  return events.filter((event) => {
    const eventStart = new Date(event.startsAt).getTime();
    const eventEnd = new Date(event.endsAt ?? event.startsAt).getTime();
    return eventStart <= dayEnd && eventEnd >= dayStart;
  });
}

export function eventNeedsMoving(
  event: CalendarEvent,
  items: TrackedItem[],
  rules: CareScheduleRule[],
  overrides: CareOverride[],
  fallback: HomeLocation,
): TrackedItem[] {
  if (!event.requiredItemIds.length) return [];
  const targetHome = householdForDate(new Date(event.startsAt), rules, overrides, fallback);
  const required = new Set(event.requiredItemIds);
  return items.filter((item) => {
    if (!required.has(item.id)) return false;
    if (item.location === targetHome) return false;
    if (item.location === 'School' || item.location === 'School bag' || item.location === 'Handover bag' || item.location === 'In transit') return false;
    return true;
  });
}

export function nextPlanningIssue(
  events: CalendarEvent[],
  items: TrackedItem[],
  rules: CareScheduleRule[],
  overrides: CareOverride[],
  fallback: HomeLocation,
): { event: CalendarEvent; items: TrackedItem[] } | null {
  const now = Date.now();
  const upcoming = [...events]
    .filter((event) => new Date(event.endsAt ?? event.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  for (const event of upcoming) {
    const mismatched = eventNeedsMoving(event, items, rules, overrides, fallback);
    if (mismatched.length) return { event, items: mismatched };
  }
  return null;
}
