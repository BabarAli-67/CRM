import mongoose from 'mongoose';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const shiftSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true,
      default: '19:00',
      match: [timePattern, 'startTime must be in HH:mm format (00:00–23:59)'],
    },
    endTime: {
      type: String,
      required: true,
      default: '04:00',
      match: [timePattern, 'endTime must be in HH:mm format (00:00–23:59)'],
    },
    timezone: {
      type: String,
      required: true,
      default: 'Asia/Karachi',
      immutable: true,
    },
    weekendDays: {
      type: [Number],
      default: [6, 0],
      validate: {
        validator(days) {
          return days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
        },
        message: 'weekendDays entries must be integers between 0 and 6',
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Shift', shiftSchema);
