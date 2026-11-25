import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const TZ = 'Asia/Karachi';

/** Minutes before shift.startTime when on-time check-in becomes available (desk roles). */
export const CHECK_IN_EARLY_MINUTES = 20;

/**
 * Tech Department fixed shift (independent of admin Shift settings).
 * 06:00 PM – 03:00 AM PKT with a 10-minute on-time grace after start.
 */
export const TECH_SHIFT = {
  startTime: '18:00',
  endTime: '03:00',
  /** On-time Present window: shiftStart … shiftStart + grace (inclusive). */
  checkInGraceMinutes: 10,
};

export const isTechAttendanceRole = (role) =>
  String(role || '').trim() === 'tech_team';

/**
 * Merge global weekend/timezone with role-specific clock times.
 * Tech specialists always use TECH_SHIFT; other roles use admin Shift settings.
 */
export const resolveShiftSettingsForRole = (role, globalSettings = {}) => {
  const weekendDays = Array.isArray(globalSettings.weekendDays)
    ? globalSettings.weekendDays
    : [6, 0];
  if (isTechAttendanceRole(role)) {
    return {
      startTime: TECH_SHIFT.startTime,
      endTime: TECH_SHIFT.endTime,
      weekendDays,
      timezone: globalSettings.timezone || TZ,
    };
  }
  return {
    startTime: globalSettings.startTime || '19:00',
    endTime: globalSettings.endTime || '04:00',
    weekendDays,
    timezone: globalSettings.timezone || TZ,
  };
};

/**
 * Absolute PKT instant when on-time check-in opens.
 * Desk roles: 20 minutes before start. Tech: at shift start.
 */
export const getCheckInOpensAt = (shiftStartAt, role) => {
  if (isTechAttendanceRole(role)) {
    return dayjs(shiftStartAt).tz(TZ).toDate();
  }
  return dayjs(shiftStartAt)
    .tz(TZ)
    .subtract(CHECK_IN_EARLY_MINUTES, 'minute')
    .toDate();
};

/**
 * Absolute PKT instant when on-time check-in closes (inclusive end).
 * Desk roles: at shift start. Tech: shift start + 10 minutes.
 */
export const getCheckInClosesAt = (shiftStartAt, role) => {
  if (isTechAttendanceRole(role)) {
    return dayjs(shiftStartAt)
      .tz(TZ)
      .add(TECH_SHIFT.checkInGraceMinutes, 'minute')
      .toDate();
  }
  return dayjs(shiftStartAt).tz(TZ).toDate();
};

export const getShiftWindowForDate = (shiftDateStr, shiftSettings, role) => {
  const shiftStartAt = dayjs.tz(
    `${shiftDateStr} ${shiftSettings.startTime}`,
    'YYYY-MM-DD HH:mm',
    TZ
  );

  let shiftEndAt = dayjs.tz(
    `${shiftDateStr} ${shiftSettings.endTime}`,
    'YYYY-MM-DD HH:mm',
    TZ
  );

  const startMinutes =
    shiftStartAt.hour() * 60 + shiftStartAt.minute();
  const endMinutes = shiftEndAt.hour() * 60 + shiftEndAt.minute();

  if (endMinutes <= startMinutes) {
    shiftEndAt = shiftEndAt.add(1, 'day');
  }

  const checkInOpensAt = getCheckInOpensAt(shiftStartAt.toDate(), role);
  const checkInClosesAt = getCheckInClosesAt(shiftStartAt.toDate(), role);

  return {
    shiftStartAt: shiftStartAt.toDate(),
    shiftEndAt: shiftEndAt.toDate(),
    checkInOpensAt,
    checkInClosesAt,
  };
};

export const getCurrentShiftDate = (shiftSettings) => {
  const now = dayjs().tz(TZ);

  // Before noon PKT: still inside last night's overnight shift calendar day
  if (now.hour() < 12) {
    return now.subtract(1, 'day').format('YYYY-MM-DD');
  }

  return now.format('YYYY-MM-DD');
};

export const isWeekendShiftDate = (shiftDateStr, weekendDays) => {
  const dayOfWeek = dayjs.tz(shiftDateStr, 'YYYY-MM-DD', TZ).day();
  return weekendDays.includes(dayOfWeek);
};

/** Current calendar month in Asia/Karachi as YYYY-MM. */
export const currentPktMonth = () => dayjs().tz(TZ).format('YYYY-MM');

/**
 * Resolve a PKT calendar-month window for closed-sales / report scoping.
 * @param {string} [monthStr] YYYY-MM; omit / empty / "current" → this month in PKT
 * @returns {{ month: string, start: Date, end: Date }}
 */
export const resolvePktMonthRange = (monthStr) => {
  const raw =
    monthStr == null || monthStr === '' || monthStr === 'current'
      ? currentPktMonth()
      : String(monthStr).trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw new Error('month must be YYYY-MM');
  }

  const start = dayjs.tz(`${raw}-01`, 'YYYY-MM-DD', TZ).startOf('day');
  if (!start.isValid()) {
    throw new Error('month must be a valid YYYY-MM');
  }

  return {
    month: raw,
    start: start.toDate(),
    end: start.add(1, 'month').toDate(),
  };
};
