import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const TZ = 'Asia/Karachi';

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

  return {
    shiftStartAt: shiftStartAt.toDate(),
    shiftEndAt: shiftEndAt.toDate(),
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
