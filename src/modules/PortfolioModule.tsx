import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import { normalizeSkillId } from '../shared/evidenceEngine';
import type { EvidenceRecord, PortfolioProject } from '../shared/schemas';

export function PortfolioModule() {
  const { store, analysis, updateStore, setActiveModule } = useCareerStore();
  const [generating, setGenerating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    store.portfolioProjects[0]?.id ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [activeSubmitProjectId, setActiveSubmitProjectId] = useState<string | null>(null);
  const [evUrl, setEvUrl] = useState('');
  const [evNotes, setEvNotes] = useState('');
  const [claimedSkills, setClaimedSkills] = useState<string[]>([]);

  const handleGenerateProjects = async () => {
    if (analysis.gaps.length === 0) {
      setError('Extract at least one target job description first so projects match your real skill gaps.');
      return;
    }
    setError(null);
    setGenerating(true);

    const res = await postJson<{
      projects: Array<Omit<PortfolioProject, 'id' | 'status' | 'evidence' | 'provenance'>>;
    }>('/api/ai/mentor', {
      action: 'generate_projects',
      gaps: analysis.gaps.slice(0, 10),
      targetRoles: store.targetRoles.map((r) => {
        const co = store.companies.find((c) => c.id === r.companyId);
        return `${co?.name ?? ''} — ${r.title}`;
      }),
    });
    setGenerating(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const created: PortfolioProject[] = res.data.projects.map((p, idx) => ({
      ...p,
      id: `proj-${Date.now()}-${idx}`,
      status: 'not_started',
      evidence: [],
      provenance: 'ai_inference',
    }));

    await updateStore((prev) => ({
      ...prev,
      portfolioProjects: [...created, ...prev.portfolioProjects],
    }));
    if (created[0]) {
      setExpandedProjectId(created[0].id);
    }
    setNotice(`Tailored ${created.length} portfolio projects to close your top priority gaps.`);
  };

  const handleStatusChange = async (
    projectId: string,
    status: PortfolioProject['status']
  ) => {
    await updateStore((prev) => ({
      ...prev,
      portfolioProjects: prev.portfolioProjects.map((p) =>
        p.id === projectId ? { ...p, status } : p
      ),
    }));
  };

  const handleVerifyEvidence = async (e: React.FormEvent, project: PortfolioProject) => {
    e.preventDefault();
    if (!evNotes.trim() && !evUrl.trim()) {
      setError('Provide a repository/documentation URL and notes describing what you implemented.');
      return;
    }
    if (claimedSkills.length === 0) {
      setError('Select at least one skill your submitted work demonstrates.');
      return;
    }
    setError(null);
    setVerifyingId(project.id);

    const res = await postJson<{
      skillsVerified: string[];
      skillsUnverified: string[];
      verificationNotes: string;
    }>('/api/ai/mentor', {
      action: 'verify_evidence',
      project,
      submission: {
        url: evUrl.trim(),
        notes: evNotes.trim(),
        skillsClaimed: claimedSkills,
      },
    });
    setVerifyingId(null);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const verifiedRecords: EvidenceRecord[] = res.data.skillsVerified.map((skill) => ({
      id: `ev-proj-${Date.now()}-${normalizeSkillId(skill)}`,
      skillId: normalizeSkillId(skill),
      skillLabel: skill,
      level: 'demonstrated',
      sourceType: 'project',
      sourceRef: evUrl.trim() || project.title,
      date,
      note: `${project.title}: ${evNotes.trim().slice(0, 180)}`,
      provenance: 'project_evidence',
    }));

    await updateStore(
      (prev) => ({
        ...prev,
        evidenceRecords: [...prev.evidenceRecords, ...verifiedRecords],
        portfolioProjects: prev.portfolioProjects.map((p) =>
          p.id === project.id
            ? {
                ...p,
                status: 'evidence_submitted',
                evidence: [
                  ...p.evidence,
                  {
                    id: `sub-${Date.now()}`,
                    url: evUrl.trim(),
                    notes: evNotes.trim(),
                    skillsClaimed: claimedSkills,
                    skillsVerified: res.data.skillsVerified,
                    verificationNotes: res.data.verificationNotes,
                    submittedAt: date,
                  },
                ],
              }
            : p
        ),
      }),
      `Verified portfolio project "${project.title}" (${res.data.skillsVerified.length} skills)`
    );

    setActiveSubmitProjectId(null);
    setEvUrl('');
    setEvNotes('');
    setClaimedSkills([]);
    setNotice(
      `Verified ${res.data.skillsVerified.length} of ${claimedSkills.length} selected skills and upgraded them to project proof.`
    );
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
            Proof-Driven Engineering Builds
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Portfolio Studio
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1">
            Each project targets your highest-priority gaps. Verified submissions upgrade those skills
            to proven capability.
          </p>
        </div>
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerateProjects}
          className="arch-btn-primary px-5 py-2.5"
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
          ) : (
            <Plus className="w-3.5 h-3.5 text-[#B86D37]" />
          )}
          <span>{generating ? 'Tailoring projects...' : 'Tailor Projects to Top Gaps'}</span>
        </button>
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

      {store.portfolioProjects.length === 0 ? (
        <div className="arch-panel p-8 space-y-4">
          <p className="text-sm text-[#A69A8C]">
            No tailored portfolio projects yet. Click “Tailor Projects to Top Gaps” above once your
            target job descriptions are added.
          </p>
          {analysis.gaps.length === 0 && (
            <button
              type="button"
              onClick={() => setActiveModule('company-dna')}
              className="arch-btn-primary px-5 py-2.5"
            >
              Add Job Descriptions in Company DNA
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {store.portfolioProjects.map((project) => {
            const isExpanded = expandedProjectId === project.id;

            return (
              <article key={project.id} className="arch-panel p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#B86D37]">
                      Targets: {project.skills.join(' · ')}
                    </div>
                    <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                      {project.title}
                    </h3>
                    <p className="text-xs text-[#A69A8C] leading-relaxed">{project.problem}</p>
                  </div>

                  {/* Status Stepper */}
                  <div className="flex flex-wrap items-center gap-1 bg-[#12100F] border border-[#382920] p-1 text-[10px] uppercase tracking-[0.08em]">
                    {(
                      [
                        { id: 'not_started', label: 'Not started' },
                        { id: 'in_progress', label: 'In progress' },
                        { id: 'completed', label: 'Completed' },
                        { id: 'evidence_submitted', label: 'Verified' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusChange(project.id, st.id)}
                        className={`px-2.5 py-1 transition-colors ${
                          project.status === st.id
                            ? st.id === 'evidence_submitted'
                              ? 'bg-[#B86D37] text-[#12100F] font-semibold'
                              : 'bg-[#211A16] border border-[#B86D37]/60 text-[#EAE4DC]'
                            : 'text-[#A69A8C] hover:text-[#EAE4DC]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#382920] text-xs">
                  <div className="flex flex-wrap items-center gap-4 text-[#A69A8C]">
                    <span>
                      <strong className="text-[#EAE4DC]">{project.milestones.length}</strong> milestones
                    </span>
                    <span>
                      Stack:{' '}
                      <strong className="text-[#EAE4DC]">{project.tech.slice(0, 4).join(', ')}</strong>
                    </span>
                    {project.evidence.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#B86D37] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {project.evidence.length} verified submission
                        {project.evidence.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
                      className="arch-btn-secondary px-3 py-1.5"
                    >
                      <span>{isExpanded ? 'Hide Plan' : 'View Plan'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-[#B86D37]" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-[#A69A8C]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedProjectId(project.id);
                        setActiveSubmitProjectId(
                          activeSubmitProjectId === project.id ? null : project.id
                        );
                        setClaimedSkills(project.evidenceableSkills);
                      }}
                      className="arch-btn-primary px-3.5 py-1.5"
                    >
                      {activeSubmitProjectId === project.id
                        ? 'Close Verification Form'
                        : 'Submit & Verify Proof'}
                    </button>
                  </div>
                </div>

                {/* Expanded Project Plan Details */}
                {isExpanded && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
                    <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2">
                      <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                        Why This Matters for Roles
                      </div>
                      <p className="text-[#EAE4DC] leading-relaxed">{project.relevance}</p>
                      <p className="text-[#A69A8C] leading-relaxed">{project.whyForRole}</p>
                    </div>

                    <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2">
                      <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                        Architecture & Stack
                      </div>
                      <p className="text-[#A69A8C] leading-relaxed">{project.architecture}</p>
                      <div className="text-[#EAE4DC]">
                        <strong>Stack:</strong> {project.tech.join(', ')}
                      </div>
                      <div className="text-[#A69A8C]">
                        <strong className="text-[#EAE4DC]">Data:</strong>{' '}
                        {project.dataSources.join(', ')}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-[#A69A8C]">
                        Repo: {project.repoStructure}
                      </div>
                    </div>

                    <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2">
                      <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                        Milestones & Evaluation
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[#A69A8C]">
                        {project.milestones.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                      <div className="text-[#EAE4DC] pt-1">
                        <strong>Deliverables:</strong> {project.deliverables.join(' · ')}
                      </div>
                      <div className="text-[#B86D37]">
                        Presentation tip: {project.presentationTips}
                      </div>
                    </div>
                  </div>
                )}

                {/* Submitted Evidence History */}
                {project.evidence.length > 0 && (
                  <div className="space-y-2 pt-2 text-xs">
                    <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                      Verified Submissions
                    </div>
                    {project.evidence.map((sub) => (
                      <div
                        key={sub.id}
                        className="bg-[#211A16] border border-[#B86D37]/40 p-3.5 space-y-1"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-[#EAE4DC] inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#B86D37]" />
                            Verified skills: {sub.skillsVerified.join(', ') || 'None verified'}
                          </span>
                          <span className="font-mono-tabular text-[#A69A8C]">{sub.submittedAt}</span>
                        </div>
                        {sub.url && <div className="text-[#A69A8C]">{sub.url}</div>}
                        <div className="text-[#EAE4DC]">{sub.verificationNotes}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSubmitProjectId === project.id && (
                  <form
                    onSubmit={(e) => handleVerifyEvidence(e, project)}
                    className="bg-[#12100F] border border-[#B86D37]/45 p-4 space-y-3 text-xs"
                  >
                    <div className="font-medium text-[#EAE4DC]">
                      Verify Project Proof (only skills backed by your notes earn Proven status)
                    </div>
                    <div>
                      <label htmlFor={`url-${project.id}`} className="block text-[#A69A8C] mb-1">
                        Repository or live demo URL
                      </label>
                      <input
                        id={`url-${project.id}`}
                        type="text"
                        value={evUrl}
                        onChange={(e) => setEvUrl(e.target.value)}
                        placeholder="https://github.com/..."
                        className="arch-input px-3 py-2"
                      />
                    </div>
                    <div>
                      <label htmlFor={`notes-${project.id}`} className="block text-[#A69A8C] mb-1">
                        What you implemented, architecture trade-offs & test results
                      </label>
                      <textarea
                        id={`notes-${project.id}`}
                        rows={3}
                        value={evNotes}
                        onChange={(e) => setEvNotes(e.target.value)}
                        placeholder="Explain specifically what you built, benchmarks, and tests passed..."
                        className="arch-input px-3 py-2"
                      />
                    </div>
                    <div>
                      <div className="text-[#A69A8C] mb-1.5">
                        Skills demonstrated by this project:
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {project.evidenceableSkills.map((sk) => (
                          <label key={sk} className="inline-flex items-center gap-1.5 text-[#EAE4DC]">
                            <input
                              type="checkbox"
                              checked={claimedSkills.includes(sk)}
                              onChange={(e) =>
                                setClaimedSkills((prev) =>
                                  e.target.checked ? [...prev, sk] : prev.filter((x) => x !== sk)
                                )
                              }
                              className="accent-[#B86D37]"
                            />
                            <span>{sk}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSubmitProjectId(null)}
                        className="arch-btn-secondary px-3.5 py-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={verifyingId === project.id}
                        className="arch-btn-primary px-4 py-2"
                      >
                        {verifyingId === project.id && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                        )}
                        <span>Verify & Record Proof</span>
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
