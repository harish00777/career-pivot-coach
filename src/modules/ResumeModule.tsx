import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  FileUp,
  FolderGit2,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildClaimedRecordsFromSkills,
  useCareerStore,
} from '../context/CareerStoreContext';
import { postJson, uploadFileForParsing } from '../services/apiClient';
import type { ParsedResume, ResumeVersion } from '../shared/schemas';
import { ProvenanceText } from '../components/ProvenanceBadge';

const PARSED_GROUPS: Array<{
  title: string;
  fields: Array<{ key: keyof ParsedResume; label: string; placeholder: string }>;
}> = [
  {
    title: 'Technical Foundation',
    fields: [
      { key: 'skills', label: 'Core Skills', placeholder: 'e.g. System Design, REST APIs, CI/CD' },
      { key: 'languages', label: 'Programming Languages', placeholder: 'e.g. TypeScript, Python, SQL' },
      { key: 'frameworks', label: 'Frameworks & Libraries', placeholder: 'e.g. React, Node.js, FastAPI' },
      { key: 'tools', label: 'Tools & Platforms', placeholder: 'e.g. PostgreSQL, Docker, AWS' },
    ],
  },
  {
    title: 'Experience & Impact',
    fields: [
      {
        key: 'experience',
        label: 'Work Experience',
        placeholder: 'One role or impact highlight per line',
      },
      { key: 'projects', label: 'Projects', placeholder: 'One project summary per line' },
      { key: 'achievements', label: 'Achievements', placeholder: 'Measurable outcomes or awards' },
    ],
  },
  {
    title: 'Background',
    fields: [
      { key: 'education', label: 'Education', placeholder: 'Degrees, institutions, years' },
      { key: 'certifications', label: 'Certifications', placeholder: 'Verified credentials' },
      { key: 'leadership', label: 'Leadership & Mentorship', placeholder: 'Teams led, mentoring' },
    ],
  },
];

const ALL_PARSED_KEYS: Array<keyof ParsedResume> = [
  'skills',
  'languages',
  'frameworks',
  'tools',
  'experience',
  'projects',
  'achievements',
  'education',
  'certifications',
  'leadership',
];

interface ResumeAnalysisResult {
  strongSections: string[];
  missingInfo: string[];
  skillsWithoutEvidence: string[];
  weakOrUnquantifiedBullets: Array<{
    original: string;
    issue: string;
    clarificationQuestion: string;
    rewrittenWithFactPlaceholders: string;
  }>;
  keywordAlignmentSummary: string;
}

type GuidedStep = 1 | 2 | 3 | 4;

