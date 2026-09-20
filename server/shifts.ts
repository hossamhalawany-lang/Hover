import { db } from './db.ts';

export interface ShiftInfo {
  name: 'Morning' | 'Mid' | 'Night' | '24H On-Call';
  userShift?: string;
  startTime: string; // e.g. "06:00"
  endTime: string;   // e.g. "14:00"
  currentDate: string; // Business operational date (YYYY-MM-DD)
  businessDate: string; // Business operational date (explicit alias)
  calendarDate: string; // Real calendar date in local timezone (YYYY-MM-DD)
  previousShiftBusinessDate: string; // Business date of the preceding shift
  timeRemainingSeconds: number;
  timeRemainingFormatted: string; // "HH:MM:SS"
  approachingEnd: boolean; // true if <= 30 mins
  timezone: string;
  nextShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call';
  previousShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call';
  colorTheme: 'blue' | 'orange' | 'purple' | 'indigo';
  isOnCallDay?: boolean;
  dayType?: 'WEEKDAY' | 'WEEKEND_ONCALL' | 'HOLIDAY_ONCALL';
  dayName?: string;
  onCallReason?: string;
  weekendHolidayShiftMode?: 'SINGLE_OPERATOR_24H' | 'THREE_SHIFTS';
  isUnified24HActive?: boolean;
  crossesMidnight?: boolean;
  isNightCrossoverActive?: boolean;
}

export interface ShiftScheduleEntry {
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
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
    session_timeout: 1440,
    default_priority: 'Medium',
    installed: 1,
    weekend_oncall_enabled: 1,
    weekend_holiday_shift_mode: 'SINGLE_OPERATOR_24H',
    holiday_dates: ''
  };
}

/**
 * Loads dynamic shift schedule from the database 'shifts' table.
 * Falls back to settings columns if table is empty.
 */
export function getShiftSchedule(): Record<string, ShiftScheduleEntry> {
  const settings = getSettings();
  try {
    const rows = db.prepare('SELECT name, start_time, end_time, crosses_midnight FROM shifts ORDER BY display_order ASC').all() as any[];
    if (rows && rows.length >= 3) {
      const schedule: Record<string, ShiftScheduleEntry> = {};
      for (const r of rows) {
        schedule[r.name] = {
          name: r.name,
          startTime: r.start_time,
          endTime: r.end_time,
          crossesMidnight: Boolean(r.crosses_midnight)
        };
      }
      return schedule;
    }
  } catch (err) {
    // Fallback below
  }

  return {
    Morning: {
      name: 'Morning',
      startTime: settings.morning_start || '06:00',
      endTime: settings.morning_end || '14:00',
      crossesMidnight: false
    },
    Mid: {
      name: 'Mid',
      startTime: settings.mid_start || '14:00',
      endTime: settings.mid_end || '22:00',
      crossesMidnight: false
    },
    Night: {
      name: 'Night',
      startTime: settings.night_start || '22:00',
      endTime: settings.night_end || '06:00',
      crossesMidnight: true
    }
  };
}

/**
 * Checks whether a given operational date (YYYY-MM-DD) is a weekend (Friday or Saturday in Cairo/Egypt work cycle)
 * or an official holiday.
 */
export function checkIsOnCallDay(dateStr: string, settings: any): { isOnCall: boolean; dayType: 'WEEKDAY' | 'WEEKEND_ONCALL' | 'HOLIDAY_ONCALL'; reason?: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

  // 1. Check custom configured holiday dates
  const holidays = (settings.holiday_dates || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (holidays.includes(dateStr)) {
    return {
      isOnCall: true,
      dayType: 'HOLIDAY_ONCALL',
      reason: 'Official Holiday - Full-Day On-Call Coverage'
    };
  }

  // 2. Check weekend if enabled (Friday = 5, Saturday = 6)
  const weekendEnabled = settings.weekend_oncall_enabled !== 0;
  if (weekendEnabled && (dayOfWeek === 5 || dayOfWeek === 6)) {
    const dayName = dayOfWeek === 5 ? 'Friday' : 'Saturday';
    return {
      isOnCall: true,
      dayType: 'WEEKEND_ONCALL',
      reason: `${dayName} Weekend - 24H On-Call Duty`
    };
  }

  return {
    isOnCall: false,
    dayType: 'WEEKDAY'
  };
}

export function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Helper to add or subtract days from a YYYY-MM-DD date string.
 */
export function shiftDateDays(dateStr: string, daysDelta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d + daysDelta, 12, 0, 0));
  const newY = dateObj.getUTCFullYear();
  const newM = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

/**
 * Computes the exact preceding shift name and its operational Business Date.
 */
