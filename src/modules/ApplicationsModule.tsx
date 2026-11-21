import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Edit3,
  Kanban,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import type { AnalyticsGroupRow } from '../shared/analyticsEngine';
import type { Application, ApplicationStatus, CompanyCategory } from '../shared/schemas';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  under_review: 'Under review',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const ALL_STATUSES: ApplicationStatus[] = [
  'saved',
  'applied',
  'under_review',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

type BreakdownTab = 'role' | 'company' | 'channel' | 'referral' | 'resume';

export function ApplicationsModule() {
  const { store, analytics, updateStore, setActiveModule } = useCareerStore();

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeBreakdown, setActiveBreakdown] = useState<BreakdownTab>('role');
  const [drawerGroup, setDrawerGroup] = useState<AnalyticsGroupRow | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [companyCategory, setCompanyCategory] = useState<CompanyCategory>('other');
  const [role, setRole] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jdId, setJdId] = useState('');
  const [resumeVersionId, setResumeVersionId] = useState(
    store.activeResumeId || store.resumeVersions[0]?.id || ''
  );
  const [referral, setReferral] = useState(false);
  const [channel, setChannel] = useState('Company portal');
  const [status, setStatus] = useState<ApplicationStatus>('applied');
  const [stage, setStage] = useState('');
  const [outcome, setOutcome] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notes, setNotes] = useState('');

  const [aiInsights, setAiInsights] = useState<{
    summary: string;
    caveat: string;
    observations: string[];
  } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerGroup && !formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (formOpen) setFormOpen(false);
        else if (drawerGroup) setDrawerGroup(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerGroup, formOpen]);

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return store.applications.filter((app) => {
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (!q) return true;
      return (
        app.company.toLowerCase().includes(q) ||
        app.role.toLowerCase().includes(q) ||
        app.channel.toLowerCase().includes(q) ||
        app.notes.toLowerCase().includes(q)
      );
    });
  }, [store.applications, searchQuery, statusFilter]);

  function openNewForm() {
    setEditingId(null);
    setCompany('');
    setCompanyCategory('other');
    setRole('');
    setDate(new Date().toISOString().slice(0, 10));
    setJdId('');
    setResumeVersionId(store.activeResumeId || store.resumeVersions[0]?.id || 'none');
    setReferral(false);
    setChannel('Company portal');
    setStatus('applied');
    setStage('');
    setOutcome('');
    setRejectionReason('');
    setFeedback('');
    setNotes('');
    setFormOpen(true);
  }

  function openEditForm(app: Application) {
    setEditingId(app.id);
    setCompany(app.company);
    setCompanyCategory(app.companyCategory);
    setRole(app.role);
    setDate(app.date);
    setJdId(app.jdId || '');
    setResumeVersionId(app.resumeVersionId);
    setReferral(app.referral);
    setChannel(app.channel);
    setStatus(app.status);
    setStage(app.stage || '');
    setOutcome(app.outcome || '');
    setRejectionReason(app.rejectionReason || '');
    setFeedback(app.feedback || '');
    setNotes(app.notes);
    setFormOpen(true);
  }

  async function handleSaveApp(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    const today = new Date().toISOString().slice(0, 10);

    await updateStore((prev) => {
      if (editingId) {
        return {
          ...prev,
          applications: prev.applications.map((a) => {
            if (a.id !== editingId) return a;
            const nextHistory =
              a.status !== status ? [...a.history, { status, date: today }] : a.history;
            return {
              ...a,
              company: company.trim(),
              companyCategory,
              role: role.trim(),
              date,
              jdId: jdId || undefined,
              resumeVersionId: resumeVersionId || 'none',
              referral,
              channel: channel.trim() || 'Direct',
              status,
              stage: stage.trim() || undefined,
              outcome: outcome.trim() || undefined,
              rejectionReason: rejectionReason.trim() || undefined,
              feedback: feedback.trim() || undefined,
              notes: notes.trim(),
              history: nextHistory,
            };
          }),
        };
      }

      const newApp: Application = {
        id: `app-${Date.now()}`,
        company: company.trim(),
        companyCategory,
        role: role.trim(),
        date,
        jdId: jdId || undefined,
        resumeVersionId: resumeVersionId || 'none',
        referral,
        channel: channel.trim() || 'Direct',
        status,
        stage: stage.trim() || undefined,
        outcome: outcome.trim() || undefined,
        rejectionReason: rejectionReason.trim() || undefined,
        feedback: feedback.trim() || undefined,
        notes: notes.trim(),
        history: [{ status, date }],
        provenance: 'application',
      };
      return {
        ...prev,
        applications: [newApp, ...prev.applications],
      };
    });

    setFormOpen(false);
  }

  async function handleQuickStatusChange(appId: string, nextStatus: ApplicationStatus) {
    const today = new Date().toISOString().slice(0, 10);
    await updateStore((prev) => ({
      ...prev,
      applications: prev.applications.map((a) =>
        a.id === appId && a.status !== nextStatus
          ? { ...a, status: nextStatus, history: [...a.history, { status: nextStatus, date: today }] }
          : a
      ),
    }));
  }

  async function handleDeleteApp(appId: string) {
    await updateStore((prev) => ({
      ...prev,
      applications: prev.applications.filter((a) => a.id !== appId),
    }));
  }

  async function handleGenerateAiInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
    const res = await postJson<{
      summary: string;
      caveat: string;
      observations: string[];
    }>('/api/ai/insights', { analytics });
    setInsightsLoading(false);
    if (!res.ok) {
      setInsightsError(res.error);
      return;
    }
    setAiInsights(res.data);
  }

  const breakdownRows: AnalyticsGroupRow[] =
    activeBreakdown === 'role'
      ? analytics.byRoleCategory
      : activeBreakdown === 'company'
        ? analytics.byCompanyCategory
        : activeBreakdown === 'channel'
          ? analytics.byChannel
          : activeBreakdown === 'referral'
            ? analytics.byReferral
            : analytics.byResumeVersion;

  const drawerApps = drawerGroup
    ? store.applications.filter((a) => drawerGroup.applicationIds.includes(a.id))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Top Header & View Switcher */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
            Pipeline & Response Attribution
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Application Tracker & Response Insights
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1">{analytics.overallMessage}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex border border-[#382920] bg-[#12100F] p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#211A16] border border-[#B86D37]/60 text-[#EAE4DC]'
                  : 'text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-[#211A16] border border-[#B86D37]/60 text-[#EAE4DC]'
                  : 'text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Board</span>
            </button>
          </div>
          <button type="button" onClick={openNewForm} className="arch-btn-primary px-4 py-2">
            <Plus className="w-3.5 h-3.5 text-[#B86D37]" />
            <span>Log Application</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="arch-panel p-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">Total Logged (n)</div>
          <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
            {analytics.total}
          </div>
        </div>
        <div className="arch-panel p-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">Responses</div>
          <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
            {analytics.responses}
          </div>
        </div>
        <div className="arch-panel p-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">Interview Invites</div>
          <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
            {analytics.interviewInvitations}
          </div>
        </div>
        <div className="arch-panel p-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">Response Rate</div>
          <div className="font-mono-tabular text-2xl font-light text-[#B86D37] mt-1">
            {analytics.overallEnoughData && analytics.responseRate !== null
              ? `${Math.round(analytics.responseRate * 100)}%`
              : '—'}
          </div>
        </div>
        <div className="arch-panel p-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">Offers</div>
          <div className="font-mono-tabular text-2xl font-light text-[#B86D37] mt-1">
            {analytics.offers}
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#A69A8C] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by company, role, channel, or notes..."
            aria-label="Filter applications"
            className="arch-input pl-9 pr-3 py-2 text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="arch-input w-auto px-3 py-2 text-xs font-medium"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </section>

      {/* Applications Table or Board */}
      {store.applications.length === 0 ? (
        <div className="arch-panel border-dashed p-8 text-center space-y-3">
          <p className="text-sm font-medium text-[#EAE4DC]">No applications logged yet.</p>
          <p className="text-xs text-[#A69A8C] max-w-md mx-auto">
            Log your submitted applications to track stage history and learn which role types and
            channels produce responses once you reach 10+ applications.
          </p>
          <button type="button" onClick={openNewForm} className="arch-btn-primary px-4 py-2">
            Log First Application
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="arch-panel overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#382920] bg-[#211A16] text-[#A69A8C] uppercase text-[10px] tracking-[0.12em]">
                <th className="p-3.5 font-medium">Company</th>
                <th className="p-3.5 font-medium">Role</th>
                <th className="p-3.5 font-medium">Date</th>
                <th className="p-3.5 font-medium">Channel / Referral</th>
                <th className="p-3.5 font-medium">Status</th>
                <th className="p-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-[#382920]/70 last:border-b-0 bg-[#1B1714] hover:bg-[#211A16] transition-colors"
                >
                  <td className="p-3.5 font-medium text-[#EAE4DC]">
                    <div>{app.company}</div>
                    <div className="text-[11px] font-normal text-[#A69A8C] capitalize">
                      {app.companyCategory}
                    </div>
                  </td>
                  <td className="p-3.5 text-[#EAE4DC]">{app.role}</td>
                  <td className="p-3.5 font-mono-tabular text-[#A69A8C]">{app.date}</td>
                  <td className="p-3.5 text-[#A69A8C]">
                    {app.channel}
                    {app.referral ? ' · Referral' : ''}
                  </td>
                  <td className="p-3.5">
                    <select
                      value={app.status}
                      onChange={(e) =>
                        handleQuickStatusChange(app.id, e.target.value as ApplicationStatus)
                      }
                      aria-label={`Status for ${app.company} ${app.role}`}
                      className="arch-input w-auto px-2.5 py-1 text-xs font-medium"
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditForm(app)}
                      className="p-1.5 text-[#A69A8C] hover:text-[#EAE4DC] hover:bg-[#12100F]"
                      aria-label={`Edit ${app.company}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteApp(app.id)}
                      className="p-1.5 text-[#A69A8C] hover:text-[#B86D37] hover:bg-[#12100F]"
                      aria-label={`Delete ${app.company}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {(
            ['saved', 'applied', 'under_review', 'assessment', 'interview', 'offer', 'rejected'] as ApplicationStatus[]
          ).map((colStatus) => {
            const items = filteredApps.filter((a) => a.status === colStatus);
            return (
              <div key={colStatus} className="arch-panel p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#382920] pb-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] font-medium text-[#EAE4DC]">
                    {STATUS_LABELS[colStatus]}
                  </span>
                  <span className="text-xs font-mono-tabular text-[#B86D37]">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((app) => (
                    <div
                      key={app.id}
                      className="bg-[#12100F] border border-[#382920] p-3 space-y-1 text-xs"
                    >
                      <div className="font-medium text-[#EAE4DC]">{app.company}</div>
                      <div className="text-[#A69A8C]">{app.role}</div>
                      <div className="flex items-center justify-between text-[11px] text-[#A69A8C] pt-1">
                        <span className="font-mono-tabular">{app.date}</span>
                        <button
                          type="button"
                          onClick={() => openEditForm(app)}
                          className="underline font-medium hover:text-[#B86D37]"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pattern Learning & Associative Analytics */}
      <section className="arch-panel p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#B86D37]" />
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Response Pattern Breakdown
            </h3>
          </div>
          <button
            type="button"
            onClick={handleGenerateAiInsights}
            disabled={insightsLoading || store.applications.length === 0}
            className="arch-btn-secondary px-3.5 py-2"
          >
            {insightsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
            )}
            <span>{insightsLoading ? 'Analyzing...' : 'Summarize Observed Patterns'}</span>
          </button>
        </div>

        {!analytics.overallEnoughData && (
          <div className="bg-[#211A16] border-l-2 border-[#B86D37] p-4 text-xs text-[#EAE4DC]">
            <strong>Not enough data to see a pattern.</strong> Currently{' '}
            <span className="font-mono-tabular font-semibold text-[#B86D37]">
              {analytics.total}
            </span>{' '}
            application{analytics.total === 1 ? '' : 's'} logged. A minimum of 10 applications
            overall (and 5 per subgroup) is required before associative response trends are reliable.
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-[#382920] pb-3">
          {(
            [
              ['role', 'By Role'],
              ['company', 'By Company Type'],
              ['channel', 'By Channel'],
              ['referral', 'By Referral'],
              ['resume', 'By Resume Version'],
            ] as Array<[BreakdownTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveBreakdown(key)}
              className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                activeBreakdown === key
                  ? 'bg-[#211A16] border-[#B86D37]/70 text-[#EAE4DC]'
                  : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {breakdownRows.length === 0 ? (
          <p className="text-xs text-[#A69A8C]">No applications available for this breakdown.</p>
        ) : (
          <div className="space-y-3">
            {breakdownRows.map((row) => {
              const respPct = row.responseRate !== null ? Math.round(row.responseRate * 100) : 0;
              const intPct = row.interviewRate !== null ? Math.round(row.interviewRate * 100) : 0;
              return (
                <div
                  key={row.groupKey}
                  className="bg-[#12100F] border border-[#382920] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[#EAE4DC]">{row.groupLabel}</span>
                      <span className="text-xs font-mono-tabular text-[#B86D37]">n={row.total}</span>
                    </div>
                    <p className="text-xs text-[#A69A8C]">{row.caveat}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs">
                    <div>
                      <div className="text-[#A69A8C]">Response rate</div>
                      <div className="font-mono-tabular text-sm font-semibold text-[#EAE4DC]">
                        {row.insufficientSample
                          ? 'Not enough data'
                          : `${respPct}% (${row.responses}/${row.total})`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#A69A8C]">Interview rate</div>
                      <div className="font-mono-tabular text-sm font-semibold text-[#EAE4DC]">
                        {row.insufficientSample
                          ? 'Not enough data'
                          : `${intPct}% (${row.interviews}/${row.total})`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerGroup(row)}
                      className="arch-btn-secondary px-3 py-1.5"
                    >
                      View records
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {insightsError && (
          <div className="text-xs text-[#EAE4DC] border-l-2 border-[#B86D37] bg-[#211A16] p-3.5">
            {insightsError}
          </div>
        )}

        {aiInsights && (
          <div className="bg-[#12100F] border border-[#B86D37]/40 p-5 space-y-2.5">
            <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
              Observed Pattern Summary (Associative, Non-Causal)
            </div>
            <p className="text-sm text-[#EAE4DC] leading-relaxed">{aiInsights.summary}</p>
            <p className="text-xs font-medium text-[#B86D37]">{aiInsights.caveat}</p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-[#A69A8C]">
              {aiInsights.observations.map((obs, i) => (
                <li key={i}>{obs}</li>
              ))}
            </ul>
          </div>
        )}

        {analytics.recommendations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {analytics.recommendations.map((rec, i) => (
              <div
                key={i}
                className="bg-[#12100F] border border-[#382920] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium text-[#EAE4DC]">{rec.title}</div>
                  <p className="text-xs text-[#A69A8C]">{rec.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveModule(
                      rec.actionModule === 'gap'
                        ? 'gaps'
                        : rec.actionModule === 'company'
                          ? 'company-dna'
                          : rec.actionModule
                    )
                  }
                  className="self-start text-xs font-medium text-[#B86D37] hover:text-[#EAE4DC] flex items-center gap-1 underline"
                >
                  <span>{rec.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Subgroup Records Drawer */}
      {drawerGroup && (
        <div
          className="fixed inset-0 z-50 bg-[#12100F]/80 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Records for ${drawerGroup.groupLabel}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerGroup(null);
          }}
        >
          <div className="w-full max-w-md bg-[#1B1714] border-l border-[#382920] h-full overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#382920] pb-3">
              <div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  {drawerGroup.groupLabel}
                </h3>
                <p className="text-xs text-[#A69A8C]">
                  {drawerApps.length} application record{drawerApps.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerGroup(null)}
                className="p-2 text-[#A69A8C] hover:text-[#EAE4DC] hover:bg-[#211A16]"
                aria-label="Close records drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {drawerApps.map((app) => (
                <div
                  key={app.id}
                  className="bg-[#12100F] border border-[#382920] p-4 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-[#EAE4DC]">{app.company}</strong>
                    <span className="font-mono-tabular text-[#A69A8C]">{app.date}</span>
                  </div>
                  <div className="text-[#EAE4DC]">{app.role}</div>
                  <div className="text-[#B86D37]">
                    Status: {STATUS_LABELS[app.status]} · Channel: {app.channel}
                  </div>
                  {app.notes && <p className="text-[#A69A8C] pt-1">{app.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Application Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#12100F]/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? 'Edit application' : 'Log application'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <form
            onSubmit={handleSaveApp}
            className="w-full max-w-2xl arch-panel-elevated max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#382920] pb-3">
              <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                {editingId ? 'Edit Application' : 'Log New Application'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 text-[#A69A8C] hover:text-[#EAE4DC] hover:bg-[#12100F]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Company *</span>
                <input
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="arch-input px-3 py-2"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Company Stage</span>
                <select
                  value={companyCategory}
                  onChange={(e) => setCompanyCategory(e.target.value as CompanyCategory)}
                  className="arch-input px-3 py-2"
                >
                  <option value="bigtech">Big Tech</option>
                  <option value="startup">Startup</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Role Title *</span>
                <input
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="arch-input px-3 py-2"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="arch-input px-3 py-2"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Channel</span>
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="Company portal, LinkedIn, Recruiter..."
                  className="arch-input px-3 py-2"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                  className="arch-input px-3 py-2"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Resume Version Used</span>
                <select
                  value={resumeVersionId}
                  onChange={(e) => setResumeVersionId(e.target.value)}
                  className="arch-input px-3 py-2"
                >
                  <option value="none">Unspecified / External</option>
                  {store.resumeVersions.map((rv) => (
                    <option key={rv.id} value={rv.id}>
                      {rv.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Linked Target Role (optional)</span>
                <select
                  value={jdId}
                  onChange={(e) => setJdId(e.target.value)}
                  className="arch-input px-3 py-2"
                >
                  <option value="">None</option>
                  {store.jobDescriptions.map((jd) => {
                    const tr = store.targetRoles.find((r) => r.id === jd.targetRoleId);
                    const comp = store.companies.find((c) => c.id === tr?.companyId);
                    return (
                      <option key={jd.id} value={jd.id}>
                        {comp?.name || 'Company'} — {tr?.title || 'Role'}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Current Stage (optional)</span>
                <input
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  placeholder="e.g. Technical phone screen"
                  className="arch-input px-3 py-2"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[#A69A8C]">Feedback / Outcome Note (optional)</span>
                <input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="If known"
                  className="arch-input px-3 py-2"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#EAE4DC]">
              <input
                type="checkbox"
                checked={referral}
                onChange={(e) => setReferral(e.target.checked)}
                className="accent-[#B86D37]"
              />
              <span>Submitted via referral</span>
            </label>

            <label className="space-y-1 block text-xs">
              <span className="text-[#A69A8C]">Notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="arch-input px-3 py-2"
              />
            </label>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#382920]">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="arch-btn-secondary px-4 py-2"
              >
                Cancel
              </button>
              <button type="submit" className="arch-btn-primary px-4 py-2">
                {editingId ? 'Save Changes' : 'Save Application'}
              </button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
}
