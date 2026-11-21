import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Download, FileText, Printer } from 'lucide-react';
import { useCareerStore, type ModuleId } from '../context/CareerStoreContext';
import { ProvenanceText } from '../components/ProvenanceBadge';
import type { Report, ReportType } from '../shared/schemas';

const REPORT_CATALOG: Array<{
  type: ReportType;
  title: string;
  description: string;
}> = [
  {
    type: 'candidate_profile',
    title: '1. Candidate Profile Summary',
    description: 'Verified baseline, career objective, weekly availability, and target roles.',
  },
  {
    type: 'resume_intelligence',
    title: '2. Resume Intelligence Report',
    description: 'Extracted capabilities, confidence level, and profile edits.',
  },
  {
    type: 'skill_gap',
    title: '3. Skill Gap Analysis Report',
    description: 'Priority skill rankings, current proof levels, and supporting job posting quotes.',
  },
  {
    type: 'company_preparation',
    title: '4. Company Preparation Report (12 Sections)',
    description: 'Comprehensive preparation dossier for one selected target company.',
  },
  {
    type: 'multi_company_comparison',
    title: '5. Multi-Company Comparison Report',
    description: 'Cross-company skill overlap matrix, differentiators, and readiness split.',
  },
  {
    type: 'learning_roadmap',
    title: '6. Learning Roadmap Report',
    description: 'Week-by-week plan, time budgets, deliverables, and adaptation log.',
  },
  {
    type: 'portfolio_recommendations',
    title: '7. Portfolio Recommendations Report',
    description: 'Tailored build blueprints, architectures, and verified project submissions.',
  },
  {
    type: 'interview_performance',
    title: '8. Interview Performance Report',
    description: 'Rubric breakdown, transcript notes, and unscored delivery observations.',
  },
  {
    type: 'career_readiness',
    title: '9. Career Readiness Progress Report',
    description: 'Trajectory checkpoints, improving vs weak capabilities, and reminders.',
  },
  {
    type: 'application_outcomes',
    title: '10. Application Outcomes Report',
    description: 'Pipeline metrics, subgroup response patterns, and sample-size caveats.',
  },
];