export function getPrecedingShift(shiftName: string, businessDate: string): { shiftName: 'Morning' | 'Mid' | 'Night' | '24H On-Call'; businessDate: string } {
  if (shiftName === 'Morning') {
    return {
      shiftName: 'Night',
      businessDate: shiftDateDays(businessDate, -1)
    };
  }
  if (shiftName === 'Mid') {
    return {
      shiftName: 'Morning',
      businessDate: businessDate
    };
  }
  if (shiftName === 'Night') {
    return {
      shiftName: 'Mid',
      businessDate: businessDate
    };
  }
  // 24H On-Call
  return {
    shiftName: '24H On-Call',
    businessDate: shiftDateDays(businessDate, -1)
  };
}

/**
 * Computes the exact next shift name and its operational Business Date.
 */
export function getNextShift(shiftName: string, businessDate: string): { shiftName: 'Morning' | 'Mid' | 'Night' | '24H On-Call'; businessDate: string } {
  if (shiftName === 'Morning') {
    return {
      shiftName: 'Mid',
      businessDate: businessDate
    };
  }
  if (shiftName === 'Mid') {
    return {
      shiftName: 'Night',
      businessDate: businessDate
    };
  }
  if (shiftName === 'Night') {
    return {
      shiftName: 'Morning',
      businessDate: shiftDateDays(businessDate, 1)
    };
  }
  // 24H On-Call
  return {
    shiftName: '24H On-Call',
    businessDate: shiftDateDays(businessDate, 1)
  };
}

/**
 * Core Business Date calculation for shifts crossing midnight.
 * Ensures that any night shift activity occurring after 00:00 (midnight)
 * maintains its true originating Business Date (calendar day D - 1).
 */
export function calculateBusinessDate(
  shiftName: string,
  now: Date,
  tz: string,
  schedule: Record<string, ShiftScheduleEntry>
): { businessDate: string; calendarDate: string; isNightCrossoverActive: boolean } {
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
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  const currentMinutes = hour * 60 + minute;
  const calendarDate = `${year}-${month}-${day}`;

  const nightConfig = schedule.Night || { startTime: '22:00', endTime: '06:00', crossesMidnight: true };
  const nStart = parseTimeToMinutes(nightConfig.startTime);
  const nEnd = parseTimeToMinutes(nightConfig.endTime);

  if (shiftName === 'Night') {
    if (currentMinutes >= nStart) {
      // 22:00 - 23:59: Started tonight, Business Date is today
      return {
        businessDate: calendarDate,
        calendarDate,
        isNightCrossoverActive: false
      };
    }
    if (currentMinutes < nEnd) {
      // 00:00 - 05:59: Crosses midnight! Started yesterday at 22:00, Business Date is YESTERDAY
      const yesterdayStr = shiftDateDays(calendarDate, -1);
      return {
        businessDate: yesterdayStr,
        calendarDate,
        isNightCrossoverActive: true
      };
    }
    // During daytime hours (06:00 to 12:00 noon):
    // Referencing "Night" shift means inspecting or closing the shift that just concluded overnight
    if (currentMinutes < 12 * 60) {
      return {
        businessDate: shiftDateDays(calendarDate, -1),
        calendarDate,
        isNightCrossoverActive: false
      };
    }
    // During afternoon/evening (12:00 to 22:00):
    // Referencing "Night" shift means preparing for tonight's upcoming shift
    return {
      businessDate: calendarDate,
      calendarDate,
      isNightCrossoverActive: false
    };
  }

  if (shiftName === '24H On-Call') {
    // If between 00:00 and 06:00, belongs to the 24H cycle started yesterday morning
    if (currentMinutes < nEnd) {
      return {
        businessDate: shiftDateDays(calendarDate, -1),
        calendarDate,
        isNightCrossoverActive: true
      };
    }
    return {
      businessDate: calendarDate,
      calendarDate,
      isNightCrossoverActive: false
    };
  }

  // Morning and Mid shifts always align directly with calendar date
  return {
    businessDate: calendarDate,
    calendarDate,
    isNightCrossoverActive: false
  };
}

/**
 * Calculates current operational shift according to configured timezone and shift schedule.
 * Correctly accounts for Night shift crossing midnight (22:00 to 06:00) with Business Date preservation.
 */
