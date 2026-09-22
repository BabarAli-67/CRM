import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import useAuth from '../../hooks/useAuth.hook.js';
import { getMonthlyReport } from '../../services/report.service.js';
import SessionIdentityBadge from '../../components/SessionIdentityBadge.component.jsx';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CANVAS,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from '../../components/adminBrand.js';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const pktNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { month, year };
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const YEAR_OPTIONS = (() => {
  const { year } = pktNow();
  const years = [];
  for (let y = year; y >= year - 5; y -= 1) years.push(y);
  return years;
})();

/**
 * Month-end performance report for super_admin / admin (auditor read-only OK).
 */
export default function MonthlyReportPage() {
  const { user, logout } = useAuth();
  const initial = pktNow();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);

  const homePath = user?.role === 'admin' ? '/admin/monitor' : '/admin';

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['monthlyReport', month, year],
    queryFn: () => getMonthlyReport({ month, year }),
  });

  const periodLabel = useMemo(() => {
    const name =
      MONTH_OPTIONS.find((m) => m.value === month)?.label || String(month);
    return `${name} ${year}`;
  }, [month, year]);

  const handleExport = () => {
    if (!data) return;

    const rows = [
      ['Section', 'Name', 'Username', 'Metric', 'Value'],
      ...(data.perAgent || []).map((r) => [
        'Agent',
        r.fullName || '',
        r.username || r.email || '',
        'closedCount',
        r.closedCount,
      ]),
      ...(data.perAgent || []).map((r) => [
        'Agent',
        r.fullName || '',
        r.username || r.email || '',
        'totalSalesAmount',
        r.totalSalesAmount,
      ]),
      ...(data.perCloser || []).map((r) => [
        'Closer',
        r.fullName || '',
        r.username || r.email || '',
        'closedCount',
        r.closedCount,
      ]),
      ...(data.perCloser || []).map((r) => [
        'Closer',
        r.fullName || '',
        r.username || r.email || '',
        'totalSalesAmount',
        r.totalSalesAmount,
      ]),
      ...(data.perTech || []).map((r) => [
        'Tech',
        r.fullName || '',
        r.username || r.email || '',
        'completedCount',
        r.completedCount,
      ]),
      ...(data.perTech || []).map((r) => [
        'Tech',
        r.fullName || '',
        r.username || r.email || '',
        'avgCompletionHours',
        r.avgCompletionHours,
      ]),
    ];

    downloadCsv(
      `flash-monthly-report-${year}-${String(month).padStart(2, '0')}.csv`,
      rows
    );
  };

  return (
    <div className={ADMIN_CANVAS}>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <header
          className={`${ADMIN_CARD} flex flex-wrap items-center justify-between gap-4`}
        >
          <div>
            <Link
              to={homePath}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
            <p className="bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] bg-clip-text font-display text-sm font-bold italic tracking-wide text-transparent">
              FLASH TECH
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Month-End Report
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Agents · Closers · Tech · Asia/Karachi calendar month
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SessionIdentityBadge user={user} />
            <button type="button" onClick={logout} className={ADMIN_BTN_GHOST}>
              Log out
            </button>
          </div>
        </header>

        <div
          className={`${ADMIN_CARD} flex flex-wrap items-end justify-between gap-4`}
        >
          <div className="flex flex-wrap gap-3">
            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span>Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className={ADMIN_INPUT}
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span>Year</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={ADMIN_INPUT}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={!data || isLoading}
            className={ADMIN_BTN_PRIMARY}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </button>
        </div>

        <p className="text-sm text-zinc-400">
          Showing <span className="text-zinc-200">{periodLabel}</span>
          {isFetching && !isLoading ? ' · refreshing…' : ''}
        </p>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-red-300">
            {error?.response?.data?.message || 'Failed to load report.'}
          </p>
        ) : (
          <div className="space-y-8">
            <ReportTable
              title="Sales Agents"
              empty="No agent closes this month."
              columns={['Name', 'Username', 'Closed', 'Total sales']}
              rows={(data?.perAgent || []).map((r) => [
                r.fullName || '—',
                r.username || r.email || '—',
                r.closedCount ?? 0,
                formatAmount(r.totalSalesAmount),
              ])}
            />
            <ReportTable
              title="Closers"
              empty="No closer closes this month."
              columns={['Name', 'Username', 'Closed', 'Total sales']}
              rows={(data?.perCloser || []).map((r) => [
                r.fullName || '—',
                r.username || r.email || '—',
                r.closedCount ?? 0,
                formatAmount(r.totalSalesAmount),
              ])}
            />
            <ReportTable
              title="Tech Team"
              empty="No tech completions this month."
              columns={[
                'Name',
                'Username',
                'Completed',
                'Avg completion (hrs)',
              ]}
              rows={(data?.perTech || []).map((r) => [
                r.fullName || '—',
                r.username || r.email || '—',
                r.completedCount ?? 0,
                r.avgCompletionHours ?? '—',
              ])}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatAmount(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function ReportTable({ title, columns, rows, empty }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <div className={ADMIN_TABLE_WRAP}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{empty}</p>
        ) : (
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className={ADMIN_THEAD}>
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-4 py-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${title}-${idx}`} className={ADMIN_ROW}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={[
                        'px-4 py-3',
                        cIdx === 0 ? 'font-medium text-white' : '',
                      ].join(' ')}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
