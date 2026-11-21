import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';

export function ReadinessDrawer() {
  const { readinessDrawerOpen, setReadinessDrawerOpen, analysis } = useCareerStore();

  useEffect(() => {
    if (!readinessDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReadinessDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readinessDrawerOpen, setReadinessDrawerOpen]);

  if (!readinessDrawerOpen) return null;

  const pct = Math.round(analysis.overallReadiness * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#12100F]/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="readiness-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setReadinessDrawerOpen(false);
        }
      }}
    >
      <div className="w-full max-w-2xl bg-[#12100F] border-l border-[#382920] h-full overflow-y-auto p-6 sm:p-8 flex flex-col gap-6 text-[#EAE4DC] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#382920] pb-4">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
              Transparent Readiness Audit
            </div>
            <h2
              id="readiness-drawer-title"
              className="font-editorial text-2xl sm:text-3xl font-light text-[#EAE4DC]"
            >
              How your readiness score is calculated.
            </h2>
            <p className="text-xs sm:text-sm text-[#A69A8C] mt-1.5 leading-relaxed">
              Every percentage is computed deterministically from extracted job description
              requirements and evidence added via projects, resume items, or scored mock interviews.
              Delivery pacing and filler words never reduce readiness.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReadinessDrawerOpen(false)}
            aria-label="Close readiness breakdown"
            className="h-9 w-9 flex items-center justify-center border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#B86D37] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#1B1714] border border-[#382920] p-4">
          <div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#A69A8C]">
              Overall Readiness
            </div>
            <div className="font-mono-tabular text-2xl font-light text-[#B86D37] mt-1">
              {pct}%
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#A69A8C]">
              Earned Score
            </div>
            <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
              {analysis.totalWeightedScore.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#A69A8C]">
              Total Target Weight
            </div>
            <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
              {analysis.totalWeight.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="text-xs text-[#A69A8C] space-y-2 border border-[#382920] p-4 bg-[#211A16] leading-relaxed">
          <div>
            <strong className="text-[#EAE4DC]">Proof strength per skill:</strong> Resume mention{' '}
            <span className="font-mono-tabular text-[#B86D37]">(0.20)</span>, hands-on project proof{' '}
            <span className="font-mono-tabular text-[#B86D37]">(0.50–0.70)</span>, or scored mock interview{' '}
            <span className="font-mono-tabular text-[#B86D37]">(up to 1.00)</span>.
          </div>
          <div>
            <strong className="text-[#EAE4DC]">Role importance:</strong> Required skills carry 3×
            base weight vs preferred (1×), scaled by cross-company demand.
          </div>
          <div>
            <strong className="text-[#EAE4DC]">Overall score:</strong>{' '}
            <span className="font-mono-tabular text-[#EAE4DC]">
              {analysis.totalWeightedScore.toFixed(2)} / {analysis.totalWeight.toFixed(2)} ={' '}
              {(analysis.overallReadiness * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {analysis.overallBreakdown.length === 0 ? (
          <div className="border border-[#382920] p-6 text-sm text-[#A69A8C] bg-[#1B1714]">
            Add at least one job description in Company DNA to inspect the skill-by-skill
            calculation.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#382920] bg-[#1B1714]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#382920] bg-[#211A16] text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">
                  <th className="py-3 px-3 font-medium">Skill</th>
                  <th className="py-3 px-3 font-medium">Demand</th>
                  <th className="py-3 px-3 font-medium text-right">Weight</th>
                  <th className="py-3 px-3 font-medium text-right">Strength</th>
                  <th className="py-3 px-3 font-medium text-right">Score</th>
                  <th className="py-3 px-3 font-medium">Basis</th>
                </tr>
              </thead>
              <tbody>
                {analysis.overallBreakdown.map((row) => (
                  <tr
                    key={row.skillId}
                    className="border-b border-[#382920]/70 last:border-b-0 hover:bg-[#211A16]/70"
                  >
                    <td className="py-2.5 px-3 font-medium text-[#EAE4DC]">{row.skillLabel}</td>
                    <td className="py-2.5 px-3 text-[#A69A8C] capitalize">
                      {row.maxReqLevel} ({row.companyCount} co)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular text-[#EAE4DC]">
                      {row.weight.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular text-[#B86D37]">
                      {row.strength.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular text-[#EAE4DC]">
                      {row.weightedScore.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-[#A69A8C]">{row.formulaNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
