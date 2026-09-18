import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const TZ = 'Asia/Karachi';

/** Minutes before shift.startTime when on-time check-in becomes available. */
export const CHECK_IN_EARLY_MINUTES = 20;

/**
 * Absolute PKT instant when check-in opens for a given shift start.
 * Derived from dynamic shiftStartAt — never from a hardcoded clock time.
 */
export const getCheckInOpensAt = (shiftStartAt) =>
  dayjs(shiftStartAt).tz(TZ).subtract(CHECK_IN_EARLY_MINUTES, 'minute').toDate();

export const getShiftWindowForDate = (shiftDateStr, shiftSettings) => {
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

  const checkInOpensAt = shiftStartAt
    .subtract(CHECK_IN_EARLY_MINUTES, 'minute')
    .toDate();

  return {
    shiftStartAt: shiftStartAt.toDate(),
    shiftEndAt: shiftEndAt.toDate(),
    checkInOpensAt,
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
