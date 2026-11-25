import { useState } from 'react';
import {
  fetchMonthlyReportBlob,
  saveLivePortfolio,
  uploadMonthlyReport,
} from '../../services/handover.service.js';

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

/**
 * Live Portfolio, Keywords & Tech Monthly Reports.
 * mode: 'cst' | 'tech'
 * Tech: keywords + PDF uploads persist immediately.
 * CST / Tech Head: read keywords + view/download monthly PDFs.
 */
export default function LivePortfolioSection({
  mode = 'cst',
  leadId,
  keywords: keywordsProp,
  setKeywords,
  reports = [],
  onLeadUpdated,
}) {
  const isTech = mode === 'tech';
  const keywords = Array.isArray(keywordsProp) ? keywordsProp : [];
  const reportRows = Array.isArray(reports) ? reports : [];
  const [keywordDraft, setKeywordDraft] = useState('');
  const [positionDraft, setPositionDraft] = useState('');
  const [editingKeywordId, setEditingKeywordId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [reportFile, setReportFile] = useState(null);
  const [keywordNoteDraft, setKeywordNoteDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const persistLive = async (nextKeywords, { removeKeywordIds } = {}) => {
    if (!isTech) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        portfolioKeywords: nextKeywords,
        ...(Array.isArray(removeKeywordIds) && removeKeywordIds.length
          ? { removeKeywordIds }
          : {}),
      };
      const updated = await saveLivePortfolio(leadId, payload);
      onLeadUpdated?.(updated);
      // Sync local keyword list from server merge (includes peers' rows)
      if (Array.isArray(updated?.handover?.portfolioKeywords)) {
        setKeywords(
          updated.handover.portfolioKeywords.map((row, i) => ({
            keywordId: row.keywordId || `kw-${i + 1}`,
            text: row.text || '',
            position: row.position || null,
            note: row.note || null,
            at: row.at || null,
            updatedBy: row.updatedBy || null,
            updatedByName: row.updatedByName || null,
          }))
        );
      }
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
    // Update rank if keyword already exists (case-insensitive)
    const existingIdx = keywords.findIndex(
      (k) =>
        String(k.text || '')
          .trim()
          .toLowerCase() === text.toLowerCase()
    );
    let next;
    if (existingIdx >= 0) {
      next = keywords.map((kw, i) =>
        i === existingIdx
          ? {
              ...kw,
              position: positionDraft.trim() || kw.position || null,
              note: keywordNoteDraft.trim() || kw.note || null,
              at: new Date().toISOString(),
            }
          : kw
      );
    } else {
      next = [
        ...keywords,
        {
          keywordId: newId('kw'),
          text,
          position: positionDraft.trim() || null,
          note: keywordNoteDraft.trim() || null,
          at: new Date().toISOString(),
        },
      ];
    }
    setKeywords(next);
    setKeywordDraft('');
    setPositionDraft('');
    setKeywordNoteDraft('');
    await persistLive(next);
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
    await persistLive(next);
  };

  const removeKeyword = async (keywordId) => {
    if (!isTech) return;
    const next = keywords.filter((k) => k.keywordId !== keywordId);
    setKeywords(next);
    if (editingKeywordId === keywordId) cancelEditKeyword();
    await persistLive(next, {
      removeKeywordIds: [keywordId],
    });
  };

  const onUploadReport = async () => {
    if (!reportFile) {
      setError('Choose a PDF file to upload.');
      return;
    }
    const name = String(reportFile.name || '').toLowerCase();
    const type = String(reportFile.type || '').toLowerCase();
    if (!name.endsWith('.pdf') || (type && type !== 'application/pdf' && type !== 'application/x-pdf')) {
      setError('Only .pdf files are accepted for monthly reports.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await uploadMonthlyReport(leadId, {
        title: reportTitle.trim() || reportFile.name,
        reportMonth: reportMonth.trim() || undefined,
        file: reportFile,
      });
      onLeadUpdated?.(updated);
      setReportTitle('');
      setReportMonth('');
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
          Shared CST ↔ Tech workspace for keywords and monthly PDFs.
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

      <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Keywords — Tech manages; CST view-only table */}
      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">Portfolio Keywords</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {isTech
            ? 'Add, edit, and rank keywords. CST sees updates in real time.'
            : 'View-only ranking table managed by Tech.'}
        </p>

        {isTech ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
              placeholder="Keyword…"
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
              placeholder="Position / Rank e.g. #3"
              className={fieldClass}
            />
            <input
              type="text"
              value={keywordNoteDraft}
              onChange={(e) => setKeywordNoteDraft(e.target.value)}
              placeholder="Optional notes…"
              className={`${fieldClass} sm:col-span-2`}
            />
            <button
              type="button"
              disabled={busy || !keywordDraft.trim()}
              onClick={addKeyword}
              className="sm:col-span-2 shrink-0 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              Add / Update Keyword & Rank
            </button>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium w-12">#</th>
                <th className="px-3 py-2.5 font-medium">Keyword</th>
                <th className="px-3 py-2.5 font-medium">Position</th>
                <th className="px-3 py-2.5 font-medium">Updated By</th>
                <th className="px-3 py-2.5 font-medium">Last Updated</th>
                {isTech ? (
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr>
                  <td
                    colSpan={isTech ? 6 : 5}
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
                      <td className="px-3 py-2.5 text-zinc-400">
                        {kw.updatedByName || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-500">
                        {formatPkt(kw.at)}
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
      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">
          Monthly Reports (PDF)
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {isTech
            ? 'Upload SEO / delivery PDFs for this client.'
            : 'View and download reports uploaded by Tech.'}
        </p>

        {isTech ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              placeholder="Report Month e.g. November 2026"
              className={fieldClass}
            />
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Report Title"
              className={fieldClass}
            />
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (
                  file &&
                  !String(file.name || '')
                    .toLowerCase()
                    .endsWith('.pdf')
                ) {
                  setReportFile(null);
                  setError('Only .pdf files are accepted for monthly reports.');
                  e.target.value = '';
                  return;
                }
                setError('');
                setReportFile(file);
              }}
              className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white sm:col-span-2"
            />
            <button
              type="button"
              disabled={busy || !reportFile}
              onClick={onUploadReport}
              className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50 sm:col-span-2"
            >
              {busy ? 'Uploading…' : 'Upload Monthly Report (PDF)'}
            </button>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Uploaded By</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    No monthly reports yet.
                  </td>
                </tr>
              ) : (
                reportRows.map((report) => (
                  <tr
                    key={report.reportId}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-3 py-2.5 text-zinc-300">
                      {report.reportMonth || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-white">
                      {report.title}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {report.uploadedByName ||
                        report.uploadedBy?.fullName ||
                        report.uploadedBy?.username ||
                        '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">
                      {formatPkt(report.at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openReport(report)}
                          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openReport(report, { download: true })}
                          className="rounded-lg bg-orange-600/20 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-600/30"
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
        updatedByName: null,
      };
    }
    return {
      keywordId: row.keywordId || `kw-${i + 1}`,
      text: row.text || row.keyword || '',
      position: row.position || row.rank || null,
      note: row.note || null,
      at: row.at || null,
      updatedBy: row.updatedBy || null,
      updatedByName: row.updatedByName || null,
    };
  });
};

