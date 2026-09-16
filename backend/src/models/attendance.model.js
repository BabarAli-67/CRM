import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shiftDate: {
      type: String,
      required: true,
    },
    shiftStartAt: {
      type: Date,
      required: true,
    },
    shiftEndAt: {
      type: Date,
      required: true,
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['present', 'late', 'pending_approval', 'absent', 'auto_absent', 'weekend_off'],
      required: true,
      default: 'auto_absent',
    },
    lateReason: {
      type: String,
      default: null,
    },
    lateRequestedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvalAction: {
      type: String,
      enum: ['present', 'late', null],
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    forcedAbsentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    forcedAbsentReason: {
      type: String,
      default: null,
    },
    forcedAbsentAt: {
      type: Date,
      default: null,
    },
    extendedUntil: {
      type: Date,
      default: null,
    },
    autoCheckedOut: {
      type: Boolean,
      default: false,
    },
    workedMinutes: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, shiftDate: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);
