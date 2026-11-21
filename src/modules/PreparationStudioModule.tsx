import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  Layers,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import { ProvenanceText } from '../components/ProvenanceBadge';
import type { CompanyPrepTrack, LearningResource, RoleMasteryTrack } from '../shared/schemas';

type PrepTab = 'role' | 'company' | 'resources';

interface DiscoveredResource {
  skill: string;
  title: string;
  provider: string;
  resourceType: LearningResource['resourceType'];
  difficulty: LearningResource['difficulty'];
  format: LearningResource['format'];
  estimatedMinutes: number;
  summary: string;
  whyRecommended: string;
  url?: string;
  searchTerm: string;
  verified: boolean;
}

export function PreparationStudioModule() {
  const {
    store,
    analysis,
    matrix,
    prepPreset,
    setPrepPreset,
    updateStore,
    setActiveModule,
    setInterviewPreset,
  } = useCareerStore();

  const [tab, setTab] = useState<PrepTab>('role');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    store.companies[0]?.id ?? ''
  );
  const [generatingRoleTrack, setGeneratingRoleTrack] = useState(false);
  const [generatingCompanyTrack, setGeneratingCompanyTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Resource discovery state
  const defaultSkill =
    analysis.gaps.find((g) => g.status !== 'strong')?.skillLabel ||
    analysis.gaps[0]?.skillLabel ||
    '';
  const [resourceQuery, setResourceQuery] = useState(defaultSkill);
  const [resourceLevel, setResourceLevel] = useState<'foundational' | 'intermediate' | 'advanced'>(
    'intermediate'
  );
  const [resourceCompanyFilter, setResourceCompanyFilter] = useState('');
  const [discoveringResources, setDiscoveringResources] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredResource[]>([]);
  const [groundedCount, setGroundedCount] = useState<number | null>(null);
  const [copiedSearchTerm, setCopiedSearchTerm] = useState<string | null>(null);

  useEffect(() => {
    if (!prepPreset) return;
    if (prepPreset.tab) setTab(prepPreset.tab);
    if (prepPreset.companyId) setSelectedCompanyId(prepPreset.companyId);
    if (prepPreset.skill) setResourceQuery(prepPreset.skill);
    setPrepPreset(null);
  }, [prepPreset, setPrepPreset]);

  useEffect(() => {
    if (!selectedCompanyId && store.companies.length > 0) {
      setSelectedCompanyId(store.companies[0].id);
    }
  }, [selectedCompanyId, store.companies]);

  const activeCompany = store.companies.find((c) => c.id === selectedCompanyId) ?? null;
  const activeRole = activeCompany
    ? store.targetRoles.find((r) => r.companyId === activeCompany.id) ?? null
    : null;
  const activeJd = activeRole
    ? store.jobDescriptions.find((j) => j.targetRoleId === activeRole.id) ?? null
    : null;

  const sharedSkillsList = useMemo(() => {
    if (matrix.commonSkills.length > 0) return matrix.commonSkills;
    return matrix.rows.filter((r) => r.companyCount >= 2).map((r) => r.skillLabel);
  }, [matrix]);

  const companySpecificSkills = useMemo(() => {
    if (!activeCompany) return [];
    return matrix.uniqueSkillsByCompany[activeCompany.id] ?? [];
  }, [activeCompany, matrix.uniqueSkillsByCompany]);

  const activeCompanyTrack: CompanyPrepTrack | null = activeCompany
    ? store.companyPrepTracks[activeCompany.id] ?? null
    : null;

  const activeResume =
    store.resumeVersions.find((r) => r.id === store.activeResumeId) ?? store.resumeVersions[0];

  const handleGenerateRoleTrack = async () => {
    setGeneratingRoleTrack(true);
    setTrackError(null);
    const primaryRoleTitle =
      store.targetRoles[0]?.title || store.profile?.careerObjective || 'Target Role';

    const res = await postJson<RoleMasteryTrack>('/api/ai/preparation', {
      trackType: 'role',
      roleTitle: primaryRoleTitle,
      sharedSkills:
        sharedSkillsList.length > 0
          ? sharedSkillsList
          : analysis.gaps.slice(0, 6).map((g) => g.skillLabel),
      gaps: analysis.gaps.slice(0, 8).map((g) => ({
        skill: g.skillLabel,
        status: g.status,
        strength: g.strength,
        priorityScore: g.priorityScore,
      })),
      resumeSummary: activeResume
        ? {
            skills: activeResume.parsed.skills,
            experience: activeResume.parsed.experience.slice(0, 3),
          }
        : null,
    });

    setGeneratingRoleTrack(false);
    if (!res.ok) {
      setTrackError(res.error);
      return;
    }

    await updateStore(
      (prev) => ({
        ...prev,
        roleMasteryTrack: res.data,
      }),
      'Generated Track A Role Mastery plan'
    );
  };

  const handleGenerateCompanyTrack = async () => {
    if (!activeCompany || !activeJd) {
      setTrackError('Select a company that has an analysed job description in Company DNA.');
      return;
    }
    setGeneratingCompanyTrack(true);
    setTrackError(null);

    const res = await postJson<CompanyPrepTrack>('/api/ai/preparation', {
      trackType: 'company',
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      roleTitle: activeRole?.title || 'Target Role',
      jdId: activeJd.id,
      sharedSkills: sharedSkillsList,
      companySpecificSkills,
      jdRequirements: activeJd.requirements.map((r) => ({
        skill: r.skill,
        level: r.level,
        quote: r.quote,
      })),
      gaps: analysis.gaps.slice(0, 8).map((g) => ({
        skill: g.skillLabel,
        status: g.status,
        strength: g.strength,
      })),
    });

    setGeneratingCompanyTrack(false);
    if (!res.ok) {
      setTrackError(res.error);
      return;
    }

    await updateStore(
      (prev) => ({
        ...prev,
        companyPrepTracks: {
          ...prev.companyPrepTracks,
          [activeCompany.id]: res.data,
        },
      }),
      `Generated ${activeCompany.name} preparation track`
    );
  };

  const toggleRoleModule = async (moduleId: string) => {
    if (!store.roleMasteryTrack) return;
    await updateStore((prev) => {
      if (!prev.roleMasteryTrack) return prev;
      return {
        ...prev,
        roleMasteryTrack: {
          ...prev.roleMasteryTrack,
          modules: prev.roleMasteryTrack.modules.map((m) =>
            m.id === moduleId ? { ...m, completed: !m.completed } : m
          ),
        },
      };
    });
  };

  const toggleCompanyModule = async (companyId: string, moduleId: string) => {
    await updateStore((prev) => {
      const existing = prev.companyPrepTracks[companyId];
      if (!existing) return prev;
      return {
        ...prev,
        companyPrepTracks: {
          ...prev.companyPrepTracks,
          [companyId]: {
            ...existing,
            modules: existing.modules.map((m) =>
              m.id === moduleId ? { ...m, completed: !m.completed } : m
            ),
          },
        },
      };
    });
  };

  const handleDiscoverResources = async (overrideSkill?: string) => {
    const querySkill = (overrideSkill ?? resourceQuery).trim();
    if (!querySkill) {
      setDiscoveryError('Enter a capability or topic to search learning resources.');
      return;
    }
    if (overrideSkill) setResourceQuery(overrideSkill);

    setDiscoveringResources(true);
    setDiscoveryError(null);

    const res = await postJson<{
      resources: DiscoveredResource[];
      groundedSourceCount: number;
    }>('/api/ai/resources', {
      skill: querySkill,
      targetRole: store.targetRoles[0]?.title,
      companyName: resourceCompanyFilter || undefined,
      level: resourceLevel,
    });

    setDiscoveringResources(false);
    if (!res.ok) {
      setDiscoveryError(res.error);
      return;
    }

    setDiscoveredList(res.data.resources);
    setGroundedCount(res.data.groundedSourceCount);
  };

  const saveResourceToLibrary = async (item: DiscoveredResource) => {
    const alreadySaved = store.learningResources.some(
      (r) => r.title.toLowerCase() === item.title.toLowerCase()
    );
    if (alreadySaved) return;

    const entry: LearningResource = {
      id: `lres-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      skill: item.skill,
      title: item.title,
      provider: item.provider,
      resourceType: item.resourceType,
      difficulty: item.difficulty,
      format: item.format,
      estimatedMinutes: item.estimatedMinutes,
      summary: item.summary,
      whyRecommended: item.whyRecommended,
      url: item.url,
      searchTerm: item.searchTerm,
      verified: item.verified,
      status: 'saved',
      notes: '',
      targetCompany: resourceCompanyFilter || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
      provenance: 'ai_inference',
    };

    await updateStore((prev) => ({
      ...prev,
      learningResources: [entry, ...prev.learningResources],
    }));
  };

  const updateSavedResourceStatus = async (
    id: string,
    status: LearningResource['status']
  ) => {
    await updateStore((prev) => ({
      ...prev,
      learningResources: prev.learningResources.map((r) =>
        r.id === id ? { ...r, status } : r
      ),
    }));
  };

  const updateSavedResourceNotes = async (id: string, notes: string) => {
    await updateStore((prev) => ({
      ...prev,
      learningResources: prev.learningResources.map((r) =>
        r.id === id ? { ...r, notes } : r
      ),
    }));
  };

  const removeSavedResource = async (id: string) => {
    await updateStore((prev) => ({
      ...prev,
      learningResources: prev.learningResources.filter((r) => r.id !== id),
    }));
  };

  const copySearchTerm = async (term: string) => {
    try {
      await navigator.clipboard.writeText(term);
      setCopiedSearchTerm(term);
      setTimeout(() => setCopiedSearchTerm(null), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
            Dual-Track Intelligence & Resource Discovery
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Preparation Studio
          </h2>
          <p className="text-sm text-[#A69A8C] mt-1.5 max-w-2xl leading-relaxed">
            Separate foundational <strong className="text-[#EAE4DC] font-medium">Role Mastery</strong>{' '}
            shared across employers from <strong className="text-[#EAE4DC] font-medium">Company-Specific</strong>{' '}
            preparation, paired with Google Search grounded learning resources.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveModule('roadmap')}
            className="arch-btn-secondary px-4 py-2.5"
          >
            <span>Open Weekly Roadmap</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('interview')}
            className="arch-btn-primary px-4 py-2.5"
          >
            <Mic className="w-3.5 h-3.5 text-[#B86D37]" />
            <span>Enter Interview Arena</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap border-b border-[#382920] gap-1">
        {(
          [
            ['role', 'Track A · Role Mastery', Layers],
            ['company', 'Track B · Company Prep', Building2],
            ['resources', `Resource Library (${store.learningResources.length})`, BookOpen],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-[11px] tracking-[0.14em] uppercase inline-flex items-center gap-2 border-b-2 transition-colors ${
                active
                  ? 'border-[#B86D37] text-[#EAE4DC] bg-[#1B1714]'
                  : 'border-transparent text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {trackError && (
        <div className="border-l-2 border-[#B86D37] bg-[#211A16] px-4 py-3 text-xs text-[#EAE4DC]">
          {trackError}
        </div>
      )}

      {/* =========================================================
          TAB 1: TRACK A — ROLE MASTERY
         ========================================================= */}
      {tab === 'role' && (
        <div className="space-y-6">
          <div className="arch-panel p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                Track A · Universal Role Foundation
              </div>
              <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                {store.roleMasteryTrack?.roleTitle ||
                  store.targetRoles[0]?.title ||
                  'Core Role Mastery Track'}
              </h3>
              <p className="text-xs text-[#A69A8C] leading-relaxed">
                Covers competencies demanded across multiple target postings so every study hour
                compounds across all interviews.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateRoleTrack}
              disabled={generatingRoleTrack || analysis.gaps.length === 0}
              className="arch-btn-primary px-5 py-3"
            >
              {generatingRoleTrack ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
              )}
              <span>
                {store.roleMasteryTrack ? 'Refresh Role Mastery Track' : 'Generate Role Mastery Track'}
              </span>
            </button>
          </div>

          {analysis.gaps.length === 0 ? (
            <div className="arch-panel p-8 text-center space-y-3">
              <p className="text-sm text-[#A69A8C]">
                Add at least one target job description in Company DNA to unlock role mastery modules.
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('company-dna')}
                className="arch-btn-primary px-4 py-2.5"
              >
                <span>Open Company DNA</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
              </button>
            </div>
          ) : !store.roleMasteryTrack ? (
            <div className="arch-panel p-6 space-y-4">
              <div className="text-xs text-[#A69A8C]">
                Detected shared skills across your targets:{' '}
                <span className="text-[#EAE4DC]">
                  {(sharedSkillsList.length > 0
                    ? sharedSkillsList
                    : analysis.gaps.slice(0, 5).map((g) => g.skillLabel)
                  ).join(' · ')}
                </span>
              </div>
              <p className="text-xs text-[#A69A8C]">
                Click <strong className="text-[#EAE4DC]">Generate Role Mastery Track</strong> above
                to synthesize tailored study modules grounded in your current gaps.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Competencies & Shared Themes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="arch-panel p-5 space-y-3">
                  <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                    Core Competencies
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {store.roleMasteryTrack.coreCompetencies.map((comp) => (
                      <span
                        key={comp}
                        className="px-2.5 py-1 bg-[#211A16] border border-[#382920] text-xs text-[#EAE4DC]"
                      >
                        {comp}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="arch-panel p-5 space-y-2.5">
                  <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                    Cross-Company Overlap Signals
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#A69A8C]">
                    {store.roleMasteryTrack.sharedCompanyThemes.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#B86D37] mt-0.5">—</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-3">
                {store.roleMasteryTrack.modules.map((mod) => (
                  <div
                    key={mod.id}
                    className={`p-5 border transition-colors ${
                      mod.completed
                        ? 'bg-[#211A16]/70 border-[#B86D37]/45'
                        : 'bg-[#1B1714] border-[#382920]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleRoleModule(mod.id)}
                        className="flex items-start gap-3 text-left group"
                      >
                        {mod.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-[#B86D37] shrink-0 mt-1" />
                        ) : (
                          <Circle className="w-4 h-4 text-[#A69A8C] group-hover:text-[#B86D37] shrink-0 mt-1" />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                mod.completed ? 'text-[#A69A8C] line-through' : 'text-[#EAE4DC]'
                              }`}
                            >
                              {mod.title}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase border border-[#382920] bg-[#12100F] text-[#B86D37]">
                              {mod.skillTag}
                            </span>
                            <span className="text-[10px] tracking-[0.12em] uppercase text-[#A69A8C]">
                              {mod.priority}
                            </span>
                          </div>
                          <p className="text-xs text-[#A69A8C] mt-1 leading-relaxed">
                            {mod.summary}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setTab('resources');
                            void handleDiscoverResources(mod.skillTag);
                          }}
                          className="arch-btn-secondary px-3 py-1.5"
                        >
                          <Search className="w-3 h-3 text-[#B86D37]" />
                          <span>Find Resources</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInterviewPreset({ focus: mod.skillTag });
                            setActiveModule('interview');
                          }}
                          className="arch-btn-secondary px-3 py-1.5"
                        >
                          <Mic className="w-3 h-3 text-[#B86D37]" />
                          <span>Practise</span>
                        </button>
                      </div>
                    </div>

                    {mod.checklist.length > 0 && (
                      <div className="mt-3 pl-7 space-y-1 text-xs text-[#EAE4DC]/85">
                        {mod.checklist.map((c, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-[#B86D37]">·</span>
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {mod.practicePrompt && (
                      <div className="mt-3 ml-7 p-3 bg-[#12100F] border border-[#382920] text-xs text-[#A69A8C]">
                        <span className="text-[10px] tracking-[0.14em] uppercase text-[#B86D37] mr-2">
                          Self-Check Prompt:
                        </span>
                        <span className="text-[#EAE4DC]">{mod.practicePrompt}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          TAB 2: TRACK B — COMPANY-SPECIFIC PREPARATION
         ========================================================= */}
      {tab === 'company' && (
        <div className="space-y-6">
          {store.companies.length === 0 ? (
            <div className="arch-panel p-8 text-center space-y-3">
              <p className="text-sm text-[#A69A8C]">
                No target companies added yet. Add companies and job descriptions in Company DNA.
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('company-dna')}
                className="arch-btn-primary px-4 py-2.5"
              >
                <span>Open Company DNA</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
              </button>
            </div>
          ) : (
            <>
              {/* Company Selector Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {store.companies.map((c) => {
                    const active = c.id === selectedCompanyId;
                    const cr = analysis.companyReadiness[c.id];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCompanyId(c.id)}
                        className={`px-4 py-2.5 border text-left transition-colors ${
                          active
                            ? 'bg-[#211A16] border-[#B86D37] text-[#EAE4DC]'
                            : 'bg-[#1B1714] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                        }`}
                      >
                        <div className="text-xs font-medium">{c.name}</div>
                        {cr && (
                          <div className="text-[10px] font-mono-tabular text-[#B86D37] mt-0.5">
                            {Math.round(cr.readiness * 100)}% ready
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateCompanyTrack}
                    disabled={generatingCompanyTrack || !activeJd}
                    className="arch-btn-primary px-4 py-2.5"
                  >
                    {generatingCompanyTrack ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
                    )}
                    <span>
                      {activeCompanyTrack
                        ? `Refresh ${activeCompany?.name || ''} Prep`
                        : `Build ${activeCompany?.name || ''} Prep Track`}
                    </span>
                  </button>

                  {activeCompany && (
                    <button
                      type="button"
                      onClick={() => {
                        setInterviewPreset({
                          companyId: activeCompany.id,
                          roleId: activeRole?.id,
                          focus: companySpecificSkills[0] || sharedSkillsList[0],
                        });
                        setActiveModule('interview');
                      }}
                      className="arch-btn-secondary px-4 py-2.5"
                    >
                      <Mic className="w-3.5 h-3.5 text-[#B86D37]" />
                      <span>Mock {activeCompany.name} Interview</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Overlap vs Company-Unique Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="arch-panel p-5 space-y-2.5">
                  <div className="text-[10px] tracking-[0.18em] uppercase text-[#A69A8C]">
                    Shared Across Target Companies (Covered in Track A)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sharedSkillsList.length === 0 ? (
                      <span className="text-xs text-[#A69A8C]">
                        Add 2+ companies to compute cross-company overlap.
                      </span>
                    ) : (
                      sharedSkillsList.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 bg-[#12100F] border border-[#382920] text-xs text-[#EAE4DC]"
                        >
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="arch-panel p-5 space-y-2.5">
                  <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                    Distinct to {activeCompany?.name || 'Selected Company'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {companySpecificSkills.length === 0 ? (
                      <span className="text-xs text-[#A69A8C]">
                        All extracted requirements for {activeCompany?.name} overlap with your other targets.
                      </span>
                    ) : (
                      companySpecificSkills.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setTab('resources');
                            setResourceCompanyFilter(activeCompany?.name || '');
                            void handleDiscoverResources(s);
                          }}
                          className="px-2.5 py-1 bg-[#211A16] border border-[#B86D37]/50 hover:border-[#B86D37] text-xs text-[#EAE4DC]"
                        >
                          {s}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {!activeJd ? (
                <div className="arch-panel p-6 text-xs text-[#A69A8C]">
                  {activeCompany?.name} does not have an extracted job description yet. Add one in
                  Company DNA to generate tailored prep modules.
                </div>
              ) : !activeCompanyTrack ? (
                <div className="arch-panel p-6 text-xs text-[#A69A8C]">
                  Click <strong className="text-[#EAE4DC]">Build {activeCompany?.name} Prep Track</strong>{' '}
                  to create organization-specific study prompts and interview focus notes from the{' '}
                  {activeRole?.title || 'role'} JD.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="arch-panel-elevated p-5 space-y-3">
                    <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                      {activeCompanyTrack.companyName} — {activeCompanyTrack.roleTitle}
                    </div>
                    <p className="text-sm text-[#EAE4DC] leading-relaxed">
                      {activeCompanyTrack.companyFocusSummary}
                    </p>
                    {activeCompanyTrack.interviewFormatNotes.length > 0 && (
                      <div className="pt-2 border-t border-[#382920] space-y-1.5">
                        <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                          Grounded Preparation Signals
                        </div>
                        {activeCompanyTrack.interviewFormatNotes.map((note, idx) => (
                          <div key={idx} className="text-xs text-[#A69A8C] flex items-start gap-2">
                            <span className="text-[#B86D37]">·</span>
                            <span>{note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {activeCompanyTrack.modules.map((mod) => (
                      <div
                        key={mod.id}
                        className={`p-5 border transition-colors ${
                          mod.completed
                            ? 'bg-[#211A16]/70 border-[#B86D37]/45'
                            : 'bg-[#1B1714] border-[#382920]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleCompanyModule(activeCompanyTrack.companyId, mod.id)}
                            className="flex items-start gap-3 text-left group"
                          >
                            {mod.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-[#B86D37] shrink-0 mt-1" />
                            ) : (
                              <Circle className="w-4 h-4 text-[#A69A8C] group-hover:text-[#B86D37] shrink-0 mt-1" />
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-sm font-medium ${
                                    mod.completed ? 'text-[#A69A8C] line-through' : 'text-[#EAE4DC]'
                                  }`}
                                >
                                  {mod.title}
                                </span>
                                <span className="px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase border border-[#382920] bg-[#12100F] text-[#B86D37]">
                                  {mod.skillTag}
                                </span>
                              </div>
                              <p className="text-xs text-[#A69A8C] mt-1 leading-relaxed">
                                {mod.summary}
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setTab('resources');
                              setResourceCompanyFilter(activeCompanyTrack.companyName);
                              void handleDiscoverResources(mod.skillTag);
                            }}
                            className="arch-btn-secondary px-3 py-1.5 shrink-0"
                          >
                            <Search className="w-3 h-3 text-[#B86D37]" />
                            <span>Find Resources</span>
                          </button>
                        </div>

                        {mod.checklist.length > 0 && (
                          <div className="mt-3 pl-7 space-y-1 text-xs text-[#EAE4DC]/85">
                            {mod.checklist.map((c, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-[#B86D37]">·</span>
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =========================================================
          TAB 3: LEARNING RESOURCE DISCOVERY & SAVED LIBRARY
         ========================================================= */}
      {tab === 'resources' && (
        <div className="space-y-8">
          {/* Discovery Search Panel */}
          <div className="arch-panel p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                  Google Search Grounded Discovery
                </div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC] mt-0.5">
                  Find Verified Learning Resources
                </h3>
              </div>
              {groundedCount !== null && (
                <span className="text-[11px] font-mono-tabular text-[#B86D37] border border-[#B86D37]/40 px-2.5 py-1 bg-[#211A16]">
                  {groundedCount} grounded web source{groundedCount === 1 ? '' : 's'} checked
                </span>
              )}
            </div>

            {analysis.gaps.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mr-1">
                  Priority Gaps:
                </span>
                {analysis.gaps
                  .filter((g) => g.status !== 'strong')
                  .slice(0, 6)
                  .map((g) => (
                    <button
                      key={g.skillId}
                      type="button"
                      onClick={() => void handleDiscoverResources(g.skillLabel)}
                      className={`px-2.5 py-1 border text-xs transition-colors ${
                        resourceQuery.toLowerCase() === g.skillLabel.toLowerCase()
                          ? 'bg-[#211A16] border-[#B86D37] text-[#EAE4DC]'
                          : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                      }`}
                    >
                      {g.skillLabel}
                    </button>
                  ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <label className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Skill or Topic
                </label>
                <input
                  type="text"
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                  placeholder="e.g. Kafka, Distributed Systems, Automated Testing"
                  className="arch-input px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Target Level
                </label>
                <select
                  value={resourceLevel}
                  onChange={(e) =>
                    setResourceLevel(
                      e.target.value as 'foundational' | 'intermediate' | 'advanced'
                    )
                  }
                  className="arch-input px-3 py-2.5 text-sm"
                >
                  <option value="foundational">Foundational</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] tracking-[0.16em] uppercase text-[#A69A8C] mb-1.5">
                  Company Context
                </label>
                <select
                  value={resourceCompanyFilter}
                  onChange={(e) => setResourceCompanyFilter(e.target.value)}
                  className="arch-input px-3 py-2.5 text-sm"
                >
                  <option value="">All targets</option>
                  {store.companies.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={() => void handleDiscoverResources()}
                  disabled={discoveringResources}
                  className="arch-btn-primary w-full py-2.5 px-4 h-[42px]"
                >
                  {discoveringResources ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                  ) : (
                    <Compass className="w-3.5 h-3.5 text-[#B86D37]" />
                  )}
                  <span>Discover</span>
                </button>
              </div>
            </div>

            {discoveryError && (
              <div className="border-l-2 border-[#B86D37] bg-[#211A16] px-4 py-2.5 text-xs text-[#EAE4DC]">
                {discoveryError}
              </div>
            )}

            {discoveredList.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {discoveredList.map((item, idx) => {
                  const isSaved = store.learningResources.some(
                    (r) => r.title.toLowerCase() === item.title.toLowerCase()
                  );
                  return (
                    <div
                      key={`${item.title}-${idx}`}
                      className="p-5 bg-[#12100F] border border-[#382920] flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                            {item.resourceType} · {item.difficulty} · ~{item.estimatedMinutes}m
                          </span>
                          <span
                            className={`text-[10px] tracking-[0.12em] uppercase px-2 py-0.5 border ${
                              item.verified
                                ? 'border-[#B86D37]/60 text-[#B86D37] bg-[#211A16]'
                                : 'border-[#382920] text-[#A69A8C]'
                            }`}
                          >
                            {item.verified ? 'Verified URL' : 'Search Guidance'}
                          </span>
                        </div>
                        <h4 className="font-editorial text-xl text-[#EAE4DC] leading-snug">
                          {item.title}
                        </h4>
                        <div className="text-[11px] text-[#A69A8C]">{item.provider}</div>
                        <p className="text-xs text-[#A69A8C] leading-relaxed">{item.summary}</p>
                        <div className="text-[11px] text-[#EAE4DC]/85 border-l border-[#B86D37]/60 pl-2.5">
                          {item.whyRecommended}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#382920]">
                        {item.verified && item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#B86D37] hover:underline inline-flex items-center gap-1.5"
                          >
                            <span>Open Verified Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void copySearchTerm(item.searchTerm)}
                            className="text-[11px] text-[#A69A8C] hover:text-[#EAE4DC] text-left"
                          >
                            {copiedSearchTerm === item.searchTerm
                              ? 'Copied search term!'
                              : `Search: "${item.searchTerm}"`}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isSaved}
                          onClick={() => void saveResourceToLibrary(item)}
                          className={`px-3 py-1.5 text-[10px] tracking-[0.14em] uppercase border transition-colors ${
                            isSaved
                              ? 'border-[#382920] text-[#A69A8C] bg-[#1B1714]'
                              : 'border-[#B86D37]/70 text-[#EAE4DC] bg-[#211A16] hover:bg-[#382920]'
                          }`}
                        >
                          {isSaved ? 'Saved in Library' : 'Save Resource'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Saved Study Library */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Saved Learning Library
                </h3>
                <p className="text-xs text-[#A69A8C] mt-0.5">
                  Track reading progress, attach personal takeaways, and verify links across sessions.
                </p>
              </div>
              <span className="font-mono-tabular text-xs text-[#A69A8C]">
                {store.learningResources.filter((r) => r.status === 'completed').length} /{' '}
                {store.learningResources.length} completed
              </span>
            </div>

            {store.learningResources.length === 0 ? (
              <div className="arch-panel p-6 text-xs text-[#A69A8C]">
                No saved resources yet. Search any capability gap above and save verified resources
                to build your study shelf.
              </div>
            ) : (
              <div className="space-y-3">
                {store.learningResources.map((res) => (
                  <div key={res.id} className="arch-panel p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] tracking-[0.14em] uppercase bg-[#211A16] border border-[#B86D37]/40 text-[#B86D37]">
                            {res.skill}
                          </span>
                          <span className="text-[10px] tracking-[0.12em] uppercase text-[#A69A8C]">
                            {res.resourceType} · {res.difficulty}
                          </span>
                          <ProvenanceText tag={res.provenance} date={res.createdAt} />
                        </div>
                        <h4 className="font-editorial text-xl text-[#EAE4DC]">{res.title}</h4>
                        {res.summary && (
                          <p className="text-xs text-[#A69A8C] leading-relaxed">{res.summary}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          aria-label={`Status for ${res.title}`}
                          value={res.status}
                          onChange={(e) =>
                            void updateSavedResourceStatus(
                              res.id,
                              e.target.value as LearningResource['status']
                            )
                          }
                          className="arch-input px-2.5 py-1.5 text-xs w-auto"
                        >
                          <option value="saved">Saved</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void removeSavedResource(res.id)}
                          aria-label={`Remove ${res.title}`}
                          className="h-8 w-8 flex items-center justify-center border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#B86D37]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#382920]/70">
                      {res.verified && res.url ? (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#B86D37] hover:underline inline-flex items-center gap-1.5"
                        >
                          <span>{res.url}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-[#A69A8C]">
                          Search query: &ldquo;{res.searchTerm || res.title}&rdquo; (unverified external link omitted)
                        </span>
                      )}
                    </div>

                    <input
                      type="text"
                      value={res.notes}
                      onChange={(e) => void updateSavedResourceNotes(res.id, e.target.value)}
                      placeholder="Add personal study notes or key takeaways..."
                      className="arch-input px-3 py-2 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
