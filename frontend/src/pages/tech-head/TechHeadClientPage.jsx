import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LivePortfolioSection, {
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import OpsStatusEditor from '../../components/ops/OpsStatusEditor.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import { getTechHeadClient } from '../../services/techHead.service.js';
import { projectTitle } from '../../utils/projectNumber.util.js';

export default function TechHeadClientPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [keywords, setKeywords] = useState([]);

  const {
    data: lead,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadClient', id],
    queryFn: () => getTechHeadClient(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!lead) return;
    setKeywords(mapKeywordsFromLead(lead));
  }, [lead]);

  return (
    <TechHeadShell title="Client Work & Reports">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <div>
          <Link
            to="/dashboard/tech-head/assigned"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-400 transition hover:text-orange-300"
          >
            ← Back to Assigned Projects
          </Link>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load client.'}
          </p>
        ) : !lead ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Client not found.
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-6 py-5 shadow-xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Tech Head · Work & Reports
                </p>
                <ProjectNumberBadge lead={lead} size="lg" />
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
                {projectTitle(lead, '—')}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Status: {lead.statusLabel || lead.handover?.techStatus || '—'}
              </p>
            </div>

            <OpsStatusEditor
              leadId={lead._id}
              handover={lead.handover}
              onUpdated={(updated) => {
                if (updated) {
                  queryClient.setQueryData(['techHeadClient', id], updated);
                }
              }}
            />

            <LivePortfolioSection
              mode="cst"
              leadId={lead._id}
              keywords={keywords}
              setKeywords={setKeywords}
              reports={
                Array.isArray(lead.handover?.monthlyReports)
                  ? lead.handover.monthlyReports
                  : []
              }
            />
          </>
        )}
      </section>
    </TechHeadShell>
  );
}
