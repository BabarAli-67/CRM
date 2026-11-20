import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import { resolvePktMonthRange } from '../utils/shiftTime.util.js';

/** Optional ?month=YYYY-MM (PKT). Defaults to the current Asia/Karachi month. */
export const getMyClosedCount = asyncHandler(async (req, res) => {
  let range;
  try {
    range = resolvePktMonthRange(req.query.month);
  } catch {
    throw new ApiError(400, 'month must be YYYY-MM');
  }

  const filter = {
    stage: 'closed_sale',
    closedAt: { $gte: range.start, $lt: range.end },
  };

  if (req.user.role === 'closer') {
    filter.closerId = req.user._id;
  } else {
    filter.agentId = req.user._id;
  }

  const count = await Lead.countDocuments(filter);

  // Vanishing Rule: count only — never return lead documents
  res.status(200).json(
    new ApiResponse(
      200,
      { count, month: range.month, timezone: 'Asia/Karachi' },
      'Closed count retrieved'
    )
  );
});
