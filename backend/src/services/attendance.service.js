import dayjs from 'dayjs';
import Attendance from '../models/attendance.model.js';
import User from '../models/user.model.js';
import { getOrCreateShiftSettings } from './shift.service.js';
import {
  TZ,
  getShiftWindowForDate,
  getCurrentShiftDate,
  isWeekendShiftDate,
  getCheckInOpensAt,
  getCheckInClosesAt,
  isTechAttendanceRole,
  resolveShiftSettingsForRole,
} from '../utils/shiftTime.util.js';
import { ApiError } from '../utils/apiError.util.js';

/** Roles that track personal attendance / shifts. Tech Head is excluded. */
export const PERSONAL_ATTENDANCE_ROLES = [
  'sales_agent',
  'closer',
  'cst_manager',
  'tech_team',
];

export const assertPersonalAttendanceRole = (user) => {
  const role = String(user?.role || '').trim();
  if (!PERSONAL_ATTENDANCE_ROLES.includes(role)) {
    throw new ApiError(
      403,
      'Forbidden: Tech Head has no personal attendance. Use Tech Team Attendance instead.'
    );
  }
};

const resolveUserRole = async (userId, roleHint) => {
  if (roleHint) return String(roleHint).trim();
  const user = await User.findById(userId).select('role');
  return String(user?.role || '').trim();
};

const attachCheckInWindow = (record, role) => {
  const plain =
    typeof record.toObject === 'function' ? record.toObject() : { ...record };
  plain.checkInOpensAt = getCheckInOpensAt(plain.shiftStartAt, role);
  plain.checkInClosesAt = getCheckInClosesAt(plain.shiftStartAt, role);
  plain.shiftProfile = isTechAttendanceRole(role) ? 'tech' : 'default';
  return plain;
};

export const getOrCreateTodayRecord = async (userId, roleHint) => {
  const role = await resolveUserRole(userId, roleHint);
  const globalSettings = await getOrCreateShiftSettings();
  const settings = resolveShiftSettingsForRole(role, globalSettings);
  const shiftDate = getCurrentShiftDate(settings);
  const { shiftStartAt, shiftEndAt } = getShiftWindowForDate(
    shiftDate,
    settings,
    role
  );

  const existing = await Attendance.findOne({ user: userId, shiftDate });
  if (existing) {
    // Keep Tech shift clocks aligned before check-in (role-specific schedule).
    if (
      !existing.checkInTime &&
      existing.status !== 'weekend_off' &&
      existing.status !== 'pending_approval' &&
      (new Date(existing.shiftStartAt).getTime() !==
        new Date(shiftStartAt).getTime() ||
        new Date(existing.shiftEndAt).getTime() !==
          new Date(shiftEndAt).getTime())
    ) {
      existing.shiftStartAt = shiftStartAt;
      existing.shiftEndAt = shiftEndAt;
      await existing.save();
    }
    return existing;
  }

  if (isWeekendShiftDate(shiftDate, settings.weekendDays)) {
    return Attendance.create({
      user: userId,
      shiftDate,
      shiftStartAt,
      shiftEndAt,
      status: 'weekend_off',
    });
  }

  // Both "before open" and "already past on-time window" store auto_absent;
  // callers compare now vs check-in open/close to decide Mark vs Request.
  return Attendance.create({
    user: userId,
    shiftDate,
    shiftStartAt,
    shiftEndAt,
    status: 'auto_absent',
  });
};

export const getTodayAttendancePayload = async (userId, roleHint) => {
  const role = await resolveUserRole(userId, roleHint);
  const record = await getOrCreateTodayRecord(userId, role);
  return attachCheckInWindow(record, role);
};

