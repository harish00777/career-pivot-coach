import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';

export function ProgressModule() {
  const {
    store,
    analysis,
    progressInsights,
    setActiveModule,
    setSelectedGapSkillId,
  } = useCareerStore();

  const snapshots = store.readinessSnapshots;
  const scoredInterviews = store.interviewSessions.filter((s) => Boolean(s.report));

  const chartWidth = 680;
  const chartHeight = 200;
  const padX = 42;
  const padY = 24;
  const innerW = chartWidth - padX * 2;
  const innerH = chartHeight - padY * 2;

  const points =
    snapshots.length >= 2
      ? snapshots.map((snap, idx) => {
          const x = padX + (idx / (snapshots.length - 1)) * innerW;
          const y = padY + (1 - snap.overallReadiness) * innerH;
          return { x, y, snap };
        })
      : [];

  const polylineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const currentReadinessPct = Math.round(analysis.overallReadiness * 100);
  const deltaPct =
    progressInsights.readinessDelta !== null
      ? Math.round(progressInsights.readinessDelta * 100)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header Band */}
      <div className="border-b border-[#382920] pb-6">
        <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
          Capability Progression & Signals
        </div>
        <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
          Readiness Trajectory
        </h2>
        <p className="text-sm text-[#A69A8C] mt-1">
          Every score checkpoint logs verified milestones from project proof, completed roadmap steps,
          or scored mock interviews.
        </p>
      </div>

      {/* Trajectory + Interview Scores */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 arch-panel p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                Verified Readiness Curve
              </h3>
              <p className="text-xs text-[#A69A8C] mt-0.5">
                Evidence-weighted score evolution across checkpoints
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono-tabular text-3xl font-light text-[#EAE4DC]">
                {currentReadinessPct}%
              </div>
              {deltaPct !== null ? (
                <div
                  className={`text-xs font-mono-tabular font-medium ${
                    deltaPct >= 0 ? 'text-[#B86D37]' : 'text-[#A69A8C]'
                  }`}
                >
                  {deltaPct >= 0 ? `+${deltaPct}%` : `${deltaPct}%`} since first check-in
                </div>
              ) : (
                <div className="text-xs text-[#A69A8C]">Baseline stage</div>
              )}
            </div>
          </div>

          {snapshots.length < 2 ? (
            <div className="border border-dashed border-[#382920] bg-[#12100F] p-6 text-sm text-[#A69A8C] space-y-3">
              <p className="text-[#EAE4DC] font-medium">
                Not enough checkpoints yet to chart your trend ({snapshots.length}/2 recorded).
              </p>
              <p className="text-xs leading-relaxed">
                Complete a roadmap task, verify a portfolio project, add skill proof, or finish a
                scored mock interview to plot your progress over time.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveModule('roadmap')}
                  className="arch-btn-primary px-4 py-2"
                >
                  Open Career Roadmap
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule('interview')}
                  className="arch-btn-secondary px-4 py-2"
                >
                  Enter Interview Arena
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full overflow-x-auto bg-[#12100F] border border-[#382920] p-3">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full min-w-[460px] h-52"
                role="img"
                aria-label="Readiness score trajectory chart"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                  const y = padY + (1 - tick) * innerH;
                  return (
                    <g key={tick}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={chartWidth - padX}
                        y2={y}
                        stroke="#382920"
                        strokeWidth="1"
                      />
                      <text
                        x={padX - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill="#A69A8C"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {Math.round(tick * 100)}%
                      </text>
                    </g>
                  );
                })}
                <polyline
                  fill="none"
                  stroke="#B86D37"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={polylineStr}
                />
                {points.map((pt) => (
                  <g key={pt.snap.id}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4.5"
                      fill="#1B1714"
                      stroke="#B86D37"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={chartHeight - 4}
                      textAnchor="middle"
                      fill="#A69A8C"
                      fontSize="9"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {pt.snap.date.slice(5)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Scored Mock Interviews Summary */}
        <div className="lg:col-span-4 arch-panel p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Mock Interview Scores
            </h3>
            {scoredInterviews.length === 0 ? (
              <p className="text-xs text-[#A69A8C] leading-relaxed">
                No rubric-scored interviews recorded yet. Complete a practice session in Interview
                Arena to convert skills into verified interview proof.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {scoredInterviews.slice(-5).reverse().map((s) => {
                  const comp = store.companies.find((c) => c.id === s.config.companyId);
                  return (
                    <li
                      key={s.id}
                      className="border-b border-[#382920] pb-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="text-[#EAE4DC] font-medium truncate">
                          {comp?.name || 'Target'} · {s.config.type}
                        </div>
                        <div className="text-[#A69A8C] font-mono-tabular">
                          {s.startedAt.slice(0, 10)} · {s.report?.practiceOutcomeLabel}
                        </div>
                      </div>
                      <span className="font-mono-tabular text-sm font-semibold text-[#B86D37] shrink-0">
                        {s.report?.overallScore ?? 0}/100
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('interview')}
            className="arch-btn-primary w-full py-2.5"
          >
            <span>Open Interview Arena</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
          </button>
        </div>
      </section>

      {/* Diagnostic Signals */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="arch-panel p-6 space-y-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#B86D37]" />
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Improving Capabilities
            </h3>
          </div>
          {progressInsights.improvingSkills.length === 0 ? (
            <p className="text-xs text-[#A69A8C] leading-relaxed">
              Add project proof or interview scores to a skill you previously claimed on your resume
              to track upward progress here.
            </p>
          ) : (
            <ul className="space-y-2">
              {progressInsights.improvingSkills.map((skill) => (
                <li
                  key={skill}
                  className="flex items-center gap-2 text-sm text-[#EAE4DC] bg-[#211A16] border border-[#B86D37]/40 px-3 py-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#B86D37] shrink-0" />
                  <span className="font-medium">{skill}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-4 border-t border-[#382920] space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B86D37]" />
              <h4 className="text-xs uppercase tracking-[0.14em] text-[#EAE4DC]">
                Skills Needing Attention
              </h4>
            </div>
            {progressInsights.persistentlyWeakSkills.length === 0 ? (
              <p className="text-xs text-[#A69A8C]">
                No missing or unverified priority gaps remaining.
              </p>
            ) : (
              <div className="space-y-2">
                {progressInsights.persistentlyWeakSkills.map((skill) => {
                  const matchedGap = analysis.gaps.find((g) => g.skillLabel === skill);
                  return (
                    <div
                      key={skill}
                      className="flex items-center justify-between gap-2 text-xs bg-[#12100F] border border-[#382920] px-3 py-2"
                    >
                      <span className="text-[#EAE4DC] font-medium">{skill}</span>
                      {matchedGap && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGapSkillId(matchedGap.skillId);
                            setActiveModule('gaps');
                          }}
                          className="text-[#B86D37] hover:underline font-medium shrink-0"
                        >
                          Inspect gap
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="arch-panel p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#B86D37]" />
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Roadmap Reminders & Recurring Topics
            </h3>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
              Open Tasks from Earlier Weeks
            </div>
            {progressInsights.overdueTasks.length === 0 ? (
              <p className="text-xs text-[#A69A8C]">
                You have no overdue tasks from earlier roadmap weeks.
              </p>
            ) : (
              <ul className="space-y-2">
                {progressInsights.overdueTasks.map((t, idx) => (
                  <li
                    key={`${t.weekN}-${idx}`}
                    className="flex items-start justify-between gap-2 text-xs bg-[#211A16] border border-[#B86D37]/35 px-3 py-2"
                  >
                    <span className="text-[#EAE4DC]">
                      <strong className="font-mono-tabular text-[#B86D37]">W{t.weekN}:</strong>{' '}
                      {t.taskText}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveModule('roadmap')}
                      className="text-[#B86D37] hover:underline font-medium shrink-0"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-[#382920] space-y-2">
            <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
              Recurring Interview Weak Topics (2+ sessions)
            </div>
            {progressInsights.recurringInterviewGaps.length === 0 ? (
              <p className="text-xs text-[#A69A8C]">
                No topic has appeared as weak across two or more scored interviews yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {progressInsights.recurringInterviewGaps.map((topic) => (
                  <li
                    key={topic}
                    className="text-xs font-medium text-[#EAE4DC] bg-[#12100F] border border-[#B86D37]/40 px-3 py-2"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Snapshot History Ledger */}
      <section className="arch-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
            Progress Checkpoints
          </h3>
          <span className="text-xs font-mono-tabular text-[#A69A8C]">
            {snapshots.length} checkpoint{snapshots.length === 1 ? '' : 's'}
          </span>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-xs text-[#A69A8C]">No readiness checkpoints recorded yet.</p>
        ) : (
          <div className="overflow-x-auto border border-[#382920]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#382920] bg-[#211A16] text-[#A69A8C] uppercase text-[10px] tracking-[0.12em]">
                  <th className="py-2.5 px-3 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Milestone Trigger</th>
                  <th className="py-2.5 px-3 font-medium">Readiness</th>
                  <th className="py-2.5 px-3 font-medium">Proven</th>
                  <th className="py-2.5 px-3 font-medium">In Progress</th>
                  <th className="py-2.5 px-3 font-medium">Needs Proof</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.slice().reverse().map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[#382920]/70 last:border-b-0 bg-[#1B1714] text-[#EAE4DC]"
                  >
                    <td className="py-2.5 px-3 font-mono-tabular text-[#A69A8C]">{s.date}</td>
                    <td className="py-2.5 px-3">{s.trigger}</td>
                    <td className="py-2.5 px-3 font-mono-tabular font-semibold text-[#EAE4DC]">
                      {Math.round(s.overallReadiness * 100)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular font-medium text-[#B86D37]">
                      {s.strongCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular font-medium text-[#EAE4DC]">
                      {s.developingCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular font-medium text-[#A69A8C]">
                      {s.missingCount + s.insufficientCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </motion.div>
  );
}
