import { useState } from 'react';
import {
  fetchMonthlyReportBlob,
  saveLivePortfolio,
  updateChangeRequestStatus,
  uploadMonthlyReport,
} from '../../services/handover.service.js';

const CATEGORY_OPTIONS = [
  { id: 'seo', label: 'SEO' },
  { id: 'web', label: 'Web' },
  { id: 'social_media', label: 'Social Media' },
  { id: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

const STATUS_BADGE = {
  pending: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
  in_progress: 'bg-sky-500/15 text-sky-300 ring-sky-500/35',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35',
};

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const newId = (prefix) =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const categoryLabel = (id) =>
  CATEGORY_OPTIONS.find((c) => c.id === id)?.label || id;

/**
 * Section F — Live Portfolio, Keywords & Tech Monthly Reports.
 * mode: 'cst' | 'tech'
 * CST: keywords + change requests are controlled by parent (top Save).
 * Tech: keywords / change requests / PDF / status persist immediately.
 */
export default function LivePortfolioSection({
  mode = 'cst',
  leadId,
  keywords,
  setKeywords,
  changeRequests,
  setChangeRequests,
  reports = [],
  onLeadUpdated,
}) {
  const isTech = mode === 'tech';
  const [keywordDraft, setKeywordDraft] = useState('');
  const [positionDraft, setPositionDraft] = useState('');
  const [editingKeywordId, setEditingKeywordId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [crCategory, setCrCategory] = useState('seo');
  const [crDescription, setCrDescription] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportFile, setReportFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const persistLive = async (nextKeywords, nextRequests) => {
    if (!isTech) return;
    setBusy(true);
    setError('');
    try {
      const updated = await saveLivePortfolio(leadId, {
        portfolioKeywords: nextKeywords,
        changeRequests: nextRequests,
      });
      onLeadUpdated?.(updated);
      setMessage('Live portfolio updated.');
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to save live portfolio.'
      );
    } finally {
      setBusy(false);
    }
  };

  const addKeyword = async () => {
    if (!isTech) return;
    const text = keywordDraft.trim();
    if (!text) return;
    const next = [
      ...keywords,
      {
        keywordId: newId('kw'),
        text,
        position: positionDraft.trim() || null,
        note: null,
        at: new Date().toISOString(),
      },
    ];
    setKeywords(next);
    setKeywordDraft('');
    setPositionDraft('');
    await persistLive(next, changeRequests);
  };

  const startEditKeyword = (kw) => {
    if (!isTech) return;
    setEditingKeywordId(kw.keywordId);
    setEditText(kw.text || '');
    setEditPosition(kw.position || '');
  };

  const cancelEditKeyword = () => {
    setEditingKeywordId(null);
    setEditText('');
    setEditPosition('');
  };

  const saveEditKeyword = async () => {
    if (!isTech || !editingKeywordId) return;
    const text = editText.trim();
    if (!text) {
      setError('Keyword text is required.');
      return;
    }
    const next = keywords.map((kw) =>
      kw.keywordId === editingKeywordId
        ? {
            ...kw,
            text,
            position: editPosition.trim() || null,
          }
        : kw
    );
    setKeywords(next);
    cancelEditKeyword();
    await persistLive(next, changeRequests);
  };

  const removeKeyword = async (keywordId) => {
    if (!isTech) return;
    const next = keywords.filter((k) => k.keywordId !== keywordId);
    setKeywords(next);
    if (editingKeywordId === keywordId) cancelEditKeyword();
    await persistLive(next, changeRequests);
  };

  const addChangeRequest = async () => {
    const description = crDescription.trim();
    if (!description) {
      setError('Enter a change description.');
      return;
    }
    const next = [
      ...changeRequests,
      {
        requestId: newId('cr'),
        category: crCategory,
        description,
        status: 'pending',
        loggedAt: new Date().toISOString(),
      },
    ];
    setChangeRequests(next);
    setCrDescription('');
    setError('');
    await persistLive(keywords, next);
  };

  const onStatusChange = async (requestId, status) => {
    if (!isTech) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateChangeRequestStatus(
        leadId,
        requestId,
        status
      );
      onLeadUpdated?.(updated);
      const synced = Array.isArray(updated?.handover?.changeRequests)
        ? updated.handover.changeRequests
        : changeRequests.map((r) =>
            r.requestId === requestId ? { ...r, status } : r
          );
      setChangeRequests(synced);
      setMessage('Change request status updated.');
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to update status.'
      );
    } finally {
      setBusy(false);
    }
  };

  const onUploadReport = async () => {
    if (!reportFile) {
      setError('Choose a PDF file to upload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await uploadMonthlyReport(leadId, {
        title: reportTitle.trim() || reportFile.name,
        file: reportFile,
      });
      onLeadUpdated?.(updated);
      setReportTitle('');
      setReportFile(null);
      setMessage('Monthly report uploaded.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to upload PDF.');
    } finally {
      setBusy(false);
    }
  };

  const openReport = async (report, { download = false } = {}) => {
    try {
      const blob = await fetchMonthlyReportBlob(
        leadId,
        report.storedFilename
      );
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = report.originalName || `${report.title}.pdf`;
        a.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to open PDF.');
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-[#111111] p-5 shadow-xl sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">
          Live Portfolio, Keywords & Tech Monthly Reports
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Shared CST ↔ Tech workspace for keywords, monthly PDFs, and client
          change requests.
        </p>
      </div>

      {message ? (
        <p className="text-sm text-emerald-400" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
      {/* Keywords — Tech manages; CST view-only table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">Portfolio Keywords</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {isTech
            ? 'Add, edit, and rank keywords. CST sees updates in real time.'
            : 'View-only ranking table managed by Tech.'}
        </p>

        {isTech ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="text"
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Keyword phrase…"
              className={fieldClass}
            />
            <input
              type="text"
              value={positionDraft}
              onChange={(e) => setPositionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Position e.g. #3 or Page 1 - Pos 4"
              className={fieldClass}
            />
            <button
              type="button"
              disabled={busy || !keywordDraft.trim()}
              onClick={addKeyword}
              className="shrink-0 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              Add Keyword
            </button>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium w-12">#</th>
                <th className="px-3 py-2.5 font-medium">Keyword</th>
                <th className="px-3 py-2.5 font-medium">Position of Keyword</th>
                {isTech ? (
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr>
                  <td
                    colSpan={isTech ? 4 : 3}
                    className="px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    {isTech
                      ? 'No keywords yet. Add the first keyword above.'
                      : 'No keywords added by Tech yet'}
                  </td>
                </tr>
              ) : (
                keywords.map((kw, index) => {
                  const editing = isTech && editingKeywordId === kw.keywordId;
                  return (
                    <tr
                      key={kw.keywordId}
                      className="border-b border-zinc-800/50 last:border-0"
                    >
                      <td className="px-3 py-2.5 tabular-nums text-zinc-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className={fieldClass}
                          />
                        ) : (
                          <span className="font-medium text-white">
                            {kw.text || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <input
                            type="text"
                            value={editPosition}
                            onChange={(e) => setEditPosition(e.target.value)}
                            placeholder="Not Ranked"
                            className={fieldClass}
                          />
                        ) : (
                          <span className="text-zinc-300">
                            {kw.position?.trim() || 'Not Ranked'}
                          </span>
                        )}
                      </td>
                      {isTech ? (
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-2">
                            {editing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={saveEditKeyword}
                                  className="rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={cancelEditKeyword}
                                  className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => startEditKeyword(kw)}
                                  className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => removeKeyword(kw.keywordId)}
                                  className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Reports */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">
          Monthly Reports (PDF)
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {isTech
            ? 'Upload SEO / delivery PDFs for this client.'
            : 'View and download reports uploaded by Tech.'}
        </p>

        {isTech ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder='Title e.g. "November 2026 SEO Report"'
              className={fieldClass}
            />
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setReportFile(e.target.files?.[0] || null)}
              className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            <button
              type="button"
              disabled={busy || !reportFile}
              onClick={onUploadReport}
              className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Upload PDF'}
            </button>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {reports.length === 0 ? (
            <p className="text-sm text-zinc-500">No monthly reports yet.</p>
          ) : (
            reports.map((report) => (
              <div
                key={report.reportId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {report.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Uploaded {formatPkt(report.at)} PKT
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openReport(report)}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    View PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => openReport(report, { download: true })}
                    className="rounded-lg bg-orange-600/20 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-600/30"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      {/* Change Request Log */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">
          Client Change Request Log
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Log client change requests. Tech updates status in real time.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <select
            value={crCategory}
            onChange={(e) => setCrCategory(e.target.value)}
            className={fieldClass}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <textarea
            value={crDescription}
            onChange={(e) => setCrDescription(e.target.value)}
            rows={2}
            placeholder="Describe the client change request…"
            className={`${fieldClass} resize-y`}
          />
          <button
            type="button"
            disabled={busy || !crDescription.trim()}
            onClick={addChangeRequest}
            className="self-start rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            Log Request
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {changeRequests.length === 0 ? (
            <p className="text-sm text-zinc-500">No change requests logged.</p>
          ) : (
            changeRequests.map((row) => (
              <div
                key={row.requestId}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {categoryLabel(row.category)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          STATUS_BADGE[row.status] || STATUS_BADGE.pending
                        }`}
                      >
                        {STATUS_OPTIONS.find((s) => s.id === row.status)
                          ?.label || row.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200 whitespace-pre-wrap">
                      {row.description}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Logged {formatPkt(row.loggedAt)} PKT
                    </p>
                  </div>
                  {isTech ? (
                    <select
                      value={row.status || 'pending'}
                      disabled={busy}
                      onChange={(e) =>
                        onStatusChange(row.requestId, e.target.value)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export const mapKeywordsFromLead = (lead) => {
  const rows = Array.isArray(lead?.handover?.portfolioKeywords)
    ? lead.handover.portfolioKeywords
    : [];
  return rows.map((row, i) => {
    if (typeof row === 'string') {
      return {
        keywordId: `kw-${i + 1}`,
        text: row,
        position: null,
        note: null,
        at: null,
      };
    }
    return {
      keywordId: row.keywordId || `kw-${i + 1}`,
      text: row.text || row.keyword || '',
      position: row.position || row.rank || null,
      note: row.note || null,
      at: row.at || null,
    };
  });
};

export const mapChangeRequestsFromLead = (lead) => {
  const rows = Array.isArray(lead?.handover?.changeRequests)
    ? lead.handover.changeRequests
    : [];
  return rows.map((row, i) => ({
    requestId: row.requestId || `cr-${i + 1}`,
    category: row.category || 'other',
    description: row.description || '',
    status: row.status || 'pending',
    loggedAt: row.loggedAt || null,
    loggedBy: row.loggedBy || null,
    statusUpdatedAt: row.statusUpdatedAt || null,
    statusUpdatedBy: row.statusUpdatedBy || null,
  }));
};
