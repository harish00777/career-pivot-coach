import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, FileUp, Globe, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson, uploadFileForParsing } from '../services/apiClient';
import { jdSourceLabel, type MatrixCell } from '../shared/evidenceEngine';
import type { CompanyCategory, JobDescription, Requirement } from '../shared/schemas';
import { ProvenanceText } from '../components/ProvenanceBadge';

export function CompanyDnaModule() {
  const {
    store,
    updateStore,
    matrix,
    analysis,
    setReadinessDrawerOpen,
    setPrepPreset,
    setActiveModule,
  } = useCareerStore();
  const [activeTab, setActiveTab] = useState<'intake' | 'compare' | 'match'>('intake');

  const [companyName, setCompanyName] = useState('');
  const [companyCategory, setCompanyCategory] = useState<CompanyCategory>('startup');
  const [roleTitle, setRoleTitle] = useState('');

  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    store.targetRoles[0]?.id ?? ''
  );
  const [intakeMode, setIntakeMode] = useState<'url' | 'paste' | 'upload'>('url');
  const [jdUrl, setJdUrl] = useState('');
  const [jdText, setJdText] = useState('');
  const [jdSourceType, setJdSourceType] = useState<'url' | 'pasted' | 'uploaded'>('pasted');
  const [fetchedUrlRef, setFetchedUrlRef] = useState<string | undefined>(undefined);
  const [uploadedFileName, setUploadedFileName] = useState<string | undefined>(undefined);

  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [narratingDna, setNarratingDna] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedCell, setSelectedCell] = useState<{
    skillLabel: string;
    companyName: string;
    cell: MatrixCell;
  } | null>(null);

  useEffect(() => {
    if (!selectedRoleId && store.targetRoles[0]?.id) {
      setSelectedRoleId(store.targetRoles[0].id);
    }
  }, [selectedRoleId, store.targetRoles]);

  useEffect(() => {
    if (!selectedCell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCell(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCell]);

  const handleAddCompanyRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !roleTitle.trim()) {
      setError('Enter both a company name and target role title.');
      return;
    }
    if (store.companies.length >= 5) {
      setError('You can compare up to 5 companies at a time. Remove one before adding another.');
      return;
    }
    setError(null);
    const cid = `co-${Date.now()}`;
    const rid = `role-${Date.now()}`;
    await updateStore((prev) => ({
      ...prev,
      companies: [
        ...prev.companies,
        { id: cid, name: companyName.trim(), category: companyCategory, provenance: 'candidate' },
      ],
      targetRoles: [
        ...prev.targetRoles,
        { id: rid, companyId: cid, title: roleTitle.trim(), provenance: 'candidate' },
      ],
      profile: prev.profile
        ? { ...prev.profile, targetRoleIds: [...prev.profile.targetRoleIds, rid] }
        : prev.profile,
    }));
    setSelectedRoleId(rid);
    setCompanyName('');
    setRoleTitle('');
    setNotice(`Added ${companyName.trim()} — ${roleTitle.trim()}. Now add its job description below.`);
  };

  const handleRemoveCompany = async (companyId: string) => {
    const roleIds = new Set(
      store.targetRoles.filter((r) => r.companyId === companyId).map((r) => r.id)
    );
    await updateStore((prev) => ({
      ...prev,
      companies: prev.companies.filter((c) => c.id !== companyId),
      targetRoles: prev.targetRoles.filter((r) => r.companyId !== companyId),
      jobDescriptions: prev.jobDescriptions.filter((j) => !roleIds.has(j.targetRoleId)),
    }));
    if (roleIds.has(selectedRoleId)) {
      const remaining = store.targetRoles.find((r) => r.companyId !== companyId);
      setSelectedRoleId(remaining?.id ?? '');
    }
  };

  const handleFetchUrl = async () => {
    if (!jdUrl.trim()) {
      setError('Enter a job posting URL.');
      return;
    }
    setError(null);
    setNotice(null);
    setFetchingUrl(true);

    const res = await postJson<{ status: string; url: string; text: string }>(
      '/api/fetch-jd',
      { url: jdUrl.trim() },
      25_000
    );
    setFetchingUrl(false);

    if (!res.ok) {
      setError(res.error || 'Could not retrieve this page. Please paste the job text below.');
      setIntakeMode('paste');
      setJdSourceType('pasted');
      return;
    }

    setJdText(res.data.text);
    setJdSourceType('url');
    setFetchedUrlRef(res.data.url);
    setNotice('Retrieved readable text from the job posting. Review and extract requirements below.');
  };

  const handleUploadJdFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    const res = await uploadFileForParsing(file);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setJdText(res.text);
    setJdSourceType('uploaded');
    setUploadedFileName(res.fileName);
    setNotice(`Loaded ${res.text.length} characters from ${res.fileName}. Click "Extract Requirements" below.`);
  };

  const handleExtractJd = async () => {
    const role = store.targetRoles.find((r) => r.id === selectedRoleId);
    if (!role) {
      setError('Select a target company and role first.');
      return;
    }
    if (jdText.trim().length < 40) {
      setError('Provide at least 40 characters of job description text.');
      return;
    }
    const company = store.companies.find((c) => c.id === role.companyId);
    setError(null);
    setNotice(null);
    setExtractingJd(true);

    const res = await postJson<{
      location: string;
      experience: string;
      education: string;
      responsibilities: string[];
      behavioural: string[];
      requirements: Requirement[];
    }>('/api/ai/jd', {
      rawText: jdText,
      companyName: company?.name,
      roleTitle: role.title,
    });
    setExtractingJd(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const newJd: JobDescription = {
      id: `jd-${Date.now()}`,
      targetRoleId: role.id,
      source: {
        type: jdSourceType,
        url: jdSourceType === 'url' ? fetchedUrlRef : undefined,
        fileName: jdSourceType === 'uploaded' ? uploadedFileName : undefined,
        fetchedAt: new Date().toISOString().slice(0, 10),
        status: 'ok',
      },
      rawText: jdText,
      location: res.data.location,
      experience: res.data.experience,
      education: res.data.education,
      responsibilities: res.data.responsibilities,
      behavioural: res.data.behavioural,
      requirements: res.data.requirements,
      provenance:
        jdSourceType === 'url'
          ? 'public_jd'
          : jdSourceType === 'uploaded'
            ? 'uploaded_jd'
            : 'candidate',
    };

    await updateStore(
      (prev) => ({
        ...prev,
        jobDescriptions: [newJd, ...prev.jobDescriptions],
      }),
      `Extracted JD for ${company?.name ?? ''} — ${role.title}`
    );

    setJdText('');
    setJdUrl('');
    setNotice(
      `Extracted ${newJd.requirements.length} requirements with supporting quotes for ${company?.name} — ${role.title}.`
    );
  };

  const handleNarrateCompanyDna = async () => {
    setError(null);
    setNarratingDna(true);
    const res = await postJson<{ narrative: string; differentiators: string[] }>(
      '/api/ai/company-dna',
      {
        matrixSummary: {
          companies: matrix.companies,
          commonSkills: matrix.commonSkills,
          uniqueSkillsByCompany: matrix.uniqueSkillsByCompany,
          experienceDifferences: matrix.experienceDifferences,
          responsibilityComparison: matrix.responsibilityComparison,
          topFrequencyRows: matrix.rows.slice(0, 15).map((r) => ({
            skill: r.skillLabel,
            companyCount: r.companyCount,
            requiredCount: r.requiredCount,
            preferredCount: r.preferredCount,
          })),
        },
      }
    );
    setNarratingDna(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const text = `${res.data.narrative}\n\nKey differentiators:\n• ${res.data.differentiators.join('\n• ')}`;
    await updateStore((prev) => ({ ...prev, companyDnaNarrative: text }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
            Cross-Company Requirements Architecture
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Company DNA
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1">
            Extract verbatim job posting requirements and compare expectations across target organisations.
          </p>
        </div>

        <div className="text-xs text-[#A69A8C] font-mono-tabular">
          {store.companies.length} / 5 companies · {store.jobDescriptions.length} job posting
          {store.jobDescriptions.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-[#382920] gap-1">
        {(
          [
            { id: 'intake', label: 'Companies & Job Descriptions' },
            { id: 'compare', label: 'Cross-Company Matrix' },
            { id: 'match', label: 'Company Match Breakdown' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-3 text-[11px] tracking-[0.14em] uppercase border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-[#B86D37] text-[#EAE4DC] bg-[#1B1714]'
                : 'border-transparent text-[#A69A8C] hover:text-[#EAE4DC]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 border-l-2 border-[#B86D37] bg-[#211A16] text-xs text-[#EAE4DC] flex items-center justify-between gap-4"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-[#B86D37] underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="p-3.5 border-l-2 border-[#B86D37] bg-[#1B1714] text-xs text-[#EAE4DC]">
          {notice}
        </div>
      )}

      {activeTab === 'intake' && (
        <div className="space-y-6">
          <section className="arch-panel p-6 space-y-4">
            <div>
              <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                Target Companies & Roles
              </h3>
              <p className="text-xs text-[#A69A8C] mt-0.5">
                Add 2–5 companies so RolexIQ separates shared role mastery from company-specific focus.
              </p>
            </div>

            <form
              onSubmit={handleAddCompanyRole}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label htmlFor="dna-co" className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Company name
                </label>
                <input
                  id="dna-co"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Stripe"
                  className="arch-input px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="dna-role" className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Target role title
                </label>
                <input
                  id="dna-role"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Backend Engineer"
                  className="arch-input px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="dna-cat" className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Company stage
                </label>
                <select
                  id="dna-cat"
                  value={companyCategory}
                  onChange={(e) => setCompanyCategory(e.target.value as CompanyCategory)}
                  className="arch-input px-3 py-2 text-sm"
                >
                  <option value="startup">Startup</option>
                  <option value="bigtech">Big Tech</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button type="submit" className="arch-btn-primary px-4 py-2 h-[38px]">
                <Plus className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>Add Company</span>
              </button>
            </form>

            {store.companies.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-[#382920]">
                {store.companies.map((c) => {
                  const role = store.targetRoles.find((r) => r.companyId === c.id);
                  return (
                    <div
                      key={c.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#12100F] border border-[#382920] text-xs text-[#EAE4DC]"
                    >
                      <span className="font-medium">{c.name}</span>
                      {role && <span className="text-[#A69A8C]">— {role.title}</span>}
                      <button
                        type="button"
                        onClick={() => handleRemoveCompany(c.id)}
                        aria-label={`Remove ${c.name}`}
                        className="text-[#A69A8C] hover:text-[#B86D37] ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="arch-panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Add a Job Description
                </h3>
                <p className="text-xs text-[#A69A8C] mt-0.5">
                  Every requirement preserves the exact posting quote so priorities remain grounded.
                </p>
              </div>
              <select
                aria-label="Target company and role for job description"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="arch-input px-3 py-2 text-xs w-auto"
              >
                <option value="">Select company & role...</option>
                {store.targetRoles.map((r) => {
                  const co = store.companies.find((c) => c.id === r.companyId);
                  return (
                    <option key={r.id} value={r.id}>
                      {co?.name} — {r.title}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#382920] pb-3">
              {(
                [
                  { id: 'url', label: 'Import from URL' },
                  { id: 'paste', label: 'Paste Job Text' },
                  { id: 'upload', label: 'Upload PDF / DOCX / TXT' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setIntakeMode(m.id);
                    if (m.id === 'paste') setJdSourceType('pasted');
                  }}
                  className={`px-3 py-1.5 text-xs border transition-colors ${
                    intakeMode === m.id
                      ? 'bg-[#211A16] border-[#B86D37] text-[#EAE4DC]'
                      : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {intakeMode === 'url' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/..."
                  aria-label="Job description URL"
                  className="arch-input flex-1 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={fetchingUrl}
                  onClick={handleFetchUrl}
                  className="arch-btn-secondary px-4 py-2"
                >
                  {fetchingUrl ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-[#B86D37]" />
                  )}
                  <span>{fetchingUrl ? 'Fetching...' : 'Retrieve Page'}</span>
                </button>
              </div>
            )}

            {intakeMode === 'upload' && (
              <div>
                <label className="arch-btn-secondary px-4 py-2.5 cursor-pointer inline-flex">
                  <FileUp className="w-3.5 h-3.5 text-[#B86D37]" />
                  <span>Choose JD file (PDF / DOCX / TXT)</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={handleUploadJdFile}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            <div>
              <label htmlFor="jd-text-box" className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                Job description text (editable before extraction)
              </label>
              <textarea
                id="jd-text-box"
                rows={6}
                value={jdText}
                onChange={(e) => {
                  setJdText(e.target.value);
                  if (intakeMode === 'paste') setJdSourceType('pasted');
                }}
                placeholder="Paste the complete job description text here..."
                className="arch-input px-3.5 py-2.5 text-xs font-mono-tabular"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={extractingJd}
                onClick={handleExtractJd}
                className="arch-btn-primary px-5 py-2.5"
              >
                {extractingJd && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />}
                <span>{extractingJd ? 'Extracting requirements...' : 'Extract Requirements'}</span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Extracted Job Descriptions
            </h3>
            {store.jobDescriptions.length === 0 ? (
              <div className="arch-panel p-6 text-xs text-[#A69A8C]">
                No job descriptions extracted yet. Add a company and role above, then import from URL,
                upload a file, or paste the job text.
              </div>
            ) : (
              store.jobDescriptions.map((jd) => {
                const role = store.targetRoles.find((r) => r.id === jd.targetRoleId);
                const co = role ? store.companies.find((c) => c.id === role.companyId) : undefined;
                return (
                  <div key={jd.id} className="arch-panel p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#382920] pb-3">
                      <div>
                        <div className="font-editorial text-xl text-[#EAE4DC]">
                          {co?.name} — {role?.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#A69A8C] mt-1">
                          <span>{jdSourceLabel(jd.source.type)}</span>
                          <span aria-hidden="true">·</span>
                          <ProvenanceText tag={jd.provenance} date={jd.source.fetchedAt} />
                          {jd.location && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{jd.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateStore(
                            (prev) => ({
                              ...prev,
                              jobDescriptions: prev.jobDescriptions.filter((j) => j.id !== jd.id),
                            }),
                            'Removed job description'
                          )
                        }
                        aria-label={`Delete JD for ${co?.name} ${role?.title}`}
                        className="p-2 border border-[#382920] text-[#A69A8C] hover:text-[#B86D37] hover:border-[#B86D37] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#382920] text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">
                            <th className="py-2 pr-3 font-medium">Skill</th>
                            <th className="py-2 pr-3 font-medium">Category</th>
                            <th className="py-2 pr-3 font-medium">Priority</th>
                            <th className="py-2 pr-3 font-medium">Basis</th>
                            <th className="py-2 font-medium">Supporting Quote</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jd.requirements.map((reqItem) => (
                            <tr key={reqItem.id} className="border-b border-[#382920]/60 last:border-b-0">
                              <td className="py-2.5 pr-3 font-medium text-[#EAE4DC]">
                                {reqItem.skill}
                              </td>
                              <td className="py-2.5 pr-3 text-[#A69A8C] capitalize">
                                {reqItem.category}
                              </td>
                              <td className="py-2.5 pr-3">
                                <span
                                  className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] border ${
                                    reqItem.level === 'required'
                                      ? 'border-[#B86D37] bg-[#211A16] text-[#B86D37]'
                                      : 'border-[#382920] bg-[#12100F] text-[#A69A8C]'
                                  }`}
                                >
                                  {reqItem.level}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-[#A69A8C]">
                                {reqItem.basis === 'explicit' ? 'Direct quote' : 'Interpreted'}
                              </td>
                              <td className="py-2.5 text-[#A69A8C] italic">“{reqItem.quote}”</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="space-y-6">
          <section className="arch-panel p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Cross-Company Requirement Matrix
                </h3>
                <p className="text-xs text-[#A69A8C] mt-0.5">
                  Click any Required or Preferred cell to inspect the verbatim job posting quote.
                </p>
              </div>
              {matrix.companies.length >= 2 && (
                <button
                  type="button"
                  disabled={narratingDna}
                  onClick={handleNarrateCompanyDna}
                  className="arch-btn-primary px-4 py-2"
                >
                  {narratingDna ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
                  )}
                  <span>{narratingDna ? 'Comparing roles...' : 'Synthesize Role Differences'}</span>
                </button>
              )}
            </div>

            {store.companyDnaNarrative && (
              <div className="p-4 bg-[#12100F] border border-[#B86D37]/40 text-xs text-[#EAE4DC] whitespace-pre-line leading-relaxed space-y-1.5">
                <div>
                  <ProvenanceText tag="ai_inference" />
                </div>
                <div>{store.companyDnaNarrative}</div>
              </div>
            )}

            {matrix.companies.length === 0 ? (
              <p className="text-xs text-[#A69A8C]">
                Extract job descriptions for 2–5 companies to compare expectations side by side.
              </p>
            ) : (
              <div className="overflow-x-auto border border-[#382920]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#382920] bg-[#211A16] text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">
                      <th className="py-2.5 px-3 font-medium">Skill</th>
                      <th className="py-2.5 px-3 font-medium">Demand</th>
                      {matrix.companies.map((c) => (
                        <th key={c.id} className="py-2.5 px-3 font-medium text-[#EAE4DC]">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr
                        key={row.skillId}
                        className="border-b border-[#382920]/70 last:border-b-0 bg-[#1B1714] hover:bg-[#211A16]/70 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium text-[#EAE4DC]">{row.skillLabel}</td>
                        <td className="py-2.5 px-3 font-mono-tabular text-[#A69A8C]">
                          {row.companyCount}/{matrix.companies.length}
                        </td>
                        {matrix.companies.map((c) => {
                          const cell = row.cells[c.id];
                          if (!cell || cell.status === 'absent') {
                            return (
                              <td key={c.id} className="py-2.5 px-3 text-[#A69A8C]/40">
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={c.id} className="py-2.5 px-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCell({
                                    skillLabel: row.skillLabel,
                                    companyName: c.name,
                                    cell,
                                  })
                                }
                                className={`underline text-left font-medium ${
                                  cell.status === 'required'
                                    ? 'text-[#B86D37]'
                                    : 'text-[#A69A8C] hover:text-[#EAE4DC]'
                                }`}
                              >
                                {cell.status === 'required' ? 'Required' : 'Preferred'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {matrix.companies.length >= 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 bg-[#12100F] border border-[#382920] space-y-1.5 text-xs">
                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                    Shared Across All Roles
                  </div>
                  <div className="text-[#EAE4DC] leading-relaxed">
                    {matrix.commonSkills.length > 0
                      ? matrix.commonSkills.join(' · ')
                      : 'No single skill is shared across all selected companies yet.'}
                  </div>
                </div>
                <div className="p-4 bg-[#12100F] border border-[#382920] space-y-1.5 text-xs">
                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                    Unique Skills by Company
                  </div>
                  <div className="space-y-1 text-[#A69A8C]">
                    {matrix.companies.map((c) => (
                      <div key={c.id}>
                        <strong className="text-[#EAE4DC]">{c.name}:</strong>{' '}
                        {matrix.uniqueSkillsByCompany[c.id]?.join(', ') || 'None'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'match' && (
        <section className="space-y-4">
          {Object.values(analysis.companyReadiness).length === 0 ? (
            <div className="arch-panel p-6 text-xs text-[#A69A8C]">
              Extract job descriptions first to inspect your match against each target company.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.values(analysis.companyReadiness).map((cr) => {
                const strong = cr.rows.filter((r) => r.status === 'strong');
                const developing = cr.rows.filter((r) => r.status === 'developing');
                const claimed = cr.rows.filter((r) => r.status === 'insufficient_evidence');
                const missing = cr.rows.filter((r) => r.status === 'missing');
                const pct = Math.round(cr.readiness * 100);

                return (
                  <div key={cr.companyId} className="arch-panel p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 border-b border-[#382920] pb-3">
                      <div>
                        <h3 className="font-editorial text-2xl text-[#EAE4DC]">{cr.companyName}</h3>
                        <button
                          type="button"
                          onClick={() => setReadinessDrawerOpen(true)}
                          className="text-xs text-[#A69A8C] underline hover:text-[#B86D37] mt-0.5"
                        >
                          See calculation breakdown
                        </button>
                      </div>
                      <div className="font-mono-tabular text-2xl font-light text-[#B86D37]">
                        {pct}%
                      </div>
                    </div>

                    <div className="h-1.5 bg-[#12100F] border border-[#382920] overflow-hidden">
                      <div className="h-full bg-[#B86D37]" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="space-y-2 text-xs leading-relaxed">
                      <div>
                        <span className="text-[#B86D37] font-medium">Proven ({strong.length}): </span>
                        <span className="text-[#EAE4DC]">
                          {strong.map((r) => r.skillLabel).join(', ') || 'None yet'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#EAE4DC] font-medium">
                          In progress ({developing.length}):{' '}
                        </span>
                        <span className="text-[#A69A8C]">
                          {developing.map((r) => r.skillLabel).join(', ') || 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A69A8C] font-medium">
                          Claimed only ({claimed.length}):{' '}
                        </span>
                        <span className="text-[#A69A8C]">
                          {claimed.map((r) => r.skillLabel).join(', ') || 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#EAE4DC] font-medium">
                          Missing proof ({missing.length}):{' '}
                        </span>
                        <span className="text-[#A69A8C]">
                          {missing.map((r) => r.skillLabel).join(', ') || 'None'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#382920] flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPrepPreset({ companyId: cr.companyId, tab: 'company' });
                          setActiveModule('preparation');
                        }}
                        className="arch-btn-secondary px-3.5 py-2"
                      >
                        <span>Build {cr.companyName} Prep Track</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {selectedCell && (
        <div
          className="fixed inset-0 z-50 bg-[#12100F]/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cell-quote-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCell(null);
          }}
        >
          <div className="max-w-lg w-full bg-[#1B1714] border border-[#B86D37]/40 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#382920] pb-3">
              <div>
                <h3 id="cell-quote-title" className="font-editorial text-2xl text-[#EAE4DC]">
                  {selectedCell.skillLabel} — {selectedCell.companyName}
                </h3>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#B86D37] mt-0.5">
                  {selectedCell.cell.status} requirement
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                aria-label="Close quote modal"
                className="p-1.5 border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {selectedCell.cell.quotes.map((q, i) => (
                <div key={i} className="bg-[#12100F] border border-[#382920] p-3.5 space-y-1.5 text-xs">
                  <div className="text-[#EAE4DC] font-medium">{q.roleTitle}</div>
                  <blockquote className="text-[#A69A8C] italic leading-relaxed">“{q.quote}”</blockquote>
                  <div className="text-[#A69A8C]/75 font-mono-tabular">
                    {q.sourceLabel} · {q.fetchedAt} · {q.basis === 'explicit' ? 'Direct quote' : 'Interpreted'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
