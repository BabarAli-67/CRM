import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import { toCsv } from '../utils/csv.util.js';
import {
  getOrCreateTodayRecord,
  checkIn,
  submitLateRequest,
  checkOut,
  extendShift,
  getPendingLateRequests,
  approveLateRequest,
  forceAbsent,
  getMyHistory,
  getAttendanceGrid,
} from '../services/attendance.service.js';

export const getTodayStatus = asyncHandler(async (req, res) => {
  const attendance = await getOrCreateTodayRecord(req.user._id);

  res.status(200).json(
    new ApiResponse(
      200,
      { attendance, serverTime: new Date() },
      "Today's attendance status retrieved"
    )
  );
});

export const markCheckIn = asyncHandler(async (req, res) => {
  const attendance = await checkIn(req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, { attendance }, 'Checked in successfully'));
});

export const requestLate = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const attendance = await submitLateRequest(req.user._id, reason);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { attendance },
        'Late attendance request submitted for Super Admin review'
      )
    );
});

export const markCheckOut = asyncHandler(async (req, res) => {
  const attendance = await checkOut(req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, { attendance }, 'Checked out successfully'));
});

export const requestExtend = asyncHandler(async (req, res) => {
  const attendance = await extendShift(req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, { attendance }, 'Shift extended by 30 minutes'));
});

export const getHistory = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const records = await getMyHistory(req.user._id, { month });

  res
    .status(200)
    .json(new ApiResponse(200, { records }, 'Attendance history retrieved'));
});

export const getLateQueue = asyncHandler(async (req, res) => {
  const requests = await getPendingLateRequests();

  res
    .status(200)
    .json(new ApiResponse(200, { requests }, 'Pending late requests retrieved'));
});

export const getGrid = asyncHandler(async (req, res) => {
  const { from, to, userId, status } = req.query;
  const records = await getAttendanceGrid({ from, to, userId, status });

  res
    .status(200)
    .json(new ApiResponse(200, { records }, 'Attendance grid retrieved'));
});

export const exportGrid = asyncHandler(async (req, res) => {
  const { from, to, userId, status } = req.query;
  const records = await getAttendanceGrid({ from, to, userId, status });

  const rows = records.map((record) => ({
    employeeName: record.user?.fullName ?? '',
    username: record.user?.username ?? '',
    role: record.user?.role ?? '',
    shiftDate: record.shiftDate ?? '',
    status: record.status ?? '',
    lateMinutes:
      record.lateMinutes === null || record.lateMinutes === undefined
        ? ''
        : record.lateMinutes,
    checkInTime: record.checkInTime ? record.checkInTime.toISOString() : '',
    checkOutTime: record.checkOutTime ? record.checkOutTime.toISOString() : '',
    workedMinutes:
      record.workedMinutes === null || record.workedMinutes === undefined
        ? ''
        : record.workedMinutes,
  }));

  const csvString = toCsv(rows, [
    { key: 'employeeName', label: 'Employee' },
    { key: 'username', label: 'Username' },
    { key: 'role', label: 'Role' },
    { key: 'shiftDate', label: 'Shift Date' },
    { key: 'status', label: 'Status' },
    { key: 'lateMinutes', label: 'Late Minutes' },
    { key: 'checkInTime', label: 'Check In' },
    { key: 'checkOutTime', label: 'Check Out' },
    { key: 'workedMinutes', label: 'Worked Minutes' },
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="attendance-export.csv"'
  );
  res.status(200).send(csvString);
});

export const approveAttendance = asyncHandler(async (req, res) => {
  const { decision } = req.body;
  const { id } = req.params;
  const attendance = await approveLateRequest(id, decision, req.user._id);

  const message =
    decision === 'absent'
      ? 'Attendance request marked as absent'
      : decision === 'late'
        ? 'Attendance approved as late'
        : 'Attendance approved as present';

  res.status(200).json(new ApiResponse(200, { attendance }, message));
});

export const overrideForceAbsent = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const { id } = req.params;
  const attendance = await forceAbsent(id, reason, req.user._id);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { attendance },
        'Employee marked absent by Super Admin override'
      )
    );
});
