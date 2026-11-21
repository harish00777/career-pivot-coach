import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import { normalizeSkillId } from '../shared/evidenceEngine';
import type { EvidenceRecord, RoadmapWeek } from '../shared/schemas';

export function RoadmapModule() {
  const { store, analysis, updateStore, setActiveModule } = useCareerStore();
  const [hoursPerWeek, setHoursPerWeek] = useState(store.profile?.hoursPerWeek ?? 8);
  const [targetWeeks, setTargetWeeks] = useState(store.profile?.targetWeeks ?? 6);
  const [building, setBuilding] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [completingTask, setCompletingTask] = useState<{
    weekN: number;
    taskId: string;
    taskText: string;
    weekSkills: string[];
  } | null>(null);
  const [evidenceLink, setEvidenceLink] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [createDemonstrated, setCreateDemonstrated] = useState(true);

  const currentActiveWeek =
    store.roadmap?.weeks.find((w) => w.tasks.some((t) => t.status === 'todo')) ??
    store.roadmap?.weeks[0] ??
    null;

  useEffect(() => {
    if (expandedWeek === null && currentActiveWeek) {
      setExpandedWeek(currentActiveWeek.n);
    }
  }, [currentActiveWeek, expandedWeek]);

  useEffect(() => {
    if (!completingTask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCompletingTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [completingTask]);

  const handleBuildRoadmap = async () => {
    if (analysis.gaps.length === 0) {
      setError('Extract at least one target job description in Company DNA before building a roadmap.');
      return;
    }
    setError(null);
    setNotice(null);
    setBuilding(true);
    const res = await postJson<{ weeks: RoadmapWeek[] }>('/api/ai/planner', {
      mode: 'create',
      hoursPerWeek,
      targetWeeks,
      gaps: analysis.gaps.map((g) => ({
        skillLabel: g.skillLabel,
        status: g.status,
        priorityScore: g.priorityScore,
        companies: g.requirementRefs.map((r) => r.companyName),
      })),
    });
    setBuilding(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    await updateStore((prev) => ({
      ...prev,
      roadmap: {
        id: `rm-${Date.now()}`,
        hoursPerWeek,
        totalWeeks: res.data.weeks.length,
        weeks: res.data.weeks,
        changes: [
          {
            id: `chg-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            trigger: 'Initial plan created',
            reason: `Generated a ${res.data.weeks.length}-week roadmap prioritizing top skill gaps within ${hoursPerWeek} hrs/week.`,
            added: res.data.weeks.map((w) => `Week ${w.n}: ${w.objective}`),
            removed: [],
            reprioritised: [],
          },
        ],
        updatedAt: new Date().toISOString(),
        provenance: 'ai_inference',
      },
    }));
    setExpandedWeek(res.data.weeks[0]?.n ?? 1);
    setNotice('Built your weekly Career Roadmap within your hours/week schedule.');
  };

  const handleAdaptRoadmap = async (trigger: string, reasonContext: string) => {
    if (!store.roadmap) return;
    setError(null);
    setAdapting(true);

    const res = await postJson<{
      reason: string;
      added: string[];
      removed: string[];
      reprioritised: string[];
      updatedIncompleteWeeks: RoadmapWeek[];
    }>('/api/ai/planner', {
      mode: 'adapt',
      trigger,
      reasonContext,
      hoursPerWeek,
      targetWeeks,
      gaps: analysis.gaps.map((g) => ({
        skillLabel: g.skillLabel,
        status: g.status,
        priorityScore: g.priorityScore,
      })),
      existingRoadmap: store.roadmap,
    });
    setAdapting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    await updateStore((prev) => {
      if (!prev.roadmap) return prev;
      const mergedWeeks = prev.roadmap.weeks.map((existingWeek) => {
        const doneTasks = existingWeek.tasks.filter((t) => t.status === 'done');
        const suggested = res.data.updatedIncompleteWeeks.find((u) => u.n === existingWeek.n);
        if (!suggested) return existingWeek;
        const doneIds = new Set(doneTasks.map((t) => t.id));
        const newTodoTasks = suggested.tasks
          .filter((t) => !doneIds.has(t.id))
          .map((t, idx) => ({
            id: t.id || `task-adapt-${existingWeek.n}-${idx}-${Date.now()}`,
            text: t.text,
            status: 'todo' as const,
          }));
        return {
          ...suggested,
          estHours: Math.min(hoursPerWeek, Math.max(1, suggested.estHours)),
          tasks: [...doneTasks, ...newTodoTasks],
        };
      });

      return {
        ...prev,
        roadmap: {
          ...prev.roadmap,
          weeks: mergedWeeks,
          changes: [
            {
              id: `chg-${Date.now()}`,
              date: new Date().toISOString().slice(0, 10),
              trigger,
              reason: res.data.reason,
              added: res.data.added,
              removed: res.data.removed,
              reprioritised: res.data.reprioritised,
            },
            ...prev.roadmap.changes,
          ],
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setNotice('Updated upcoming weeks while preserving all completed milestones.');
  };

  const handleConfirmTaskComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    const newRecords: EvidenceRecord[] = [];
    if (createDemonstrated && (evidenceLink.trim() || evidenceNote.trim())) {
      const targetSkill = completingTask.weekSkills[0] || 'Applied Engineering';
      newRecords.push({
        id: `ev-rm-${Date.now()}`,
        skillId: normalizeSkillId(targetSkill),
        skillLabel: targetSkill,
        level: 'demonstrated',
        sourceType: 'project',
        sourceRef: evidenceLink.trim() || `Roadmap Week ${completingTask.weekN} Deliverable`,
        date: new Date().toISOString().slice(0, 10),
        note: evidenceNote.trim() || completingTask.taskText,
        provenance: 'project_evidence',
      });
    }

    await updateStore(
      (prev) => {
        if (!prev.roadmap) return prev;
        return {
          ...prev,
          evidenceRecords: [...prev.evidenceRecords, ...newRecords],
          roadmap: {
            ...prev.roadmap,
            weeks: prev.roadmap.weeks.map((w) =>
              w.n === completingTask.weekN
                ? {
                    ...w,
                    tasks: w.tasks.map((t) =>
                      t.id === completingTask.taskId
                        ? {
                            ...t,
                            status: 'done',
                            evidenceId: newRecords[0]?.id,
                            evidenceUrl: evidenceLink.trim() || undefined,
                            evidenceNote: evidenceNote.trim() || undefined,
                            completedAt: new Date().toISOString().slice(0, 10),
                          }
                        : t
                    ),
                  }
                : w
            ),
            updatedAt: new Date().toISOString(),
          },
        };
      },
      newRecords.length > 0 ? 'Completed roadmap task with proof' : undefined
    );

    const finishedLabel = completingTask.taskText;
    setCompletingTask(null);
    setEvidenceLink('');
    setEvidenceNote('');
    setNotice(
      newRecords.length > 0
        ? `Marked task completed and added project proof for ${newRecords[0].skillLabel}.`
        : 'Marked task completed.'
    );

    if (newRecords.length > 0) {
      await handleAdaptRoadmap(
        'Milestone completed',
        `Completed "${finishedLabel}" with saved proof.`
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header & Planning Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
            Adaptive Execution Sequence
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Weekly Learning Roadmap
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1">
            Structured around your weekly hours budget and automatically rebalanced as you log proof.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="rm-hrs"
              className="block text-[10px] uppercase tracking-[0.14em] text-[#A69A8C] mb-1"
            >
              Hrs / Week
            </label>
            <input
              id="rm-hrs"
              type="number"
              min={2}
              max={40}
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(Number(e.target.value))}
              className="arch-input w-20 px-3 py-2 text-xs font-mono-tabular"
            />
          </div>
          <div>
            <label
              htmlFor="rm-wks"
              className="block text-[10px] uppercase tracking-[0.14em] text-[#A69A8C] mb-1"
            >
              Weeks
            </label>
            <input
              id="rm-wks"
              type="number"
              min={2}
              max={12}
              value={targetWeeks}
              onChange={(e) => setTargetWeeks(Number(e.target.value))}
              className="arch-input w-20 px-3 py-2 text-xs font-mono-tabular"
            />
          </div>

          {store.roadmap && (
            <>
              <button
                type="button"
                onClick={() => setShowChangelog((v) => !v)}
                className="arch-btn-secondary px-3.5 py-2"
              >
                <History className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>Changes ({store.roadmap.changes.length})</span>
              </button>
              <button
                type="button"
                disabled={adapting}
                onClick={() =>
                  handleAdaptRoadmap(
                    'Manual rebalance',
                    'Candidate requested priority rebalance against latest skill gaps.'
                  )
                }
                className="arch-btn-secondary px-3.5 py-2"
              >
                {adapting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#B86D37]" />
                )}
                <span>Rebalance Upcoming</span>
              </button>
            </>
          )}

          <button
            type="button"
            disabled={building}
            onClick={handleBuildRoadmap}
            className="arch-btn-primary px-4 py-2"
          >
            {building && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />}
            <span>
              {building
                ? 'Building roadmap...'
                : store.roadmap
                  ? 'Regenerate Plan'
                  : 'Build Weekly Roadmap'}
            </span>
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

      {!store.roadmap ? (
        <div className="arch-panel p-8 space-y-4">
          <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
            No weekly roadmap created yet
          </h3>
          <p className="text-sm text-[#A69A8C] max-w-xl leading-relaxed">
            Your roadmap sequences high-impact skills required across your target companies and fits
            inside your {hoursPerWeek} hrs/week availability.
          </p>
          {analysis.gaps.length === 0 && (
            <button
              type="button"
              onClick={() => setActiveModule('company-dna')}
              className="arch-btn-primary px-5 py-2.5"
            >
              Add target job descriptions in Company DNA first
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Current Week Spotlight */}
          {currentActiveWeek && (
            <section className="arch-panel p-6 border-l-2 border-l-[#B86D37] flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                  Current Focus Week
                </div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Week {currentActiveWeek.n}: {currentActiveWeek.objective}
                </h3>
                <div className="text-xs text-[#A69A8C]">
                  Focus skills: {currentActiveWeek.skills.join(' · ')}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="font-mono-tabular text-lg font-medium text-[#B86D37]">
                  {currentActiveWeek.tasks.filter((t) => t.status === 'done').length} /{' '}
                  {currentActiveWeek.tasks.length} tasks done
                </div>
                <div className="text-xs font-mono-tabular text-[#A69A8C]">
                  {currentActiveWeek.estHours}h estimated (budget {store.roadmap.hoursPerWeek}h)
                </div>
              </div>
            </section>
          )}

          {/* Collapsible Plan Update Log */}
          {showChangelog && (
            <section className="arch-panel p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#382920] pb-2.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#B86D37]" />
                  <h3 className="font-editorial text-lg text-[#EAE4DC]">
                    Why this plan updated
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangelog(false)}
                  className="text-xs text-[#A69A8C] hover:text-[#EAE4DC] underline"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                {store.roadmap.changes.map((chg) => (
                  <div
                    key={chg.id}
                    className="bg-[#12100F] border border-[#382920] p-3.5 text-xs space-y-1.5"
                  >
                    <div className="flex justify-between text-[#A69A8C] font-mono-tabular">
                      <span className="font-medium text-[#EAE4DC]">{chg.trigger}</span>
                      <span>{chg.date}</span>
                    </div>
                    <p className="text-[#A69A8C] leading-relaxed">{chg.reason}</p>
                    {chg.added.length > 0 && (
                      <div className="text-[#EAE4DC]">
                        <span className="text-[#B86D37]">Added:</span> {chg.added.join(', ')}
                      </div>
                    )}
                    {chg.reprioritised.length > 0 && (
                      <div className="text-[#B86D37]">
                        Reprioritised: {chg.reprioritised.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Compact Vertical Week Timeline */}
          <div className="space-y-4">
            {store.roadmap.weeks.map((week) => {
              const isOpen = expandedWeek === week.n;
              const doneCount = week.tasks.filter((t) => t.status === 'done').length;
              const allDone = week.tasks.length > 0 && doneCount === week.tasks.length;

              return (
                <article key={week.n} className="arch-panel overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedWeek(isOpen ? null : week.n)}
                    className="w-full p-5 text-left flex flex-wrap items-center justify-between gap-4 hover:bg-[#211A16]/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#A69A8C] font-mono-tabular">
                        <span className="font-semibold text-[#B86D37]">
                          WEEK {String(week.n).padStart(2, '0')}
                        </span>
                        <span>·</span>
                        <span>{week.estHours} hrs estimated</span>
                        {allDone && (
                          <span className="px-2 py-0.5 bg-[#211A16] border border-[#B86D37]/60 text-[#B86D37] text-[10px] tracking-[0.08em] uppercase font-sans-ui">
                            Week Complete
                          </span>
                        )}
                      </div>
                      <h3 className="font-editorial text-xl text-[#EAE4DC]">{week.objective}</h3>
                      <div className="text-xs text-[#A69A8C]">{week.skills.join(' · ')}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono-tabular text-[#A69A8C]">
                        {doneCount}/{week.tasks.length} done
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#B86D37]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#A69A8C]" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-6 pt-3 border-t border-[#382920] space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2">
                          <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                            Topics & Practice
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-[#A69A8C]">
                            {week.topics.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                            {week.exercises.map((ex, i) => (
                              <li key={`ex-${i}`} className="text-[#EAE4DC]">
                                Exercise: {ex}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2">
                          <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                            Deliverables & Proof to Collect
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-[#A69A8C]">
                            {week.deliverables.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                            {week.completionCriteria.map((c, i) => (
                              <li key={`c-${i}`}>Success bar: {c}</li>
                            ))}
                            {week.evidenceToCollect.map((e, i) => (
                              <li key={`ev-${i}`} className="text-[#EAE4DC]">
                                <span className="text-[#B86D37]">Proof:</span> {e}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {week.resources.length > 0 && (
                        <div className="space-y-1.5 text-xs">
                          <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                            Study Resources
                          </div>
                          <div className="flex flex-wrap gap-4">
                            {week.resources.map((res, i) =>
                              res.verified && res.url ? (
                                <a
                                  key={i}
                                  href={res.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[#EAE4DC] underline hover:text-[#B86D37]"
                                >
                                  <span>{res.title}</span>
                                  <ExternalLink className="w-3 h-3 text-[#B86D37]" />
                                </a>
                              ) : (
                                <span key={i} className="text-[#A69A8C]">
                                  {res.title} (search: “{res.searchTerm || res.title}”)
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 pt-2 border-t border-[#382920]">
                        <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                          Weekly Action Steps
                        </div>
                        {week.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start justify-between gap-3 p-3.5 bg-[#12100F] border border-[#382920] text-xs"
                          >
                            <div className="flex items-start gap-2.5">
                              {task.status === 'done' ? (
                                <CheckCircle2 className="w-4 h-4 text-[#B86D37] shrink-0 mt-0.5" />
                              ) : (
                                <Circle className="w-4 h-4 text-[#A69A8C]/60 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div
                                  className={
                                    task.status === 'done'
                                      ? 'text-[#A69A8C] line-through'
                                      : 'text-[#EAE4DC] font-medium'
                                  }
                                >
                                  {task.text}
                                </div>
                                {task.evidenceNote && (
                                  <div className="text-[11px] text-[#B86D37] mt-1">
                                    Proof logged ({task.completedAt}): {task.evidenceNote}
                                  </div>
                                )}
                              </div>
                            </div>
                            {task.status === 'todo' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setCompletingTask({
                                    weekN: week.n,
                                    taskId: task.id,
                                    taskText: task.text,
                                    weekSkills: week.skills,
                                  })
                                }
                                className="arch-btn-primary px-3 py-1.5 shrink-0"
                              >
                                Mark Complete
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 bg-[#211A16] border border-[#B86D37]/50 text-[10px] tracking-[0.08em] uppercase text-[#B86D37] shrink-0">
                                Completed
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Completion & Evidence Modal */}
      {completingTask && (
        <div
          className="fixed inset-0 z-50 bg-[#12100F]/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-complete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCompletingTask(null);
          }}
        >
          <form
            onSubmit={handleConfirmTaskComplete}
            className="max-w-md w-full arch-panel-elevated p-6 space-y-4 text-xs"
          >
            <h3 id="task-complete-title" className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Complete Roadmap Step
            </h3>
            <p className="text-[#A69A8C] leading-relaxed">{completingTask.taskText}</p>

            <div>
              <label htmlFor="task-ev-url" className="block text-[#A69A8C] mb-1">
                Proof link (GitHub commit, PR, doc, or demo URL)
              </label>
              <input
                id="task-ev-url"
                type="text"
                value={evidenceLink}
                onChange={(e) => setEvidenceLink(e.target.value)}
                placeholder="https://github.com/..."
                className="arch-input px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="task-ev-note" className="block text-[#A69A8C] mb-1">
                What did you build or verify?
              </label>
              <textarea
                id="task-ev-note"
                rows={3}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Summarize what you built, tested, or verified..."
                className="arch-input px-3 py-2"
              />
            </div>

            <label className="flex items-center gap-2 text-[#EAE4DC]">
              <input
                type="checkbox"
                checked={createDemonstrated}
                onChange={(e) => setCreateDemonstrated(e.target.checked)}
                className="accent-[#B86D37]"
              />
              <span>
                Record project proof for {completingTask.weekSkills[0] || 'this skill'}
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#382920]">
              <button
                type="button"
                onClick={() => setCompletingTask(null)}
                className="arch-btn-secondary px-3.5 py-2"
              >
                Cancel
              </button>
              <button type="submit" className="arch-btn-primary px-4 py-2">
                Confirm & Record
              </button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
}