export const checkIn = async (userId, roleHint) => {
  const role = await resolveUserRole(userId, roleHint);
  const record = await getOrCreateTodayRecord(userId, role);

  if (record.status === 'weekend_off') {
    throw new ApiError(400, 'Today is a weekend off day — no check-in required');
  }

  if (record.checkInTime) {
    throw new ApiError(409, 'You have already checked in today');
  }

  const now = dayjs().tz(TZ).toDate();
  const checkInOpensAt = getCheckInOpensAt(record.shiftStartAt, role);
  const checkInClosesAt = getCheckInClosesAt(record.shiftStartAt, role);

  if (now < checkInOpensAt) {
    throw new ApiError(
      400,
      isTechAttendanceRole(role)
        ? 'Check-in window is not open yet. Tech check-in opens at shift start (06:00 PM PKT).'
        : 'Check-in window is not open yet. Check-in opens 20 minutes before shift start.'
    );
  }

  // Inclusive close: Present through checkInClosesAt (Tech: 06:10 PM PKT).
  if (now > checkInClosesAt) {
    throw new ApiError(
      403,
      'The on-time check-in window has closed. Please submit a late attendance request instead.'
    );
  }

  record.checkInTime = now;
  record.status = 'present';
  await record.save();

  return record;
};

const findTodayRecord = async (userId, roleHint) => {
  const role = await resolveUserRole(userId, roleHint);
  const globalSettings = await getOrCreateShiftSettings();
  const settings = resolveShiftSettingsForRole(role, globalSettings);
  const shiftDate = getCurrentShiftDate(settings);
  return Attendance.findOne({ user: userId, shiftDate });
};

export const submitLateRequest = async (userId, reason, roleHint) => {
  const role = await resolveUserRole(userId, roleHint);
  const record = await getOrCreateTodayRecord(userId, role);

  if (record.status === 'weekend_off') {
    throw new ApiError(400, 'Today is a weekend off day');
  }

  if (record.checkInTime) {
    throw new ApiError(409, 'You have already checked in today');
  }

  const now = dayjs().tz(TZ).toDate();
  const checkInOpensAt = getCheckInOpensAt(record.shiftStartAt, role);
  const checkInClosesAt = getCheckInClosesAt(record.shiftStartAt, role);

  if (now < checkInOpensAt) {
    throw new ApiError(
      400,
      isTechAttendanceRole(role)
        ? 'Check-in window is not open yet. Tech check-in opens at shift start (06:00 PM PKT).'
        : 'Check-in window is not open yet. Check-in opens 20 minutes before shift start.'
    );
  }

  if (now <= checkInClosesAt) {
    throw new ApiError(
      400,
      "You're still within the on-time check-in window — use Mark Attendance instead."
    );
  }

  if (record.status === 'pending_approval') {
    throw new ApiError(409, 'A late request is already pending Super Admin review.');
  }

  const lateMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(checkInClosesAt).getTime()) / 60000)
  );

  record.status = 'pending_approval';
  record.lateReason = reason;
  record.lateRequestedAt = now;
  record.lateMinutes = lateMinutes;
  await record.save();

  return record;
};

export const checkOut = async (userId) => {
  const record = await findTodayRecord(userId);

  if (!record) {
    throw new ApiError(404, 'No attendance record found for today');
  }

  if (!['present', 'late'].includes(record.status)) {
    throw new ApiError(
      400,
      'You can only check out from an active, approved attendance session.'
    );
  }

  if (record.checkOutTime) {
    throw new ApiError(409, 'You have already checked out today');
  }

  const now = dayjs().tz(TZ).toDate();
  record.checkOutTime = now;
  record.workedMinutes = Math.round(
    (record.checkOutTime - record.checkInTime) / 60000
  );
  await record.save();

  return record;
};

export const extendShift = async (userId) => {
  const record = await findTodayRecord(userId);

  if (
    !record ||
    !['present', 'late'].includes(record.status) ||
    record.checkOutTime
  ) {
    throw new ApiError(400, 'There is no active shift to extend.');
  }

  if (record.extendedUntil) {
    throw new ApiError(409, 'This shift has already been extended.');
  }

  record.extendedUntil = dayjs(record.shiftEndAt).add(30, 'minute').toDate();
  await record.save();

  return record;
};

export const getPendingLateRequests = async () => {
  return Attendance.find({ status: 'pending_approval' })
    .populate('user', '-password')
    .sort({ lateRequestedAt: 1 });
};

