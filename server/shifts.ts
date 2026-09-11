import { db } from './db.ts';

export interface ShiftInfo {
  name: 'Morning' | 'Mid' | 'Night';
  startTime: string; // e.g. "06:00"
  endTime: string;   // e.g. "14:00"
  currentDate: string; // YYYY-MM-DD operational date
  timeRemainingSeconds: number;
  timeRemainingFormatted: string; // "HH:MM:SS"
  approachingEnd: boolean; // true if <= 30 mins
  timezone: string;
  nextShift: 'Morning' | 'Mid' | 'Night';
  previousShift: 'Morning' | 'Mid' | 'Night';
  colorTheme: string; // 'blue' | 'orange' | 'purple'
}

export function getSettings() {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  return row || {
    team_name: 'Operations Team',
    app_name: 'Hando',
    timezone: 'Africa/Cairo',
    morning_start: '06:00',
    morning_end: '14:00',
    mid_start: '14:00',
    mid_end: '22:00',
    night_start: '22:00',
    night_end: '06:00',
    session_timeout: 60,
    default_priority: 'Medium',
    installed: 0
  };
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculates current operational shift according to configured timezone and shift boundaries.
 * Correctly accounts for Night shift crossing midnight (e.g., 22:00 to 06:00 next day).
 */
export function getCurrentShift(customDate?: Date): ShiftInfo {
  const settings = getSettings();
  const tz = settings.timezone || 'Africa/Cairo';

  const now = customDate || new Date();

  // Get current time parts in target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  const currentMinutes = hour * 60 + minute;
  const currentSecondsInDay = currentMinutes * 60 + second;

  const mStart = parseTimeToMinutes(settings.morning_start); // 360 (06:00)
  const mEnd = parseTimeToMinutes(settings.morning_end);     // 840 (14:00)
  const midStart = parseTimeToMinutes(settings.mid_start);  // 840 (14:00)
  const midEnd = parseTimeToMinutes(settings.mid_end);      // 1320 (22:00)
  const nStart = parseTimeToMinutes(settings.night_start);  // 1320 (22:00)
  const nEnd = parseTimeToMinutes(settings.night_end);      // 360 (06:00)

  let shiftName: 'Morning' | 'Mid' | 'Night' = 'Morning';
  let startTime = settings.morning_start;
  let endTime = settings.morning_end;
  let operationalDate = `${year}-${month}-${day}`;
  let secondsRemaining = 0;
  let nextShift: 'Morning' | 'Mid' | 'Night' = 'Mid';
  let previousShift: 'Morning' | 'Mid' | 'Night' = 'Night';
  let colorTheme: 'blue' | 'orange' | 'purple' = 'blue';

  if (currentMinutes >= mStart && currentMinutes < mEnd) {
    // Morning Shift
    shiftName = 'Morning';
    startTime = settings.morning_start;
    endTime = settings.morning_end;
    nextShift = 'Mid';
    previousShift = 'Night';
    colorTheme = 'blue';
    const endSeconds = mEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else if (currentMinutes >= midStart && currentMinutes < midEnd) {
    // Mid Shift
    shiftName = 'Mid';
    startTime = settings.mid_start;
    endTime = settings.mid_end;
    nextShift = 'Night';
    previousShift = 'Morning';
    colorTheme = 'orange';
    const endSeconds = midEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else {
    // Night Shift (Crosses midnight: e.g. 22:00 -> 06:00)
    shiftName = 'Night';
    startTime = settings.night_start;
    endTime = settings.night_end;
    nextShift = 'Morning';
    previousShift = 'Mid';
    colorTheme = 'purple';

    if (currentMinutes >= nStart) {
      // 22:00 to 23:59 on calendar day D
      // Shift ends at 06:00 on calendar day D+1
      operationalDate = `${year}-${month}-${day}`;
      const secondsUntilMidnight = (24 * 60 * 60) - currentSecondsInDay;
      const secondsAfterMidnightUntilEnd = nEnd * 60;
      secondsRemaining = Math.max(0, secondsUntilMidnight + secondsAfterMidnightUntilEnd);
    } else {
      // 00:00 to 05:59 on calendar day D
      // The operational shift began on day D-1 at 22:00
      // Calculate day D-1
      const prevDayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const prevParts = formatter.formatToParts(prevDayDate);
      const pYear = prevParts.find(p => p.type === 'year')?.value || year;
      const pMonth = prevParts.find(p => p.type === 'month')?.value || month;
      const pDay = prevParts.find(p => p.type === 'day')?.value || day;
      operationalDate = `${pYear}-${pMonth}-${pDay}`;

      const endSeconds = nEnd * 60;
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    }
  }

  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  const s = secondsRemaining % 60;
  const timeRemainingFormatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const approachingEnd = secondsRemaining <= 30 * 60 && secondsRemaining > 0;

  return {
    name: shiftName,
    startTime,
    endTime,
    currentDate: operationalDate,
    timeRemainingSeconds: secondsRemaining,
    timeRemainingFormatted,
    approachingEnd,
    timezone: tz,
    nextShift,
    previousShift,
    colorTheme
  };
}
