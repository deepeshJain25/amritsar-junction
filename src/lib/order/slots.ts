// Pickup and delivery times, worked out in Sydney time whatever the device's own clock zone is.
// The checkout page offers these slots and the Worker checks the chosen one against the same rules.
import { ordering, type FulfilmentType } from '../../content/ordering';

export interface Slot {
  /** The moment as an ISO string in UTC, e.g. "2026-11-25T08:15:00.000Z". */
  iso: string;
  /** "7:15pm" */
  time: string;
  /** "Today", "Tomorrow" or "Friday 27 November" */
  day: string;
}

const { timeZone } = ordering;
const MINUTE = 60_000;

/** Sydney's date parts for an instant. */
function local(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, minutes: +parts.hour * 60 + +parts.minute, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}

/** The instant at a Sydney wall-clock time. Two passes settle the offset across a daylight-saving change. */
function instant(y: number, m: number, d: number, minutes: number): Date {
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let at = new Date(wall);
  for (let i = 0; i < 2; i++) {
    const l = local(at);
    const shown = Date.UTC(l.y, l.m - 1, l.d, 0, l.minutes);
    at = new Date(at.getTime() - (shown - wall));
  }
  return at;
}

const timeLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

function dayLabel(offset: number, at: Date) {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(at);
}

/** Every slot from the earliest possible time over the next few days. */
export function slotsFor(type: FulfilmentType, now = new Date()): Slot[] {
  const lead = ordering.prepMinutes + (type === 'delivery' ? ordering.delivery.extraMinutes : 0);
  const earliest = now.getTime() + lead * MINUTE;
  const today = local(now);
  const slots: Slot[] = [];
  for (let offset = 0; offset < ordering.daysAhead; offset++) {
    // Noon on the day in question, so the date arithmetic never trips over midnight.
    const noon = instant(today.y, today.m, today.d + offset, 12 * 60);
    const day = local(noon);
    const [open, close] = ordering.hours[day.weekday] ?? [0, 0];
    for (let t = open + lead; t <= close - ordering.lastSlotBeforeClose; t += ordering.slotMinutes) {
      const at = instant(day.y, day.m, day.d, t);
      if (at.getTime() < earliest) continue;
      slots.push({ iso: at.toISOString(), time: timeLabel(t), day: dayLabel(offset, at) });
    }
  }
  return slots;
}

/** True when the time is one we would offer right now. Five minutes of grace cover a slow form. */
export function isValidSlot(type: FulfilmentType, iso: string, now = new Date()): boolean {
  return slotsFor(type, new Date(now.getTime() - 5 * MINUTE)).some((s) => s.iso === iso);
}

/** "7:15pm today", "11:15am tomorrow" or "11:15am on Friday 27 November", for confirmation copy. */
export function describeSlot(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const a = local(at);
  const b = local(now);
  const days = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${dayLabel(days, at)}`;
  return `${timeLabel(a.minutes)} ${day}`;
}

/** The slot's time alone, e.g. "7:15pm". */
export const slotTime = (iso: string) => timeLabel(local(new Date(iso)).minutes);
