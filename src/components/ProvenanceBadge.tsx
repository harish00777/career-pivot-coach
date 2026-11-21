import type { ProvenanceTag } from '../shared/schemas';

const LABELS: Record<ProvenanceTag, string> = {
  resume: 'From resume',
  candidate: 'Your entry',
  uploaded_jd: 'Uploaded job description',
  public_jd: 'Job posting',
  project_evidence: 'Project proof',
  interview: 'Mock interview',
  application: 'Application log',
  ai_inference: 'AI synthesis',
  sample_demo: 'Demo sample',
};

export function ProvenanceText({
  tag,
  date,
  className = '',
}: {
  tag: ProvenanceTag;
  date?: string;
  className?: string;
}) {
  const isInferred = tag === 'ai_inference';
  const isDemo = tag === 'sample_demo';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
        isDemo
          ? 'text-[#B86D37]'
          : isInferred
            ? 'text-[#A69A8C] italic'
            : 'text-[#A69A8C]'
      } ${className}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
          isDemo ? 'bg-[#B86D37]' : isInferred ? 'bg-[#A69A8C]/60' : 'bg-[#B86D37]'
        }`}
        aria-hidden="true"
      />
      <span>{LABELS[tag]}</span>
      {date ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">{date}</span>
        </>
      ) : null}
    </span>
  );
}
