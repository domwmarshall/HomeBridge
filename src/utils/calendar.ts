import {
  CalendarEvent,
  CareOverride,
  CareScheduleRule,
  HomeLocation,
  ParentLabel,
  TrackedItem,
} from "../types";

const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function partsFromKey(value: string): DateParts {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function partsFromDate(value: Date): DateParts {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function serialFromParts(parts: DateParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

function serialFromKey(value: string): number {
  return serialFromParts(partsFromKey(value));
}

function keyFromSerial(serial: number): string {
  const value = new Date(serial * DAY_MS);
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekdayForKey(value: string): number {
  const parts = partsFromKey(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function normalisedModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function weekdayFromRule(rule: CareScheduleRule): number {
  const match = /(?:^|;)BYDAY=([A-Z]{2})(?:;|$)/.exec(rule.recurrenceRule);
  return match ? (WEEKDAYS[match[1]] ?? 2) : 2;
}

export function startOfLocalDay(value: Date | string): Date {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dateKey(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  const { year, month, day } = partsFromDate(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateFromKey(value: string): Date {
  const { year, month, day } = partsFromKey(value);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDateKeyDays(value: string, days: number): string {
  return keyFromSerial(serialFromKey(value) + days);
}

export function addCalendarDays(value: Date, days: number): Date {
  return dateFromKey(addDateKeyDays(dateKey(value), days));
}

export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addCalendarDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(gridStart, index),
  );
}

export function monthTitle(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(value);
}

export function otherHome(home: HomeLocation): HomeLocation {
  return home === "Dad's house" ? "Mum's house" : "Dad's house";
}

export function parentForHome(home: HomeLocation): ParentLabel {
  return home === "Dad's house" ? "Dad" : "Mum";
}

export function normalisedHandoverAnchor(rule: CareScheduleRule): string {
  const desiredWeekday = weekdayFromRule(rule);
  const actualWeekday = weekdayForKey(rule.startsOn);
  const shift = normalisedModulo(desiredWeekday - actualWeekday, 7);
  return addDateKeyDays(rule.startsOn, shift);
}

export function careOverrideForDate(
  date: Date,
  overrides: CareOverride[],
): CareOverride | undefined {
  const key = dateKey(date);
  return overrides.find(
    (override) => key >= override.startsOn && key <= override.endsOn,
  );
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

  const target = serialFromKey(dateKey(date));
  const anchor = serialFromKey(normalisedHandoverAnchor(rule));
  const weekIndex = Math.floor((target - anchor) / 7);
  return normalisedModulo(weekIndex, 2) === 0
    ? rule.householdLabel
    : otherHome(rule.householdLabel);
}

export function isHandoverDate(date: Date, rules: CareScheduleRule[]): boolean {
  const rule = rules[0];
  if (!rule) return false;
  const target = serialFromKey(dateKey(date));
  const anchor = serialFromKey(normalisedHandoverAnchor(rule));
  return normalisedModulo(target - anchor, 7) === 0;
}

export function nextHandoverDate(
  from: Date,
  rules: CareScheduleRule[],
  inclusive = false,
): Date | null {
  const rule = rules[0];
  if (!rule) return null;
  const fromSerial = serialFromKey(dateKey(from));
  const anchorSerial = serialFromKey(normalisedHandoverAnchor(rule));
  if (fromSerial < anchorSerial)
    return dateFromKey(keyFromSerial(anchorSerial));
  const remainder = normalisedModulo(fromSerial - anchorSerial, 7);
  const days = remainder === 0 ? (inclusive ? 0 : 7) : 7 - remainder;
  return dateFromKey(keyFromSerial(fromSerial + days));
}

export function carePlanForDate(
  date: Date,
  rules: CareScheduleRule[],
  overrides: CareOverride[],
  fallback: HomeLocation,
): {
  household: HomeLocation;
  handover: boolean;
  pickupParent?: ParentLabel;
  pickupLocation?: string;
  override?: CareOverride;
} {
  const rule = rules[0];
  const override = careOverrideForDate(date, overrides);
  return {
    household: householdForDate(date, rules, overrides, fallback),
    handover: isHandoverDate(date, rules),
    pickupParent:
      rule?.pickupParentLabel ??
      parentForHome(rule?.householdLabel ?? fallback),
    pickupLocation: rule?.pickupLocation,
    override,
  };
}

export function eventsOnDate(
  events: CalendarEvent[],
  date: Date,
): CalendarEvent[] {
  const key = dateKey(date);
  return events.filter((event) => {
    const start = dateKey(event.startsAt);
    const end = dateKey(event.endsAt ?? event.startsAt);
    return start <= key && end >= key;
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
  const targetHome = householdForDate(
    new Date(event.startsAt),
    rules,
    overrides,
    fallback,
  );
  const required = new Set(event.requiredItemIds);
  return items.filter((item) => {
    if (!required.has(item.id)) return false;
    if (item.location === targetHome) return false;
    if (
      item.location === "School" ||
      item.location === "School bag" ||
      item.location === "Handover bag" ||
      item.location === "In transit"
    ) {
      return false;
    }
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
    .filter(
      (event) => new Date(event.endsAt ?? event.startsAt).getTime() >= now,
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  for (const event of upcoming) {
    const mismatched = eventNeedsMoving(
      event,
      items,
      rules,
      overrides,
      fallback,
    );
    if (mismatched.length) return { event, items: mismatched };
  }
  return null;
}