export function ResumeModule() {
  const { store, updateStore, setActiveModule } = useCareerStore();

  const activeResume =
    store.resumeVersions.find((r) => r.id === store.activeResumeId) ??
    store.resumeVersions[0] ??
    null;

  const [step, setStep] = useState<GuidedStep>(activeResume ? 3 : 1);
  const [label, setLabel] = useState('Primary Resume');
  const [rawText, setRawText] = useState('');
  const [uploadedMeta, setUploadedMeta] = useState<{
    name: string;
    sizeKb: number;
    chars: number;
  } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [draftFields, setDraftFields] = useState<Record<keyof ParsedResume, string>>({
    skills: '',
    languages: '',
    frameworks: '',
    tools: '',
    experience: '',
    projects: '',
    achievements: '',
    education: '',
    certifications: '',
    leadership: '',
  });
  const [showOriginalText, setShowOriginalText] = useState(false);

  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    store.targetRoles[0]?.id ?? ''
  );
  const [clarifications, setClarifications] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ResumeAnalysisResult | null>(null);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [compareLeftId, setCompareLeftId] = useState<string>(store.resumeVersions[0]?.id ?? '');
  const [compareRightId, setCompareRightId] = useState<string>(
    store.resumeVersions[1]?.id ?? store.resumeVersions[0]?.id ?? ''
  );

  useEffect(() => {
    if (!activeResume) return;
    const nextDraft = {} as Record<keyof ParsedResume, string>;
    for (const key of ALL_PARSED_KEYS) {
      nextDraft[key] = (activeResume.parsed[key] || []).join('\n');
    }
    setDraftFields(nextDraft);
  }, [activeResume?.id, activeResume?.createdAt]);

  useEffect(() => {
    if (!selectedRoleId && store.targetRoles[0]?.id) {
      setSelectedRoleId(store.targetRoles[0].id);
    }
  }, [store.targetRoles, selectedRoleId]);

  useEffect(() => {
    if (!versionsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVersionsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [versionsOpen]);

  const processSelectedFile = async (file: File) => {
    setError(null);
    setStatusMsg(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('This file is larger than the 5 MB limit. Please upload a smaller file or paste your text.');
      return;
    }
    setParsing(true);
    const res = await uploadFileForParsing(file);
    setParsing(false);
    if (!res.ok) {
      setError(res.error);
      setShowPasteBox(true);
      return;
    }
    setRawText(res.text);
    setLabel(res.fileName.replace(/\.[^/.]+$/, '') || 'Uploaded Resume');
    setUploadedMeta({
      name: res.fileName,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      chars: res.text.length,
    });
    setStatusMsg(`Loaded "${res.fileName}" (${res.text.length.toLocaleString()} characters).`);
    setStep(2);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleExtractResume = async () => {
    const textToParse = (rawText || activeResume?.rawText || '').trim();
    if (textToParse.length < 30) {
      setError('Please upload a resume file or paste at least 30 characters first.');
      setStep(1);
      return;
    }
    setError(null);
    setStatusMsg(null);
    setExtracting(true);
    const res = await postJson<{
      parsed: ParsedResume;
      fieldConfidence: Record<string, number>;
    }>('/api/ai/resume', { rawText: textToParse });
    setExtracting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const versionId = `res-${Date.now()}`;
    const versionLabel = label.trim() || `Resume v${store.resumeVersions.length + 1}`;
    const newVersion: ResumeVersion = {
      id: versionId,
      label: versionLabel,
      roleId: selectedRoleId || undefined,
      rawText: textToParse,
      parsed: res.data.parsed,
      fieldConfidence: res.data.fieldConfidence,
      userEditedFields: [],
      createdAt: new Date().toISOString(),
      provenance: 'resume',
    };

    const allSkills = [
      ...res.data.parsed.skills,
      ...res.data.parsed.languages,
      ...res.data.parsed.frameworks,
      ...res.data.parsed.tools,
    ];
    const claimedRecords = buildClaimedRecordsFromSkills(allSkills, versionLabel, 'resume');

    await updateStore(
      (prev) => {
        const nonMatchingClaimed = prev.evidenceRecords.filter(
          (ev) => !(ev.sourceType === 'resume' && ev.sourceRef === versionLabel)
        );
        return {
          ...prev,
          resumeVersions: [newVersion, ...prev.resumeVersions],
          activeResumeId: versionId,
          evidenceRecords: [...nonMatchingClaimed, ...claimedRecords],
        };
      },
      `Extracted resume "${versionLabel}"`
    );

    const nextDraft = {} as Record<keyof ParsedResume, string>;
    for (const key of ALL_PARSED_KEYS) {
      nextDraft[key] = (res.data.parsed[key] || []).join('\n');
    }
    setDraftFields(nextDraft);
    setRawText('');
    setStatusMsg(
      `Profile extracted cleanly. Found ${claimedRecords.length} claimed skills for review.`
    );
    setStep(3);
  };

  const handleSaveProfile = async () => {
    if (!activeResume) return;
    setSavingProfile(true);
    setError(null);

    const nextParsed = { ...activeResume.parsed };
    const editedFields = new Set(activeResume.userEditedFields);

    for (const key of ALL_PARSED_KEYS) {
      const nextLines = (draftFields[key] || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const prevJoined = (activeResume.parsed[key] || []).join('\n').trim();
      const nextJoined = nextLines.join('\n').trim();
      if (nextJoined !== prevJoined) {
        editedFields.add(key);
      }
      nextParsed[key] = nextLines;
    }

    const allSkills = [
      ...nextParsed.skills,
      ...nextParsed.languages,
      ...nextParsed.frameworks,
      ...nextParsed.tools,
    ];
    const updatedClaimed = buildClaimedRecordsFromSkills(
      allSkills,
      activeResume.label,
      activeResume.provenance === 'sample_demo' ? 'sample_demo' : 'resume'
    );

    await updateStore(
      (prev) => ({
        ...prev,
        resumeVersions: prev.resumeVersions.map((r) =>
          r.id === activeResume.id
            ? {
                ...r,
                parsed: nextParsed,
                userEditedFields: Array.from(editedFields),
              }
            : r
        ),
        evidenceRecords: [
          ...prev.evidenceRecords.filter(
            (ev) => !(ev.sourceType === 'resume' && ev.sourceRef === activeResume.label)
          ),
          ...updatedClaimed,
        ],
      }),
      `Saved resume edits for "${activeResume.label}"`
    );

    setSavingProfile(false);
    setStatusMsg(`Saved "${activeResume.label}" with ${updatedClaimed.length} skill claims.`);
  };

  const handleDuplicate = async (rv: ResumeVersion) => {
    const copyId = `res-${Date.now()}`;
    const copy: ResumeVersion = {
      ...rv,
      id: copyId,
      label: `${rv.label} (Copy)`,
      createdAt: new Date().toISOString(),
    };
    await updateStore((prev) => ({
      ...prev,
      resumeVersions: [copy, ...prev.resumeVersions],
      activeResumeId: copyId,
    }));
    setStatusMsg(`Created duplicate "${copy.label}".`);
  };

  const handleCommitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await updateStore((prev) => ({
      ...prev,
      resumeVersions: prev.resumeVersions.map((r) => (r.id === id ? { ...r, label: trimmed } : r)),
    }));
    setRenamingId(null);
    setRenameValue('');
    setStatusMsg(`Renamed version to "${trimmed}".`);
  };

  const handleDeleteVersion = async (id: string) => {
    await updateStore((prev) => {
      const remaining = prev.resumeVersions.filter((r) => r.id !== id);
      return {
        ...prev,
        resumeVersions: remaining,
        activeResumeId:
          prev.activeResumeId === id ? remaining[0]?.id ?? null : prev.activeResumeId,
      };
    });
  };

  const handleAnalyzeRole = async () => {
    if (!activeResume) {
      setError('Upload and extract a resume first.');
      setStep(1);
      return;
    }
    setError(null);
    setAnalyzing(true);
    const role = store.targetRoles.find((r) => r.id === selectedRoleId);
    const company = role ? store.companies.find((c) => c.id === role.companyId) : undefined;
    const jds = store.jobDescriptions.filter((j) => j.targetRoleId === selectedRoleId);
    const jdReqs = jds.flatMap((j) => j.requirements);

    const res = await postJson<ResumeAnalysisResult>('/api/ai/resume-analyze', {
      resume: activeResume,
      targetRoleTitle: role?.title,
      companyName: company?.name,
      jdRequirements: jdReqs,
      userClarifications: clarifications,
    });
    setAnalyzing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAnalysisResult(res.data);
  };

  const leftCompare = store.resumeVersions.find((r) => r.id === compareLeftId);
  const rightCompare = store.resumeVersions.find((r) => r.id === compareRightId);

  const steps: Array<{ n: GuidedStep; label: string; enabled: boolean }> = [
    { n: 1, label: '01 · Upload Resume', enabled: true },
    { n: 2, label: '02 · Extract Profile', enabled: Boolean(rawText.trim() || activeResume) },
    { n: 3, label: '03 · Review & Edit', enabled: Boolean(activeResume) },
    { n: 4, label: '04 · Role Alignment', enabled: Boolean(activeResume) },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div className="space-y-1 max-w-2xl">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37]">
            Baseline Intelligence Intake
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Resume Intelligence
          </h2>
          <p className="text-sm text-[#A69A8C]">
            Upload your resume, edit extracted capabilities cleanly, and inspect alignment against your target roles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeResume && (
            <span className="text-xs text-[#A69A8C] px-3 py-1.5 bg-[#1B1714] border border-[#382920]">
              Active: <strong className="text-[#EAE4DC]">{activeResume.label}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => setVersionsOpen(true)}
            className="arch-btn-secondary px-3.5 py-2"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#B86D37]" />
            <span>Versions ({store.resumeVersions.length})</span>
          </button>
        </div>
      </section>

      <nav aria-label="Resume workflow steps" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {steps.map((st) => {
          const isCurrent = step === st.n;
          const isComplete =
            (st.n === 1 && (Boolean(rawText.trim()) || Boolean(activeResume))) ||
            (st.n === 2 && Boolean(activeResume)) ||
            (st.n === 3 && Boolean(activeResume && step > 3)) ||
            (st.n === 4 && Boolean(analysisResult));

          return (
            <button
              key={st.n}
              type="button"
              disabled={!st.enabled}
              onClick={() => setStep(st.n)}
              className={`px-3.5 py-2.5 border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                isCurrent
                  ? 'bg-[#211A16] border-[#B86D37] text-[#EAE4DC] font-medium'
                  : st.enabled
                    ? 'bg-[#1B1714] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                    : 'bg-[#12100F] border-[#382920]/50 text-[#A69A8C]/40'
              }`}
            >
              <span className="truncate">{st.label}</span>
              {isComplete && !isCurrent && (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B86D37] shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {error && (
        <div
          role="alert"
          className="p-4 border-l-2 border-[#B86D37] bg-[#211A16] text-xs text-[#EAE4DC] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#B86D37]" />
            <span className="leading-relaxed">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[#B86D37] hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {statusMsg && !error && (
        <div
          role="status"
          className="p-3.5 border-l-2 border-[#B86D37] bg-[#1B1714] text-xs text-[#EAE4DC] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-[#B86D37] shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {step === 1 && (
        <section className="arch-panel p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Step 1 · Upload your resume
            </h3>
            <p className="text-xs text-[#A69A8C]">
              Supports PDF, DOCX, and TXT files up to 5 MB. Resume skills start as claimed baseline
              records until evidenced by projects or interviews.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) await processSelectedFile(f);
            }}
            className={`border border-dashed p-8 text-center transition-colors ${
              dragActive
                ? 'border-[#B86D37] bg-[#211A16]'
                : 'border-[#382920] bg-[#12100F] hover:border-[#B86D37]/60'
            }`}
          >
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-10 h-10 bg-[#211A16] border border-[#382920] mx-auto flex items-center justify-center">
                {parsing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#B86D37]" />
                ) : (
                  <FileUp className="w-5 h-5 text-[#B86D37]" />
                )}
              </div>
              <div className="text-sm font-medium text-[#EAE4DC]">
                {parsing
                  ? 'Reading your document...'
                  : 'Drag and drop your resume here, or browse'}
              </div>
              <p className="text-xs text-[#A69A8C]">PDF, DOCX, TXT, or Markdown · Max 5 MB</p>
              <label className="arch-btn-primary px-5 py-2.5 cursor-pointer inline-flex">
                <span>Choose file</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileInput}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {uploadedMeta && (
            <div className="p-3.5 bg-[#211A16] border border-[#B86D37]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#EAE4DC]">
                <FileText className="w-4 h-4 text-[#B86D37]" />
                <span className="font-medium">{uploadedMeta.name}</span>
                <span className="font-mono-tabular text-[#A69A8C]">
                  ({uploadedMeta.sizeKb} KB · {uploadedMeta.chars.toLocaleString()} chars)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-[#B86D37] hover:underline inline-flex items-center gap-1"
              >
                <span>Continue to extraction</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-[#382920]">
            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="text-xs text-[#A69A8C] hover:text-[#B86D37] underline"
            >
              {showPasteBox ? 'Hide manual text paste' : 'Or paste resume text manually'}
            </button>

            {(showPasteBox || rawText.length > 0) && (
              <div className="space-y-3 pt-1">
                <div>
                  <label htmlFor="res-label" className="block text-[11px] uppercase tracking-[0.14em] text-[#A69A8C] mb-1">
                    Resume version name
                  </label>
                  <input
                    id="res-label"
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="arch-input max-w-sm px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="res-raw" className="block text-[11px] uppercase tracking-[0.14em] text-[#A69A8C] mb-1">
                    Resume text
                  </label>
                  <textarea
                    id="res-raw"
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste your full resume text here..."
                    className="arch-input px-3.5 py-2.5 text-xs font-mono-tabular"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={rawText.trim().length < 30}
                    onClick={() => setStep(2)}
                    className="arch-btn-primary px-5 py-2.5"
                  >
                    <span>Continue to extraction</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="arch-panel p-6 sm:p-8 space-y-5">
          <div className="space-y-1">
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Step 2 · Extract structured profile
            </h3>
            <p className="text-xs text-[#A69A8C]">
              Text is extracted verbatim—unlisted categories stay blank rather than assumed.
            </p>
          </div>

          <div className="p-4 bg-[#12100F] border border-[#382920] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#EAE4DC]">
                Version label:{' '}
                <input
                  type="text"
                  aria-label="Version label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="arch-input inline-block w-auto ml-1.5 px-2.5 py-1 text-xs"
                />
              </span>
              <span className="font-mono-tabular text-[#A69A8C]">
                {(rawText || activeResume?.rawText || '').length.toLocaleString()} characters ready
              </span>
            </div>
            <pre className="whitespace-pre-wrap text-xs font-mono-tabular text-[#A69A8C] bg-[#1B1714] border border-[#382920] p-3.5 max-h-48 overflow-y-auto leading-relaxed">
              {(rawText || activeResume?.rawText || '').slice(0, 2500)}
              {(rawText || activeResume?.rawText || '').length > 2500 ? '\n…' : ''}
            </pre>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="arch-btn-secondary px-4 py-2"
            >
              Back to upload
            </button>
            <button
              type="button"
              disabled={extracting}
              onClick={handleExtractResume}
              className="arch-btn-primary px-5 py-2.5"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#B86D37]" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#B86D37]" />
              )}
              <span>{extracting ? 'Analysing resume...' : 'Analyse Resume'}</span>
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-6">
          {!activeResume ? (
            <div className="arch-panel p-8 text-center space-y-3">
              <p className="text-sm text-[#A69A8C]">
                No extracted profile saved yet. Upload and analyse a resume to inspect and edit fields.
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="arch-btn-primary px-4 py-2.5"
              >
                Go to Step 1
              </button>
            </div>
          ) : (
            <div className="arch-panel p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#382920] pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                      Step 3 · Review & edit profile
                    </h3>
                    <ProvenanceText
                      tag={activeResume.provenance}
                      date={activeResume.createdAt.slice(0, 10)}
                    />
                  </div>
                  <p className="text-xs text-[#A69A8C]">
                    One entry per line. Saving updates your skill claims across Gap Explorer and Company DNA.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOriginalText((v) => !v)}
                    className="arch-btn-secondary px-3 py-2"
                  >
                    {showOriginalText ? 'Hide original text' : 'View original text'}
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={handleSaveProfile}
                    className="arch-btn-secondary px-4 py-2"
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSaveProfile();
                      setStep(4);
                    }}
                    className="arch-btn-primary px-4 py-2"
                  >
                    <span>Analyse Against Role</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
                  </button>
                </div>
              </div>

              {showOriginalText && (
                <div className="p-4 bg-[#12100F] border border-[#382920] space-y-2">
                  <div className="text-xs font-medium text-[#EAE4DC]">Original Resume Text</div>
                  <pre className="whitespace-pre-wrap text-xs font-mono-tabular text-[#A69A8C] max-h-56 overflow-y-auto leading-relaxed">
                    {activeResume.rawText}
                  </pre>
                </div>
              )}

              <div className="space-y-6">
                {PARSED_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <h4 className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                      {group.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {group.fields.map(({ key, label: fieldLabel, placeholder }) => {
                        const conf = activeResume.fieldConfidence[key] ?? 0;
                        const edited = activeResume.userEditedFields.includes(key);
                        return (
                          <div
                            key={key}
                            className="p-3.5 bg-[#12100F] border border-[#382920] space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <label htmlFor={`field-${key}`} className="font-medium text-[#EAE4DC]">
                                {fieldLabel}
                              </label>
                              <span className="font-mono-tabular text-[11px] text-[#A69A8C]">
                                {edited ? 'Edited' : `${Math.round(conf * 100)}% confidence`}
                              </span>
                            </div>
                            <textarea
                              id={`field-${key}`}
                              rows={3}
                              value={draftFields[key] ?? ''}
                              onChange={(e) =>
                                setDraftFields((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder={placeholder}
                              className="arch-input px-3 py-2 text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="arch-panel p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-5">
            <div className="space-y-1">
              <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                Step 4 · Role alignment check
              </h3>
              <p className="text-xs text-[#A69A8C]">
                Suggestions never invent numbers—missing outcomes appear as factual clarification questions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Target role for analysis"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="arch-input px-3 py-2 text-xs w-auto"
              >
                <option value="">General evaluation (all roles)</option>
                {store.targetRoles.map((r) => {
                  const co = store.companies.find((c) => c.id === r.companyId);
                  return (
                    <option key={r.id} value={r.id}>
                      {co?.name ? `${co.name} — ${r.title}` : r.title}
                    </option>
                  );
                })}
              </select>
              {store.targetRoles.length === 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModule('company-dna')}
                  className="arch-btn-secondary px-3 py-2"
                >
                  + Add target role
                </button>
              )}
              <button
                type="button"
                disabled={analyzing || !activeResume}
                onClick={handleAnalyzeRole}
                className="arch-btn-primary px-4 py-2"
              >
                {analyzing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />}
                <span>{analyzing ? 'Analysing...' : 'Analyse for Target Role'}</span>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="res-clarifications"
              className="block text-[11px] uppercase tracking-[0.14em] text-[#A69A8C] mb-1.5"
            >
              Add real metrics or context (optional)
            </label>
            <textarea
              id="res-clarifications"
              rows={2}
              value={clarifications}
              onChange={(e) => setClarifications(e.target.value)}
              placeholder="e.g. Reduced p95 latency from 180ms to 42ms; mentored 2 junior engineers."
              className="arch-input px-3.5 py-2.5 text-xs"
            />
          </div>

          {analysisResult && (
            <div className="space-y-6">
              <div className="p-4 bg-[#12100F] border border-[#382920] text-sm text-[#EAE4DC] leading-relaxed">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37] mb-1">
                  Role Alignment Summary
                </div>
                {analysisResult.keywordAlignmentSummary}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-[#211A16] border border-[#B86D37]/40 space-y-2">
                  <h4 className="text-xs font-medium text-[#B86D37]">Strong Sections</h4>
                  <ul className="space-y-1.5 text-xs text-[#EAE4DC]/85 list-disc pl-4">
                    {analysisResult.strongSections.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 bg-[#12100F] border border-[#382920] space-y-2">
                  <h4 className="text-xs font-medium text-[#EAE4DC]">Missing Information</h4>
                  <ul className="space-y-1.5 text-xs text-[#A69A8C] list-disc pl-4">
                    {analysisResult.missingInfo.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 bg-[#12100F] border border-[#B86D37]/30 space-y-2">
                  <h4 className="text-xs font-medium text-[#EAE4DC]">Skills Needing Proof</h4>
                  <ul className="space-y-1.5 text-xs text-[#A69A8C] list-disc pl-4">
                    {analysisResult.skillsWithoutEvidence.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {analysisResult.weakOrUnquantifiedBullets.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-editorial text-xl text-[#EAE4DC]">
                    Bullets You Can Strengthen
                  </h4>
                  <div className="space-y-3">
                    {analysisResult.weakOrUnquantifiedBullets.map((b, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-[#12100F] border border-[#382920] space-y-2 text-xs"
                      >
                        <div className="text-[#A69A8C]">
                          <strong className="text-[#EAE4DC]">Current bullet:</strong> {b.original}
                        </div>
                        <div className="text-[#B86D37]">What is missing: {b.issue}</div>
                        <div className="text-[#EAE4DC]">
                          <strong>Clarification prompt:</strong> {b.clarificationQuestion}
                        </div>
                        <div className="p-3 bg-[#1B1714] border border-[#382920] text-[#EAE4DC]">
                          <strong>Suggested draft:</strong> {b.rewrittenWithFactPlaceholders}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#382920]">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="arch-btn-secondary px-4 py-2"
                >
                  Improve Resume Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule('portfolio')}
                  className="arch-btn-primary px-4 py-2"
                >
                  <FolderGit2 className="w-3.5 h-3.5 text-[#B86D37]" />
                  <span>Add Proof in Portfolio Studio</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {versionsOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#12100F]/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="versions-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVersionsOpen(false);
          }}
        >
          <div className="w-full max-w-xl bg-[#12100F] border-l border-[#382920] h-full overflow-y-auto p-6 sm:p-8 space-y-6 text-[#EAE4DC] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#382920] pb-4">
              <div>
                <h3
                  id="versions-drawer-title"
                  className="font-editorial text-2xl font-light text-[#EAE4DC]"
                >
                  Manage Resume Versions
                </h3>
                <p className="text-xs text-[#A69A8C] mt-1">
                  Switch active resume, rename inline, duplicate, or compare two versions side by side.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVersionsOpen(false)}
                aria-label="Close resume versions drawer"
                className="p-2 border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#B86D37]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {store.resumeVersions.length === 0 ? (
              <div className="p-5 bg-[#1B1714] border border-[#382920] text-xs text-[#A69A8C]">
                No resume versions saved yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {store.resumeVersions.map((rv) => {
                  const isActive = rv.id === activeResume?.id;
                  const isRenaming = renamingId === rv.id;
                  return (
                    <div
                      key={rv.id}
                      className={`p-3.5 border flex flex-wrap items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-[#211A16] border-[#B86D37]/60'
                          : 'bg-[#1B1714] border-[#382920]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCommitRename(rv.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              aria-label="New version label"
                              autoFocus
                              className="arch-input px-2.5 py-1 text-xs max-w-[220px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleCommitRename(rv.id)}
                              className="arch-btn-primary px-2.5 py-1"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm font-medium text-[#EAE4DC] truncate">
                              {rv.label}
                            </div>
                            <div className="text-[11px] text-[#A69A8C] font-mono-tabular">
                              {rv.createdAt.slice(0, 10)} · {rv.parsed.skills.length} skills
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() =>
                              updateStore((prev) => ({ ...prev, activeResumeId: rv.id }))
                            }
                            className="arch-btn-secondary px-2.5 py-1"
                          >
                            Use
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(rv.id);
                            setRenameValue(rv.label);
                          }}
                          aria-label={`Rename ${rv.label}`}
                          className="p-1.5 border border-[#382920] bg-[#12100F] text-[#A69A8C] hover:text-[#EAE4DC]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(rv)}
                          aria-label={`Duplicate ${rv.label}`}
                          className="p-1.5 border border-[#382920] bg-[#12100F] text-[#A69A8C] hover:text-[#EAE4DC]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVersion(rv.id)}
                          aria-label={`Delete ${rv.label}`}
                          className="p-1.5 border border-[#382920] bg-[#12100F] text-[#A69A8C] hover:text-[#B86D37]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {store.resumeVersions.length >= 2 && (
              <div className="pt-4 border-t border-[#382920] space-y-4">
                <h4 className="font-editorial text-xl text-[#EAE4DC]">Compare Two Versions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: compareLeftId, setId: setCompareLeftId, doc: leftCompare },
                    { id: compareRightId, setId: setCompareRightId, doc: rightCompare },
                  ].map((side, idx) => (
                    <div key={idx} className="p-3.5 bg-[#1B1714] border border-[#382920] space-y-3">
                      <select
                        aria-label={`Select version ${idx + 1}`}
                        value={side.id}
                        onChange={(e) => side.setId(e.target.value)}
                        className="arch-input px-2.5 py-1.5 text-xs"
                      >
                        {store.resumeVersions.map((rv) => (
                          <option key={rv.id} value={rv.id}>
                            {rv.label}
                          </option>
                        ))}
                      </select>
                      {side.doc && (
                        <div className="space-y-2.5 text-xs">
                          <div>
                            <div className="text-[#B86D37] font-medium mb-1">
                              Core Skills ({side.doc.parsed.skills.length})
                            </div>
                            <div className="text-[#EAE4DC]">
                              {side.doc.parsed.skills.join(' · ') || 'None listed'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#B86D37] font-medium mb-1">
                              Experience ({side.doc.parsed.experience.length})
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-[#A69A8C]">
                              {side.doc.parsed.experience.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
