import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Loader2,
  Mic,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import type { EvidenceLevel, EvidenceSourceType, GapStatus } from '../shared/schemas';

const STATUS_DISPLAY: Record<GapStatus, { label: string; badgeClass: string }> = {
  strong: {
    label: 'Proven',
    badgeClass: 'bg-[#211A16] border border-[#B86D37]/60 text-[#B86D37]',
  },
  developing: {
    label: 'In progress',
    badgeClass: 'bg-[#211A16] border border-[#B86D37]/35 text-[#EAE4DC]',
  },
  insufficient_evidence: {
    label: 'Claimed only',
    badgeClass: 'bg-[#12100F] border border-[#382920] text-[#A69A8C]',
  },
  missing: {
    label: 'Missing proof',
    badgeClass: 'bg-[#211A16] border border-[#B86D37] text-[#EAE4DC]',
  },
  optional: {
    label: 'Optional',
    badgeClass: 'bg-[#12100F] border border-[#382920] text-[#A69A8C]',
  },
};

export function GapExplorerModule() {
  const {
    store,
    analysis,
    selectedGapSkillId,
    setSelectedGapSkillId,
    setActiveModule,
    setInterviewPreset,
    setPrepPreset,
    updateStore,
  } = useCareerStore();

  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showMathDetails, setShowMathDetails] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evLevel, setEvLevel] = useState<EvidenceLevel>('demonstrated');
  const [evSourceType, setEvSourceType] = useState<EvidenceSourceType>('project');
  const [evSourceRef, setEvSourceRef] = useState('');
  const [evScore, setEvScore] = useState(75);
  const [evNote, setEvNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredGaps = useMemo(() => {
    if (companyFilter === 'all') return analysis.gaps;
    return analysis.gaps.filter((g) =>
      g.requirementRefs.some((r) => r.companyId === companyFilter)
    );
  }, [analysis.gaps, companyFilter]);

  const visibleGaps = useMemo(() => {
    if (showAllSkills || filteredGaps.length <= 5) return filteredGaps;
    const topFive = filteredGaps.slice(0, 5);
    if (selectedGapSkillId && !topFive.some((g) => g.skillId === selectedGapSkillId)) {
      const selected = filteredGaps.find((g) => g.skillId === selectedGapSkillId);
      if (selected) return [...topFive, selected];
    }
    return topFive;
  }, [filteredGaps, showAllSkills, selectedGapSkillId]);

  const activeGap =
    filteredGaps.find((g) => g.skillId === selectedGapSkillId) ?? filteredGaps[0] ?? null;

  const skillEvidence = useMemo(() => {
    if (!activeGap) return [];
    const ids = new Set(activeGap.evidenceRefs);
    return store.evidenceRecords.filter((e) => ids.has(e.id));
  }, [activeGap, store.evidenceRecords]);

  const handleExplainGaps = async () => {
    if (analysis.gaps.length === 0) return;
    setError(null);
    setExplaining(true);
    const res = await postJson<{
      explanations: Array<{ skillId: string; explanation: string }>;
    }>('/api/ai/gap-explain', {
      gaps: analysis.gaps.slice(0, 15).map((g) => ({
        skillId: g.skillId,
        skillLabel: g.skillLabel,
        status: g.status,
        strength: g.strength,
        weight: g.weight,
        companies: g.requirementRefs.map((r) => `${r.companyName} (${r.level})`),
      })),
    });
    setExplaining(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const nextMap: Record<string, string> = { ...store.gapExplanations };
    for (const item of res.data.explanations) {
      nextMap[item.skillId] = item.explanation;
    }
    await updateStore((prev) => ({ ...prev, gapExplanations: nextMap }));
    setNotice('Refreshed plain-language gap summaries grounded in your target roles.');
  };

  const handleSaveEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGap || !evSourceRef.trim()) {
      setError('Enter a source reference (such as a GitHub repo, project link, or credential).');
      return;
    }
    setError(null);
    const recordId = `ev-${Date.now()}`;
    await updateStore(
      (prev) => ({
        ...prev,
        evidenceRecords: [
          ...prev.evidenceRecords,
          {
            id: recordId,
            skillId: activeGap.skillId,
            skillLabel: activeGap.skillLabel,
            level: evLevel,
            sourceType: evSourceType,
            sourceRef: evSourceRef.trim(),
            date: new Date().toISOString().slice(0, 10),
            score: evLevel === 'assessed' ? evScore : undefined,
            note: evNote.trim() || undefined,
            provenance: evSourceType === 'project' ? 'project_evidence' : 'candidate',
          },
        ],
      }),
      `Added ${evLevel} proof for ${activeGap.skillLabel}`
    );
    setEvSourceRef('');
    setEvNote('');
    setShowAddEvidence(false);
    setNotice(`Added proof for ${activeGap.skillLabel}. Role readiness recalculated.`);
  };

  const handleAddToRoadmap = async () => {
    if (!activeGap) return;
    if (!store.roadmap || store.roadmap.weeks.length === 0) {
      setActiveModule('roadmap');
      return;
    }
    const taskId = `task-gap-${Date.now()}`;
    const targetWeekIndex = store.roadmap.weeks.findIndex((w) =>
      w.tasks.some((t) => t.status === 'todo')
    );
    const idx = targetWeekIndex >= 0 ? targetWeekIndex : 0;

    await updateStore((prev) => {
      if (!prev.roadmap) return prev;
      const updatedWeeks = prev.roadmap.weeks.map((w, i) =>
        i === idx
          ? {
              ...w,
              skills: Array.from(new Set([...w.skills, activeGap.skillLabel])),
              tasks: [
                ...w.tasks,
                {
                  id: taskId,
                  text: `Build verifiable proof for ${activeGap.skillLabel}: ${activeGap.nextAction}`,
                  status: 'todo' as const,
                },
              ],
            }
          : w
      );
      return {
        ...prev,
        roadmap: {
          ...prev.roadmap,
          weeks: updatedWeeks,
          changes: [
            ...prev.roadmap.changes,
            {
              id: `chg-${Date.now()}`,
              date: new Date().toISOString().slice(0, 10),
              trigger: 'gap_explorer_manual_add',
              reason: `Added focused task for ${activeGap.skillLabel} into Week ${updatedWeeks[idx].n}.`,
              added: [`${activeGap.skillLabel} milestone task`],
              removed: [],
              reprioritised: [],
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setNotice(`Added ${activeGap.skillLabel} task to Career Roadmap Week ${store.roadmap.weeks[idx].n}.`);
  };

  if (analysis.gaps.length === 0) {
    return (
      <div className="arch-panel p-8 space-y-4">
        <div className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
          Evidence-Weighted Capability Audit
        </div>
        <h2 className="font-editorial text-3xl font-light text-[#EAE4DC]">Skill Gap Explorer</h2>
        <p className="text-sm text-[#A69A8C] leading-relaxed max-w-xl">
          Extract at least one target job description in Company DNA to calculate which skills matter
          most and see where your resume needs project or interview proof.
        </p>
        <button
          type="button"
          onClick={() => setActiveModule('company-dna')}
          className="arch-btn-primary px-5 py-2.5"
        >
          Open Company DNA
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
            Evidence & Priority Matrix
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Skill Gap Explorer
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1">
            Inspect why each capability matters, view exact JD quotes, and attach verifiable proof.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="gap-co-filter" className="text-[11px] uppercase tracking-[0.12em] text-[#A69A8C]">
              Filter:
            </label>
            <select
              id="gap-co-filter"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="arch-input px-3 py-2 text-xs w-auto"
            >
              <option value="all">All Target Companies ({store.companies.length})</option>
              {store.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={explaining}
            onClick={handleExplainGaps}
            className="arch-btn-secondary px-4 py-2"
          >
            {explaining ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
            )}
            <span>{explaining ? 'Updating summaries...' : 'Refresh Summaries'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="border-l-2 border-[#B86D37] bg-[#211A16] px-4 py-3 text-xs text-[#EAE4DC]">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="border-l-2 border-[#B86D37] bg-[#1B1714] px-4 py-3 text-xs text-[#EAE4DC]">
          {notice}
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Priority List */}
        <div className="lg:col-span-5 arch-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-[#382920]">
            <h3 className="font-editorial text-xl text-[#EAE4DC]">Priority Skill Gaps</h3>
            <p className="text-[11px] text-[#A69A8C] mt-0.5">
              Proof stages: Resume Claim → Project Proof → Mock Interview
            </p>
          </div>

          <div className="divide-y divide-[#382920]">
            {visibleGaps.map((g, index) => {
              const hasClaimed = g.evidenceRefs.some(
                (id) => store.evidenceRecords.find((e) => e.id === id)?.level === 'claimed'
              );
              const hasDemonstrated = g.evidenceRefs.some(
                (id) => store.evidenceRecords.find((e) => e.id === id)?.level === 'demonstrated'
              );
              const hasAssessed = g.evidenceRefs.some(
                (id) => store.evidenceRecords.find((e) => e.id === id)?.level === 'assessed'
              );
              const isSelected = activeGap?.skillId === g.skillId;
              const badge = STATUS_DISPLAY[g.status];

              return (
                <button
                  key={g.skillId}
                  type="button"
                  onClick={() => setSelectedGapSkillId(g.skillId)}
                  className={`w-full p-4 text-left transition-colors space-y-2.5 ${
                    isSelected
                      ? 'bg-[#211A16] border-l-2 border-l-[#B86D37]'
                      : 'bg-[#1B1714] hover:bg-[#211A16]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-[11px] text-[#B86D37]">
                          0{index + 1}
                        </span>
                        <span className="text-sm font-medium text-[#EAE4DC] truncate">
                          {g.skillLabel}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] tracking-[0.08em] uppercase ${badge.badgeClass}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A69A8C]">
                        Requested by {g.requirementRefs.map((r) => r.companyName).slice(0, 3).join(', ')}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono-tabular text-sm font-semibold text-[#B86D37]">
                        {Math.round(g.strength * 100)}%
                      </div>
                      <div className="text-[10px] text-[#A69A8C]">proof</div>
                    </div>
                  </div>

                  {/* 3-Stage Proof Strip */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div
                      className={`h-6 flex items-center justify-center text-[10px] border ${
                        hasClaimed
                          ? 'bg-[#211A16] border-[#A69A8C]/60 text-[#EAE4DC]'
                          : 'bg-[#12100F] border-[#382920] text-[#A69A8C]/50'
                      }`}
                    >
                      Resume Claim
                    </div>
                    <div
                      className={`h-6 flex items-center justify-center text-[10px] border ${
                        hasDemonstrated
                          ? 'bg-[#382920] border-[#B86D37]/60 text-[#EAE4DC]'
                          : 'bg-[#12100F] border-[#382920] text-[#A69A8C]/50'
                      }`}
                    >
                      Project Proof
                    </div>
                    <div
                      className={`h-6 flex items-center justify-center gap-1 text-[10px] border ${
                        hasAssessed
                          ? 'bg-[#B86D37] border-[#B86D37] text-[#12100F] font-semibold'
                          : 'bg-[#12100F] border-[#382920] text-[#A69A8C]/50'
                      }`}
                    >
                      {hasAssessed && <Check className="w-3 h-3" />}
                      <span>Interview</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filteredGaps.length > 5 && (
            <div className="p-3 bg-[#12100F] border-t border-[#382920]">
              <button
                type="button"
                onClick={() => setShowAllSkills((s) => !s)}
                className="arch-btn-secondary w-full py-2"
              >
                {showAllSkills ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Show Top 5 Priorities</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Show all {filteredGaps.length} skills</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right: Selected Skill Detail */}
        <div className="lg:col-span-7 arch-panel p-6 space-y-5">
          {activeGap && (
            <>
              <div className="border-b border-[#382920] pb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                      {activeGap.skillLabel}
                    </h3>
                    <span className={`px-2.5 py-0.5 text-[10px] tracking-[0.1em] uppercase ${STATUS_DISPLAY[activeGap.status].badgeClass}`}>
                      {STATUS_DISPLAY[activeGap.status].label}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-tabular text-2xl font-light text-[#B86D37]">
                      {Math.round(activeGap.strength * 100)}%
                    </span>
                    <span className="text-xs text-[#A69A8C] ml-1.5">verified strength</span>
                  </div>
                </div>
                <p className="text-sm text-[#A69A8C] leading-relaxed">{activeGap.explanation}</p>
              </div>

              <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[#A69A8C]">
                    Importance:{' '}
                    <strong className="text-[#EAE4DC]">
                      {activeGap.weight >= 3 ? 'High' : activeGap.weight >= 1.5 ? 'Medium' : 'Supporting'}
                    </strong>{' '}
                    · Proof:{' '}
                    <strong className="text-[#B86D37]">
                      {STATUS_DISPLAY[activeGap.status].label}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMathDetails((v) => !v)}
                    className="text-[11px] text-[#B86D37] hover:underline"
                  >
                    {showMathDetails ? 'Hide formula details' : 'Show formula details'}
                  </button>
                </div>

                {showMathDetails && (
                  <div className="pt-2 border-t border-[#382920] font-mono-tabular text-[11px] text-[#A69A8C]">
                    Weight {activeGap.priorityBreakdown.weight.toFixed(2)} × Gap{' '}
                    {activeGap.priorityBreakdown.strengthGap.toFixed(2)} × Dependency{' '}
                    {activeGap.priorityBreakdown.dependencyBoost.toFixed(2)} × Timeline{' '}
                    {activeGap.priorityBreakdown.timelineFactor.toFixed(2)} = Priority{' '}
                    <strong className="text-[#EAE4DC]">
                      {activeGap.priorityScore.toFixed(2)}
                    </strong>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                  Job Description Quotes ({activeGap.requirementRefs.length})
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeGap.requirementRefs.map((ref, i) => (
                    <div
                      key={i}
                      className="bg-[#12100F] border border-[#382920] p-3 text-xs space-y-1"
                    >
                      <div className="text-[#EAE4DC] font-medium">
                        {ref.companyName} · {ref.roleTitle}{' '}
                        <span className="text-[#A69A8C] font-normal">({ref.level})</span>
                      </div>
                      <div className="text-[#A69A8C] italic leading-relaxed">“{ref.quote}”</div>
                      <div className="text-[11px] text-[#A69A8C]/75 font-mono-tabular">
                        {ref.sourceLabel} · {ref.fetchedAt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                  Recorded Evidence ({skillEvidence.length})
                </div>
                {skillEvidence.length === 0 ? (
                  <p className="text-xs text-[#A69A8C]">
                    No proof recorded yet. Attach a project, log an achievement, discover learning
                    resources, or practise in Interview Arena.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {skillEvidence.map((ev) => (
                      <div
                        key={ev.id}
                        className="bg-[#211A16] border border-[#382920] p-3 text-xs space-y-0.5"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium capitalize text-[#EAE4DC]">
                            {ev.level === 'claimed'
                              ? 'Resume claim'
                              : ev.level === 'demonstrated'
                                ? 'Project proof'
                                : 'Assessed in interview'}{' '}
                            <span className="font-normal text-[#A69A8C]">({ev.sourceType})</span>
                          </span>
                          <span className="font-mono-tabular text-[#A69A8C]">{ev.date}</span>
                        </div>
                        <div className="text-[#A69A8C]">{ev.sourceRef}</div>
                        {typeof ev.score === 'number' && (
                          <div className="font-mono-tabular text-[#B86D37] font-medium">
                            Interview Score: {ev.score}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-[#382920]">
                <div className="text-xs text-[#A69A8C] leading-relaxed">
                  <strong className="text-[#EAE4DC]">Recommended move:</strong>{' '}
                  {activeGap.nextAction}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddEvidence((s) => !s)}
                    className="arch-btn-primary px-3.5 py-2"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Add Evidence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrepPreset({ skill: activeGap.skillLabel, tab: 'resources' });
                      setActiveModule('preparation');
                    }}
                    className="arch-btn-secondary px-3.5 py-2"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Find Resources</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToRoadmap}
                    className="arch-btn-secondary px-3.5 py-2"
                  >
                    Add to Roadmap
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModule('portfolio')}
                    className="arch-btn-secondary px-3.5 py-2"
                  >
                    <FolderGit2 className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Portfolio Project</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstRef = activeGap.requirementRefs[0];
                      setInterviewPreset({
                        companyId: firstRef?.companyId,
                        focus: activeGap.skillLabel,
                      });
                      setActiveModule('interview');
                    }}
                    className="arch-btn-secondary px-3.5 py-2"
                  >
                    <Mic className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Practise</span>
                  </button>
                </div>
              </div>

              {showAddEvidence && (
                <form
                  onSubmit={handleSaveEvidence}
                  className="bg-[#12100F] border border-[#B86D37]/40 p-4 space-y-3 text-xs"
                >
                  <div className="font-medium text-[#EAE4DC]">
                    Record Proof for {activeGap.skillLabel}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ev-lvl" className="block text-[#A69A8C] mb-1">
                        Proof Level
                      </label>
                      <select
                        id="ev-lvl"
                        value={evLevel}
                        onChange={(e) => setEvLevel(e.target.value as EvidenceLevel)}
                        className="arch-input px-2.5 py-2"
                      >
                        <option value="demonstrated">Demonstrated (Built / Applied)</option>
                        <option value="assessed">Assessed (Scored Evaluation)</option>
                        <option value="claimed">Claimed (Resume / Course)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ev-src" className="block text-[#A69A8C] mb-1">
                        Source Type
                      </label>
                      <select
                        id="ev-src"
                        value={evSourceType}
                        onChange={(e) => setEvSourceType(e.target.value as EvidenceSourceType)}
                        className="arch-input px-2.5 py-2"
                      >
                        <option value="project">Project / Repo</option>
                        <option value="certification">Certification</option>
                        <option value="assessment">Assessment</option>
                        <option value="manual">Manual Note</option>
                      </select>
                    </div>
                  </div>

                  {evLevel === 'assessed' && (
                    <div>
                      <label htmlFor="ev-score" className="block text-[#A69A8C] mb-1">
                        Assessment Score (0–100)
                      </label>
                      <input
                        id="ev-score"
                        type="number"
                        min={0}
                        max={100}
                        value={evScore}
                        onChange={(e) => setEvScore(Number(e.target.value))}
                        className="arch-input px-2.5 py-2"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="ev-ref" className="block text-[#A69A8C] mb-1">
                      Source link or reference
                    </label>
                    <input
                      id="ev-ref"
                      type="text"
                      value={evSourceRef}
                      onChange={(e) => setEvSourceRef(e.target.value)}
                      placeholder="e.g. github.com/user/kafka-consumer"
                      className="arch-input px-2.5 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="ev-note" className="block text-[#A69A8C] mb-1">
                      Notes
                    </label>
                    <textarea
                      id="ev-note"
                      rows={2}
                      value={evNote}
                      onChange={(e) => setEvNote(e.target.value)}
                      className="arch-input px-2.5 py-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddEvidence(false)}
                      className="arch-btn-secondary px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="arch-btn-primary px-4 py-1.5">
                      Save Proof
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
