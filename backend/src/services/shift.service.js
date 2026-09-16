import Shift from '../models/shift.model.js';

export const getOrCreateShiftSettings = async () => {
  let settings = await Shift.findOne({});

  if (!settings) {
    settings = await Shift.create({});
  }

  return settings;
};

export const updateShiftSettings = async ({
  startTime,
  endTime,
  weekendDays,
  updatedById,
}) => {
  const settings = await getOrCreateShiftSettings();

  if (startTime !== undefined) settings.startTime = startTime;
  if (endTime !== undefined) settings.endTime = endTime;
  if (weekendDays !== undefined) settings.weekendDays = weekendDays;

  settings.updatedBy = updatedById;
  await settings.save();

  return settings;
};
