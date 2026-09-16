import dayjs from 'dayjs';
import Attendance from '../models/attendance.model.js';
import { getOrCreateShiftSettings } from '../services/shift.service.js';

const runAutoCheckoutSweep = async () => {
  await getOrCreateShiftSettings();

  const openRecords = await Attendance.find({
    status: { $in: ['present', 'late'] },
    checkOutTime: null,
  });

  const now = new Date();
  let autoCheckedOutCount = 0;

  for (const record of openRecords) {
    const cutoff = record.extendedUntil
      ? record.extendedUntil
      : dayjs(record.shiftEndAt).add(90, 'second').toDate();

    if (now >= cutoff) {
      record.checkOutTime = cutoff;
      record.workedMinutes = Math.round(
        (record.checkOutTime - record.checkInTime) / 60000
      );
      record.autoCheckedOut = true;
      await record.save();
      autoCheckedOutCount += 1;
    }
  }

  console.log(`Auto-checkout sweep: ${autoCheckedOutCount} record(s) checked out`);
};

export default runAutoCheckoutSweep;