export function getCurrentShift(customDate?: Date): ShiftInfo {
  const settings = getSettings();
  const schedule = getShiftSchedule();
  const tz = settings.timezone || 'Africa/Cairo';

  const now = customDate || new Date();

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
  const calendarDate = `${year}-${month}-${day}`;

  const mStart = parseTimeToMinutes(schedule.Morning.startTime);
  const mEnd = parseTimeToMinutes(schedule.Morning.endTime);
  const midStart = parseTimeToMinutes(schedule.Mid.startTime);
  const midEnd = parseTimeToMinutes(schedule.Mid.endTime);
  const nStart = parseTimeToMinutes(schedule.Night.startTime);
  const nEnd = parseTimeToMinutes(schedule.Night.endTime);

  let shiftName: 'Morning' | 'Mid' | 'Night' | '24H On-Call' = 'Morning';
  let startTime = schedule.Morning.startTime;
  let endTime = schedule.Morning.endTime;
  let businessDate = calendarDate;
  let secondsRemaining = 0;
  let nextShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call' = 'Mid';
  let previousShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call' = 'Night';
  let colorTheme: 'blue' | 'orange' | 'purple' | 'indigo' = 'blue';
  let isNightCrossoverActive = false;

  if (currentMinutes >= mStart && currentMinutes < mEnd) {
    // Morning Shift
    shiftName = 'Morning';
    startTime = schedule.Morning.startTime;
    endTime = schedule.Morning.endTime;
    businessDate = calendarDate;
    nextShift = 'Mid';
    previousShift = 'Night';
    colorTheme = 'blue';
    const endSeconds = mEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else if (currentMinutes >= midStart && currentMinutes < midEnd) {
    // Mid Shift
    shiftName = 'Mid';
    startTime = schedule.Mid.startTime;
    endTime = schedule.Mid.endTime;
    businessDate = calendarDate;
    nextShift = 'Night';
    previousShift = 'Morning';
    colorTheme = 'orange';
    const endSeconds = midEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else {
    // Night Shift (Crosses midnight: 22:00 -> 06:00)
    shiftName = 'Night';
    startTime = schedule.Night.startTime;
    endTime = schedule.Night.endTime;
    nextShift = 'Morning';
    previousShift = 'Mid';
    colorTheme = 'purple';

    if (currentMinutes >= nStart) {
      // 22:00 to 23:59 on calendar day D
      businessDate = calendarDate;
      const secondsUntilMidnight = (24 * 60 * 60) - currentSecondsInDay;
      const secondsAfterMidnightUntilEnd = nEnd * 60;
      secondsRemaining = Math.max(0, secondsUntilMidnight + secondsAfterMidnightUntilEnd);
    } else {
      // 00:00 to 05:59 on calendar day D
      // Operational shift began on D - 1
      businessDate = shiftDateDays(calendarDate, -1);
      isNightCrossoverActive = true;
      const endSeconds = nEnd * 60;
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    }
  }

  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  const s = secondsRemaining % 60;
  const timeRemainingFormatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const approachingEnd = secondsRemaining <= 30 * 60 && secondsRemaining > 0;
  const onCallCheck = checkIsOnCallDay(businessDate, settings);

  const [opY, opM, opD] = businessDate.split('-').map(Number);
  const opDateObj = new Date(Date.UTC(opY, opM - 1, opD, 12, 0, 0));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[opDateObj.getUTCDay()];

  const weekendHolidayShiftMode = (settings.weekend_holiday_shift_mode || 'SINGLE_OPERATOR_24H') as 'SINGLE_OPERATOR_24H' | 'THREE_SHIFTS';
  const isUnified24HActive = Boolean(onCallCheck.isOnCall && weekendHolidayShiftMode === 'SINGLE_OPERATOR_24H');

  const preceding = getPrecedingShift(shiftName, businessDate);

  return {
    name: shiftName,
    startTime,
    endTime,
    currentDate: businessDate,
    businessDate,
    calendarDate,
    previousShiftBusinessDate: preceding.businessDate,
    timeRemainingSeconds: secondsRemaining,
    timeRemainingFormatted,
    approachingEnd,
    timezone: tz,
    nextShift,
    previousShift,
    colorTheme,
    isOnCallDay: onCallCheck.isOnCall,
    dayType: onCallCheck.dayType,
    dayName,
    onCallReason: onCallCheck.reason,
    weekendHolidayShiftMode,
    isUnified24HActive,
    crossesMidnight: shiftName === 'Night',
    isNightCrossoverActive
  };
}

/**
 * Returns ShiftInfo configured specifically for a given target shift name,
 * matching operational boundaries, colors, previous/next transitions, and timing.
 */
export function getShiftByName(targetShift: string, customDate?: Date): ShiftInfo {
  const current = getCurrentShift(customDate);
  if (current.name === targetShift && !current.isUnified24HActive) {
    return current;
  }

  const settings = getSettings();
  const schedule = getShiftSchedule();
  const tz = settings.timezone || 'Africa/Cairo';
  const now = customDate || new Date();

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
  const calendarDate = `${year}-${month}-${day}`;

  const mStart = parseTimeToMinutes(schedule.Morning.startTime);
  const mEnd = parseTimeToMinutes(schedule.Morning.endTime);
  const midStart = parseTimeToMinutes(schedule.Mid.startTime);
  const midEnd = parseTimeToMinutes(schedule.Mid.endTime);
  const nStart = parseTimeToMinutes(schedule.Night.startTime);
  const nEnd = parseTimeToMinutes(schedule.Night.endTime);

  let startTime = schedule.Morning.startTime;
  let endTime = schedule.Morning.endTime;
  let businessDate = calendarDate;
  let secondsRemaining = 0;
  let nextShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call' = 'Mid';
  let previousShift: 'Morning' | 'Mid' | 'Night' | '24H On-Call' = 'Night';
  let colorTheme: 'blue' | 'orange' | 'purple' | 'indigo' = 'blue';
  let isNightCrossoverActive = false;

  if (targetShift === 'Morning') {
    startTime = schedule.Morning.startTime;
    endTime = schedule.Morning.endTime;
    nextShift = 'Mid';
    previousShift = 'Night';
    colorTheme = 'blue';
    businessDate = calendarDate;
    const endSeconds = mEnd * 60;
    if (currentMinutes < mStart) {
      secondsRemaining = (mEnd - currentMinutes) * 60;
    } else if (currentMinutes < mEnd) {
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  } else if (targetShift === 'Mid') {
    startTime = schedule.Mid.startTime;
    endTime = schedule.Mid.endTime;
    nextShift = 'Night';
    previousShift = 'Morning';
    colorTheme = 'orange';
    businessDate = calendarDate;
    const endSeconds = midEnd * 60;
    if (currentMinutes < midStart) {
      secondsRemaining = (midEnd - currentMinutes) * 60;
    } else if (currentMinutes < midEnd) {
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  } else if (targetShift === 'Night') {
    startTime = schedule.Night.startTime;
    endTime = schedule.Night.endTime;
    nextShift = 'Morning';
    previousShift = 'Mid';
    colorTheme = 'purple';

    const bRes = calculateBusinessDate('Night', now, tz, schedule);
    businessDate = bRes.businessDate;
    isNightCrossoverActive = bRes.isNightCrossoverActive;

    if (currentMinutes >= nStart) {
      const secondsUntilMidnight = (24 * 60 * 60) - currentSecondsInDay;
      const secondsAfterMidnightUntilEnd = nEnd * 60;
      secondsRemaining = Math.max(0, secondsUntilMidnight + secondsAfterMidnightUntilEnd);
    } else if (currentMinutes < nEnd) {
      const endSeconds = nEnd * 60;
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  } else {
    // 24H On-Call Duty (Single Operator)
    startTime = schedule.Morning.startTime;
    endTime = schedule.Night.endTime;
    nextShift = '24H On-Call';
    previousShift = '24H On-Call';
    colorTheme = 'indigo';

    const bRes = calculateBusinessDate('24H On-Call', now, tz, schedule);
    businessDate = bRes.businessDate;
    isNightCrossoverActive = bRes.isNightCrossoverActive;

    // Remaining in 24-hour cycle until tomorrow morning's handoff
    if (currentMinutes < mStart) {
      secondsRemaining = (mStart - currentMinutes) * 60;
    } else {
      const secondsUntilMidnight = (24 * 60 * 60) - currentSecondsInDay;
      const secondsTomorrow = mStart * 60;
      secondsRemaining = secondsUntilMidnight + secondsTomorrow;
    }
  }

  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  const s = secondsRemaining % 60;
  const timeRemainingFormatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const approachingEnd = secondsRemaining <= 30 * 60 && secondsRemaining > 0;
  const onCallCheck = checkIsOnCallDay(businessDate, settings);

  const [opY, opM, opD] = businessDate.split('-').map(Number);
  const opDateObj = new Date(Date.UTC(opY, opM - 1, opD, 12, 0, 0));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[opDateObj.getUTCDay()];

  const weekendHolidayShiftMode = (settings.weekend_holiday_shift_mode || 'SINGLE_OPERATOR_24H') as 'SINGLE_OPERATOR_24H' | 'THREE_SHIFTS';
  const isUnified24HActive = Boolean(onCallCheck.isOnCall && weekendHolidayShiftMode === 'SINGLE_OPERATOR_24H');

  const preceding = getPrecedingShift(targetShift, businessDate);

  return {
    name: targetShift as any,
    startTime,
    endTime,
    currentDate: businessDate,
    businessDate,
    calendarDate,
    previousShiftBusinessDate: preceding.businessDate,
    timeRemainingSeconds: secondsRemaining,
    timeRemainingFormatted,
    approachingEnd,
    timezone: tz,
    nextShift,
    previousShift,
    colorTheme,
    isOnCallDay: onCallCheck.isOnCall,
    dayType: onCallCheck.dayType,
    dayName,
    onCallReason: onCallCheck.reason,
    weekendHolidayShiftMode,
    isUnified24HActive,
    crossesMidnight: targetShift === 'Night' || targetShift === '24H On-Call',
    isNightCrossoverActive
  };
}
