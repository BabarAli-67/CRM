import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import { TZ } from '../utils/shiftTime.util.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const resolveMonthRange = (month, year) => {
  const nowPkt = dayjs().tz(TZ);
  const m = month !== undefined && month !== '' ? Number(month) : nowPkt.month() + 1;
  const y = year !== undefined && year !== '' ? Number(year) : nowPkt.year();

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new ApiError(400, 'month must be an integer between 1 and 12');
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new ApiError(400, 'year must be a valid 4-digit year');
  }

  const start = dayjs.tz(`${y}-${String(m).padStart(2, '0')}-01`, TZ).startOf('day');
  const end = start.add(1, 'month');

  return {
    month: m,
    year: y,
    start: start.toDate(),
    end: end.toDate(),
  };
};

const userLookup = (localField, as) => [
  {
    $lookup: {
      from: 'users',
      localField,
      foreignField: '_id',
      as,
    },
  },
  {
    $unwind: {
      path: `$${as}`,
      preserveNullAndEmptyArrays: true,
    },
  },
];

export const getMonthlyReport = asyncHandler(async (req, res) => {
  const { start, end, month, year } = resolveMonthRange(
    req.query.month,
    req.query.year
  );

  const closedMatch = {
    stage: 'closed_sale',
    closedAt: { $gte: start, $lt: end },
  };

  const [perAgent, perCloser, perTech] = await Promise.all([
    Lead.aggregate([
      { $match: { ...closedMatch, agentId: { $ne: null } } },
      {
        $group: {
          _id: '$agentId',
          closedCount: { $sum: 1 },
          totalSalesAmount: { $sum: { $ifNull: ['$salesAmount', 0] } },
        },
      },
      ...userLookup('_id', 'agent'),
      {
        $project: {
          _id: 0,
          agentId: '$_id',
          fullName: '$agent.fullName',
          email: '$agent.email',
          closedCount: 1,
          totalSalesAmount: 1,
        },
      },
      { $sort: { closedCount: -1, totalSalesAmount: -1, agentId: 1 } },
    ]),

    Lead.aggregate([
      { $match: { ...closedMatch, closerId: { $ne: null } } },
      {
        $group: {
          _id: '$closerId',
          closedCount: { $sum: 1 },
          totalSalesAmount: { $sum: { $ifNull: ['$salesAmount', 0] } },
        },
      },
      ...userLookup('_id', 'closer'),
      {
        $project: {
          _id: 0,
          closerId: '$_id',
          fullName: '$closer.fullName',
          email: '$closer.email',
          closedCount: 1,
          totalSalesAmount: 1,
        },
      },
      { $sort: { closedCount: -1, totalSalesAmount: -1, closerId: 1 } },
    ]),

    // Schema stores milestone progress on handover.cstStatus (not a separate milestone field)
    Lead.aggregate([
      {
        $match: {
          'handover.cstStatus': 'completed',
          'handover.assignedTechId': { $ne: null },
          'handover.completedAt': { $gte: start, $lt: end },
          'handover.assignedAt': { $ne: null },
        },
      },
      {
        $group: {
          _id: '$handover.assignedTechId',
          completedCount: { $sum: 1 },
          avgCompletionMs: {
            $avg: {
              $subtract: ['$handover.completedAt', '$handover.assignedAt'],
            },
          },
        },
      },
      ...userLookup('_id', 'tech'),
      {
        $project: {
          _id: 0,
          techId: '$_id',
          fullName: '$tech.fullName',
          email: '$tech.email',
          completedCount: 1,
          avgCompletionMs: { $round: ['$avgCompletionMs', 0] },
          avgCompletionHours: {
            $round: [{ $divide: ['$avgCompletionMs', 1000 * 60 * 60] }, 2],
          },
        },
      },
      { $sort: { completedCount: -1, techId: 1 } },
    ]),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        period: { month, year, timezone: TZ, start, end },
        perAgent,
        perCloser,
        perTech,
      },
      'Monthly performance report retrieved'
    )
  );
});