export const approveLateRequest = async (recordId, decision, approverId) => {
  if (!['present', 'late', 'absent'].includes(decision)) {
    throw new ApiError(400, "decision must be 'present', 'late', or 'absent'");
  }

  const record = await Attendance.findById(recordId);

  if (!record) {
    throw new ApiError(404, 'Attendance record not found');
  }

  if (record.status !== 'pending_approval') {
    throw new ApiError(400, 'Only pending requests can be reviewed');
  }

  const submittedAt = record.lateRequestedAt || new Date();
  const computedLateMinutes = Math.max(
    0,
    Math.round(
      (new Date(submittedAt).getTime() -
        new Date(record.shiftStartAt).getTime()) /
        60000
    )
  );

  if (record.lateMinutes == null) {
    record.lateMinutes = computedLateMinutes;
  }

  record.approvedBy = approverId;
  record.approvalAction = decision;
  record.approvedAt = new Date();

  if (decision === 'absent') {
    record.status = 'absent';
    record.checkInTime = null;
    record.forcedAbsentBy = approverId;
    record.forcedAbsentReason =
      record.forcedAbsentReason ||
      'Marked absent from late attendance request review';
    record.forcedAbsentAt = new Date();
  } else {
    record.status = decision;
    record.checkInTime = submittedAt;
  }

  await record.save();

  return record;
};

export const forceAbsent = async (recordId, reason, approverId) => {
  const record = await Attendance.findById(recordId);

  if (!record) {
    throw new ApiError(404, 'Attendance record not found');
  }

  if (record.status === 'weekend_off') {
    throw new ApiError(400, 'Cannot override a weekend off day');
  }

  record.status = 'absent';
  record.forcedAbsentBy = approverId;
  record.forcedAbsentReason = reason || null;
  record.forcedAbsentAt = new Date();
  await record.save();

  return record;
};

export const getMyHistory = async (userId, { month, from, to } = {}) => {
  const filter = {};

  if (from && to) {
    // shiftDate stored as YYYY-MM-DD (Asia/Karachi calendar)
    filter.shiftDate = { $gte: from, $lte: to };
  } else if (month) {
    filter.shiftDate = { $regex: `^${month}` };
  }

  const query = Attendance.find({ user: userId, ...filter }).sort({
    shiftDate: -1,
  });

  if (!month && !(from && to)) {
    query.limit(60);
  }

  return query;
};

export const getAttendanceGrid = async ({ from, to, userId, status } = {}) => {
  const filter = {};

  if (from && to) {
    filter.shiftDate = { $gte: from, $lte: to };
  }

  if (userId) {
    filter.user = userId;
  }

  if (status) {
    filter.status = status;
  }

  return Attendance.find(filter)
    .populate('user', 'fullName username role')
    .sort({ shiftDate: -1 });
};

/**
 * Read-only Tech Department attendance for Tech Head oversight.
 * Includes only tech_team specialists (never tech_head / desk roles).
 */
export const getTechTeamAttendanceGrid = async ({
  from,
  to,
  month,
  status,
  userId,
} = {}) => {
  const teamFilter = { role: 'tech_team' };
  if (userId) {
    teamFilter._id = userId;
  }

  const teamMembers = await User.find(teamFilter).select('_id');
  const memberIds = teamMembers.map((m) => m._id);

  if (!memberIds.length) {
    return [];
  }

  const filter = { user: { $in: memberIds } };

  if (from && to) {
    filter.shiftDate = { $gte: from, $lte: to };
  } else if (month) {
    filter.shiftDate = { $regex: `^${month}` };
  }

  if (status) {
    // Map UI "absent" to both explicit absent and auto_absent when requested.
    if (status === 'absent') {
      filter.status = { $in: ['absent', 'auto_absent'] };
    } else {
      filter.status = status;
    }
  }

  return Attendance.find(filter)
    .populate({
      path: 'user',
      select: 'fullName username role jd assignedMentorId',
      populate: {
        path: 'assignedMentorId',
        select: 'fullName username jd',
      },
    })
    .sort({ shiftDate: -1 });
};