export function ReportsModule() {
  const {
    store,
    analysis,
    matrix,
    analytics,
    progressInsights,
    updateStore,
    setActiveModule,
  } = useCareerStore();

  const [selectedType, setSelectedType] = useState<ReportType>('candidate_profile');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    store.companies[0]?.id || ''
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const activeCompany =
    store.companies.find((c) => c.id === selectedCompanyId) ?? store.companies[0] ?? null;

  const missingPrereqs = useMemo((): Array<{ label: string; module: ModuleId }> => {
    const reqs: Array<{ label: string; module: ModuleId }> = [];
    if (selectedType === 'candidate_profile' && !store.profile) {
      reqs.push({ label: 'Set up your candidate profile in Settings', module: 'settings' });
    }
    if (selectedType === 'resume_intelligence' && store.resumeVersions.length === 0) {
      reqs.push({ label: 'Upload or paste at least one resume', module: 'resume' });
    }
    if (
      (selectedType === 'skill_gap' ||
        selectedType === 'company_preparation' ||
        selectedType === 'multi_company_comparison') &&
      store.jobDescriptions.length === 0
    ) {
      reqs.push({ label: 'Add at least one target company job description', module: 'company-dna' });
    }
    if (selectedType === 'learning_roadmap' && !store.roadmap) {
      reqs.push({ label: 'Generate a weekly learning roadmap', module: 'roadmap' });
    }
    if (selectedType === 'portfolio_recommendations' && store.portfolioProjects.length === 0) {
      reqs.push({ label: 'Generate tailored portfolio projects', module: 'portfolio' });
    }
    if (
      selectedType === 'interview_performance' &&
      !store.interviewSessions.some((s) => Boolean(s.report))
    ) {
      reqs.push({ label: 'Complete at least one rubric-scored mock interview', module: 'interview' });
    }
    if (selectedType === 'application_outcomes' && store.applications.length === 0) {
      reqs.push({ label: 'Log at least one job application', module: 'applications' });
    }
    return reqs;
  }, [selectedType, store]);

  const activeMeta = REPORT_CATALOG.find((r) => r.type === selectedType) ?? REPORT_CATALOG[0];
  const generatedDate = new Date().toISOString().slice(0, 10);

  const companyPrepData = useMemo(() => {
    if (!activeCompany) return null;
    const roles = store.targetRoles.filter((r) => r.companyId === activeCompany.id);
    const jds = store.jobDescriptions.filter((j) =>
      roles.some((r) => r.id === j.targetRoleId)
    );
    const readiness = analysis.companyReadiness[activeCompany.id];
    const companyGaps = analysis.gaps.filter((g) =>
      g.requirementRefs.some((ref) => ref.companyId === activeCompany.id)
    );
    const relatedProjects = store.portfolioProjects.filter((p) =>
      p.gapSkillIds.some((sid) => companyGaps.some((g) => g.skillId === sid))
    );
    const relatedInterviews = store.interviewSessions.filter(
      (s) => s.config.companyId === activeCompany.id && Boolean(s.report)
    );
    return { roles, jds, readiness, companyGaps, relatedProjects, relatedInterviews };
  }, [activeCompany, store, analysis]);

  function buildMarkdownExport(): string {
    const lines: string[] = [
      `# RolexIQ — ${activeMeta.title}`,
      `Generated: ${generatedDate}`,
      `Candidate: ${store.profile?.name || 'Not specified'}`,
      store.isDemoData ? '> Notice: Sample demo workspace data is active.' : '',
      '',
      '## Data Sources',
      ...store.resumeVersions.map((r) => `- Resume: ${r.label} (${r.createdAt}) [${r.provenance}]`),
      ...store.jobDescriptions.map(
        (j) => `- Job Description: ${j.source.url || j.source.fileName || 'Pasted'} (${j.source.fetchedAt}) [${j.provenance}]`
      ),
      '',
    ];

    if (selectedType === 'skill_gap') {
      lines.push(`## Overall Readiness: ${Math.round(analysis.overallReadiness * 100)}%`);
      for (const g of analysis.gaps) {
        lines.push(
          `- **${g.skillLabel}** | Status: ${g.status} | Strength: ${Math.round(g.strength * 100)}% | Priority: ${g.priorityScore}`
        );
      }
    } else if (selectedType === 'company_preparation' && activeCompany && companyPrepData) {
      lines.push(`## Target Company: ${activeCompany.name} (${activeCompany.category})`);
      lines.push(
        `Readiness: ${Math.round((companyPrepData.readiness?.readiness ?? 0) * 100)}%`
      );
      for (const g of companyPrepData.companyGaps.slice(0, 10)) {
        lines.push(`- Gap: ${g.skillLabel} (${g.status})`);
      }
    } else if (selectedType === 'learning_roadmap' && store.roadmap) {
      for (const w of store.roadmap.weeks) {
        lines.push(`### Week ${w.n}: ${w.objective} (${w.estHours}h)`);
        for (const t of w.tasks) {
          lines.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.text}`);
        }
      }
    } else {
      lines.push(`Readiness: ${Math.round(analysis.overallReadiness * 100)}%`);
      lines.push(`Evidence records: ${store.evidenceRecords.length}`);
      lines.push(`Applications tracked: ${store.applications.length}`);
    }

    return lines.filter(Boolean).join('\n');
  }

  function handleDownloadMarkdown() {
    const md = buildMarkdownExport();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rolexiq-${selectedType}-${generatedDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveReportLog() {
    const record: Report = {
      id: `rep-${Date.now()}`,
      type: selectedType,
      generatedAt: new Date().toISOString(),
      sourceSnapshot: {
        readiness: analysis.overallReadiness,
        jdCount: store.jobDescriptions.length,
        evidenceCount: store.evidenceRecords.length,
        isDemoData: store.isDemoData,
      },
    };
    await updateStore((prev) => ({
      ...prev,
      reports: [record, ...prev.reports.slice(0, 49)],
    }));
    setSavedNotice('Report checkpoint saved to workspace history.');
    setTimeout(() => setSavedNotice(null), 3000);
  }

  const activeResume =
    store.resumeVersions.find((r) => r.id === store.activeResumeId) ?? store.resumeVersions[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="no-print border-b border-[#382920] pb-6">
        <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
          Exportable Career Intelligence Dossiers
        </div>
        <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
          Executive Career Reports
        </h2>
        <p className="text-sm text-[#A69A8C] mt-1">
          10 print-ready and Markdown-exportable dossiers compiled strictly from your verified data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Selector Rail */}
        <aside className="no-print lg:col-span-4 space-y-4">
          <div className="arch-panel p-4 space-y-2">
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37] px-1">
              Report Library (10)
            </div>
            <div className="space-y-1">
              {REPORT_CATALOG.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setSelectedType(item.type)}
                  className={`w-full text-left px-3 py-2.5 text-xs border transition-colors ${
                    selectedType === item.type
                      ? 'bg-[#211A16] border-[#B86D37]/70 border-l-2 border-l-[#B86D37] text-[#EAE4DC]'
                      : 'bg-transparent border-transparent text-[#A69A8C] hover:text-[#EAE4DC] hover:bg-[#12100F]'
                  }`}
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="text-[11px] text-[#A69A8C] mt-0.5">{item.description}</div>
                </button>
              ))}
            </div>
          </div>

          {store.reports.length > 0 && (
            <div className="arch-panel p-4 space-y-2 text-xs">
              <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                Saved Report History
              </div>
              <ul className="space-y-1.5 text-[#A69A8C]">
                {store.reports.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate capitalize text-[#EAE4DC]">
                      {r.type.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono-tabular shrink-0">{r.generatedAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Right Report Preview Sheet */}
        <div className="lg:col-span-8 space-y-4">
          {/* Action Bar */}
          <div className="no-print arch-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {selectedType === 'company_preparation' && store.companies.length > 0 && (
                <select
                  value={activeCompany?.id || ''}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  aria-label="Select company for preparation report"
                  className="arch-input w-auto px-3 py-2 text-xs font-medium"
                >
                  {store.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleSaveReportLog}
                disabled={missingPrereqs.length > 0}
                className="arch-btn-secondary px-3.5 py-2"
              >
                Save Report Checkpoint
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                disabled={missingPrereqs.length > 0}
                className="arch-btn-secondary px-3.5 py-2"
              >
                <Download className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={missingPrereqs.length > 0}
                className="arch-btn-primary px-4 py-2"
              >
                <Printer className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>Print / PDF</span>
              </button>
            </div>
          </div>

          {savedNotice && (
            <div className="no-print text-xs text-[#EAE4DC] bg-[#211A16] border-l-2 border-[#B86D37] px-4 py-2.5 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#B86D37]" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Missing Data Gate OR Print-Ready Sheet */}
          {missingPrereqs.length > 0 ? (
            <div className="arch-panel p-8 space-y-4">
              <div className="flex items-center gap-2 text-[#B86D37]">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Complete Required Steps for {activeMeta.title}
                </h3>
              </div>
              <p className="text-xs text-[#A69A8C] leading-relaxed">
                RolexIQ builds reports strictly from your real saved career data—never placeholder
                filler. Add the missing information below to unlock this report:
              </p>
              <ul className="space-y-2">
                {missingPrereqs.map((req, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between bg-[#12100F] border border-[#382920] px-4 py-3 text-xs"
                  >
                    <span className="text-[#EAE4DC] font-medium">{req.label}</span>
                    <button
                      type="button"
                      onClick={() => setActiveModule(req.module)}
                      className="text-[#B86D37] hover:underline font-medium"
                    >
                      Go there →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <article className="print-sheet arch-panel p-6 sm:p-8 space-y-6">
              <header className="border-b border-[#382920] pb-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#A69A8C]">
                  <span className="font-editorial text-base tracking-[0.06em] text-[#EAE4DC]">
                    Rolex<span className="text-[#B86D37]">IQ</span> Career Dossier
                  </span>
                  <span className="font-mono-tabular">Generated {generatedDate}</span>
                </div>
                <h2 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                  {activeMeta.title}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#A69A8C]">
                  <span>Candidate: {store.profile?.name || 'Not set'}</span>
                  <span>Target Timeline: {store.profile?.targetWeeks ?? 12} weeks</span>
                  <span>Weekly Study Budget: {store.profile?.hoursPerWeek ?? 8} hrs</span>
                  {store.isDemoData && <ProvenanceText tag="sample_demo" />}
                </div>

                <div className="bg-[#12100F] border border-[#382920] p-3.5 text-[11px] space-y-1.5">
                  <div className="font-medium text-[#EAE4DC] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Included Career Sources</span>
                  </div>
                  {store.resumeVersions.map((rv) => (
                    <div key={rv.id} className="text-[#A69A8C] flex flex-wrap gap-2">
                      <span>Resume: {rv.label}</span>
                      <ProvenanceText tag={rv.provenance} date={rv.createdAt} />
                    </div>
                  ))}
                  {store.jobDescriptions.map((jd) => (
                    <div key={jd.id} className="text-[#A69A8C] flex flex-wrap gap-2">
                      <span>
                        Job posting: {jd.source.url || jd.source.fileName || 'Pasted text'}
                      </span>
                      <ProvenanceText tag={jd.provenance} date={jd.source.fetchedAt} />
                    </div>
                  ))}
                </div>
              </header>

              {selectedType === 'candidate_profile' && store.profile && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h4 className="text-sm font-medium text-[#EAE4DC] mb-1">Career Goal</h4>
                    <p className="text-[#A69A8C] leading-relaxed">{store.profile.careerObjective}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#12100F] border border-[#382920] p-4">
                    <div>
                      <div className="text-[#A69A8C]">Location & Contact</div>
                      <div className="text-[#EAE4DC] font-medium mt-0.5">
                        {store.profile.contact || 'Not set'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#A69A8C]">Target Roles Selected</div>
                      <div className="text-[#EAE4DC] font-medium mt-0.5">
                        {store.targetRoles.map((r) => r.title).join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedType === 'resume_intelligence' && activeResume && (
                <div className="space-y-4 text-xs">
                  <div className="text-sm font-medium text-[#EAE4DC]">
                    Active Resume: {activeResume.label}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(activeResume.parsed).map(([field, vals]) => (
                      <div
                        key={field}
                        className="bg-[#12100F] border border-[#382920] p-3.5 space-y-1"
                      >
                        <div className="flex justify-between text-[#EAE4DC] capitalize font-medium">
                          <span>{field}</span>
                          <span className="font-mono-tabular text-[#B86D37] font-normal">
                            Confidence: {Math.round((activeResume.fieldConfidence[field] ?? 0) * 100)}%
                          </span>
                        </div>
                        <div className="text-[#A69A8C] leading-relaxed">
                          {vals.length > 0 ? vals.join(', ') : 'None extracted'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedType === 'skill_gap' && (
                <div className="space-y-4 text-xs">
                  <div className="text-sm font-medium text-[#EAE4DC]">
                    Overall Weighted Readiness:{' '}
                    <span className="font-mono-tabular text-[#B86D37]">
                      {Math.round(analysis.overallReadiness * 100)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {analysis.gaps.map((g) => (
                      <div
                        key={g.skillId}
                        className="bg-[#12100F] border border-[#382920] p-3.5 space-y-1"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-[#EAE4DC] font-medium">
                          <span>{g.skillLabel}</span>
                          <span className="font-mono-tabular text-[#B86D37] font-normal">
                            {g.status.replace('_', ' ')} · Strength {Math.round(g.strength * 100)}%
                          </span>
                        </div>
                        {g.requirementRefs[0] && (
                          <p className="text-[#A69A8C] italic">
                            "{g.requirementRefs[0].quote}" — {g.requirementRefs[0].companyName}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedType === 'company_preparation' && activeCompany && companyPrepData && (
                <div className="space-y-4 text-xs">
                  <div className="text-xl font-editorial text-[#EAE4DC]">
                    12-Section Company Preparation Dossier: {activeCompany.name}
                  </div>
                  {[
                    {
                      n: 1,
                      title: 'Target Roles & Stage',
                      body: `${activeCompany.category} · Roles: ${companyPrepData.roles.map((r) => r.title).join(', ')}`,
                    },
                    {
                      n: 2,
                      title: 'Company Readiness Score',
                      body: `${Math.round((companyPrepData.readiness?.readiness ?? 0) * 100)}% across ${companyPrepData.readiness?.rows.length ?? 0} job requirements.`,
                    },
                    {
                      n: 3,
                      title: 'Job Description Sources',
                      body: companyPrepData.jds
                        .map((j) => `${j.source.type} (${j.source.fetchedAt})`)
                        .join('; '),
                    },
                    {
                      n: 4,
                      title: 'Core Responsibilities',
                      body:
                        companyPrepData.jds.flatMap((j) => j.responsibilities).slice(0, 6).join(' · ') ||
                        'None listed',
                    },
                    {
                      n: 5,
                      title: 'Required Technical & Role Skills',
                      body:
                        companyPrepData.companyGaps
                          .filter((g) => g.requirementRefs.some((r) => r.level === 'required'))
                          .map((g) => g.skillLabel)
                          .join(', ') || 'None extracted',
                    },
                    {
                      n: 6,
                      title: 'Preferred / Differentiator Skills',
                      body:
                        companyPrepData.companyGaps
                          .filter((g) => g.requirementRefs.every((r) => r.level === 'preferred'))
                          .map((g) => g.skillLabel)
                          .join(', ') || 'None extracted',
                    },
                    {
                      n: 7,
                      title: 'Behavioural Signals from Posting',
                      body:
                        companyPrepData.jds.flatMap((j) => j.behavioural).slice(0, 6).join(' · ') ||
                        'None extracted',
                    },
                    {
                      n: 8,
                      title: 'Proven Skill Matches',
                      body:
                        companyPrepData.companyGaps
                          .filter((g) => g.status === 'strong')
                          .map((g) => g.skillLabel)
                          .join(', ') || 'None yet',
                    },
                    {
                      n: 9,
                      title: 'Priority Gaps to Close',
                      body:
                        companyPrepData.companyGaps
                          .filter((g) => g.status !== 'strong')
                          .slice(0, 5)
                          .map((g) => `${g.skillLabel} (${g.status.replace('_', ' ')})`)
                          .join(', ') || 'None',
                    },
                    {
                      n: 10,
                      title: 'Matched Portfolio Projects',
                      body:
                        companyPrepData.relatedProjects.map((p) => p.title).join(', ') ||
                        'Generate projects in Portfolio Studio',
                    },
                    {
                      n: 11,
                      title: 'Mock Interview Track Record',
                      body:
                        companyPrepData.relatedInterviews.length > 0
                          ? companyPrepData.relatedInterviews
                              .map((s) => `${s.config.type}: ${s.report?.overallScore}/100`)
                              .join('; ')
                          : 'No scored mock interviews for this company yet',
                    },
                    {
                      n: 12,
                      title: 'Immediate Preparation Next Step',
                      body:
                        companyPrepData.companyGaps[0]?.nextAction ||
                        'Run a targeted mock interview in Interview Arena.',
                    },
                  ].map((sec) => (
                    <div
                      key={sec.n}
                      className="bg-[#12100F] border border-[#382920] p-3.5 space-y-1"
                    >
                      <div className="font-medium text-[#EAE4DC]">
                        {sec.n}. {sec.title}
                      </div>
                      <p className="text-[#A69A8C] leading-relaxed">{sec.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedType === 'multi_company_comparison' && (
                <div className="space-y-4 text-xs">
                  <div className="text-[#EAE4DC] font-medium">
                    Shared Skills Across Companies:{' '}
                    <span className="font-normal text-[#A69A8C]">
                      {matrix.commonSkills.join(', ') || 'None overlapping yet'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {matrix.companies.map((c) => {
                      const cr = analysis.companyReadiness[c.id];
                      return (
                        <div
                          key={c.id}
                          className="bg-[#12100F] border border-[#382920] p-4 space-y-1"
                        >
                          <div className="flex justify-between font-medium text-[#EAE4DC]">
                            <span>{c.name}</span>
                            <span className="font-mono-tabular text-[#B86D37]">
                              {Math.round((cr?.readiness ?? 0) * 100)}%
                            </span>
                          </div>
                          <div className="text-[#A69A8C]">
                            Unique focus:{' '}
                            {(matrix.uniqueSkillsByCompany[c.id] || []).join(', ') || 'None'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedType === 'learning_roadmap' && store.roadmap && (
                <div className="space-y-3 text-xs">
                  {store.roadmap.weeks.map((w) => (
                    <div
                      key={w.n}
                      className="bg-[#12100F] border border-[#382920] p-4 space-y-2"
                    >
                      <div className="flex justify-between font-medium text-[#EAE4DC]">
                        <span>
                          Week {w.n}: {w.objective}
                        </span>
                        <span className="font-mono-tabular text-[#B86D37]">{w.estHours} hrs</span>
                      </div>
                      <ul className="space-y-1 text-[#A69A8C]">
                        {w.tasks.map((t) => (
                          <li key={t.id}>
                            [{t.status === 'done' ? 'Done' : 'Open'}] {t.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {selectedType === 'portfolio_recommendations' && (
                <div className="space-y-3 text-xs">
                  {store.portfolioProjects.map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#12100F] border border-[#382920] p-4 space-y-1.5"
                    >
                      <div className="flex justify-between font-medium text-[#EAE4DC]">
                        <span>{p.title}</span>
                        <span className="capitalize text-[#B86D37]">
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-[#A69A8C]">{p.problem}</p>
                      <div className="text-[#EAE4DC]">Stack: {p.tech.join(', ')}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedType === 'interview_performance' && (
                <div className="space-y-3 text-xs">
                  {store.interviewSessions
                    .filter((s) => Boolean(s.report))
                    .map((s) => (
                      <div
                        key={s.id}
                        className="bg-[#12100F] border border-[#382920] p-4 space-y-2"
                      >
                        <div className="flex justify-between font-medium text-[#EAE4DC]">
                          <span>
                            {s.config.type} ({s.config.difficulty})
                          </span>
                          <span className="font-mono-tabular text-[#B86D37]">
                            {s.report?.overallScore}/100 · {s.report?.practiceOutcomeLabel}
                          </span>
                        </div>
                        <p className="text-[#A69A8C] italic">{s.report?.disclaimer}</p>
                        <div className="text-[#EAE4DC]">
                          Strengths: {s.report?.technicalStrengths.join('; ')}
                        </div>
                        <div className="text-[#A69A8C]">
                          Next strategy: {s.report?.nextInterviewStrategy}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {selectedType === 'career_readiness' && (
                <div className="space-y-3 text-xs">
                  <div className="text-sm font-medium text-[#EAE4DC]">
                    Current Overall Readiness:{' '}
                    <span className="font-mono-tabular text-[#B86D37]">
                      {Math.round(analysis.overallReadiness * 100)}%
                    </span>
                  </div>
                  <div className="text-[#A69A8C]">
                    Improving skills: {progressInsights.improvingSkills.join(', ') || 'None yet'}
                  </div>
                  <div className="text-[#A69A8C]">
                    Needs attention: {progressInsights.persistentlyWeakSkills.join(', ') || 'None'}
                  </div>
                  <div className="text-[#A69A8C]">
                    Checkpoints recorded: {store.readinessSnapshots.length}
                  </div>
                </div>
              )}

              {selectedType === 'application_outcomes' && (
                <div className="space-y-3 text-xs">
                  <p className="text-[#EAE4DC] font-medium">{analytics.overallMessage}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#12100F] border border-[#382920] p-3 text-[#EAE4DC]">
                      Total: <strong className="text-[#B86D37]">{analytics.total}</strong>
                    </div>
                    <div className="bg-[#12100F] border border-[#382920] p-3 text-[#EAE4DC]">
                      Responses: <strong className="text-[#B86D37]">{analytics.responses}</strong>
                    </div>
                    <div className="bg-[#12100F] border border-[#382920] p-3 text-[#EAE4DC]">
                      Interviews:{' '}
                      <strong className="text-[#B86D37]">{analytics.interviewInvitations}</strong>
                    </div>
                  </div>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </motion.div>
  );
}
