import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import { TZ } from '../utils/shiftTime.util.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const getMyClosedCount = asyncHandler(async (req, res) => {
  const monthStart = dayjs().tz(TZ).startOf('month').toDate();
  const monthEnd = dayjs().tz(TZ).add(1, 'month').startOf('month').toDate();

  const filter = {
    stage: 'closed_sale',
    closedAt: { $gte: monthStart, $lt: monthEnd },
  };

  if (req.user.role === 'closer') {
    filter.closerId = req.user._id;
  } else {
    filter.agentId = req.user._id;
  }

  const count = await Lead.countDocuments(filter);

  // Vanishing Rule: count only — never return lead documents
  res.status(200).json(new ApiResponse(200, { count }, 'Closed count retrieved'));
});
