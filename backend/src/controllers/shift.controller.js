import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import {
  getOrCreateShiftSettings,
  updateShiftSettings,
} from '../services/shift.service.js';

export const getShift = asyncHandler(async (req, res) => {
  const settings = await getOrCreateShiftSettings();

  res.status(200).json(
    new ApiResponse(
      200,
      { settings, serverTime: new Date() },
      'Shift settings retrieved'
    )
  );
});

export const updateShift = asyncHandler(async (req, res) => {
  const { startTime, endTime, weekendDays } = req.body;

  const settings = await updateShiftSettings({
    startTime,
    endTime,
    weekendDays,
    updatedById: req.user._id,
  });

  res
    .status(200)
    .json(new ApiResponse(200, { settings }, 'Shift settings updated successfully'));
});
