import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { ArchitecturalSculptureScene } from './components/ArchitecturalSculptureScene';
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ReadinessDrawer } from './components/ReadinessDrawer';
import {
  CareerStoreProvider,
  useCareerStore,
  type ModuleId,
} from './context/CareerStoreContext';
import { ApplicationsModule } from './modules/ApplicationsModule';
import { CompanyDnaModule } from './modules/CompanyDnaModule';
import { GapExplorerModule } from './modules/GapExplorerModule';
import { InterviewArenaModule } from './modules/InterviewArenaModule';
import { LinkedInStudioModule } from './modules/LinkedInStudioModule';
import { PortfolioModule } from './modules/PortfolioModule';
import { PreparationStudioModule } from './modules/PreparationStudioModule';
import { ProgressModule } from './modules/ProgressModule';
import { ReportsModule } from './modules/ReportsModule';
import { ResumeModule } from './modules/ResumeModule';
import { RoadmapModule } from './modules/RoadmapModule';
import { SettingsModule } from './modules/SettingsModule';

type HeaderPopover = null | 'notifications' | 'profile' | 'explore' | 'workspace';

const PRESET_TARGET_ROLES = [
  'SOFTWARE ENGINEER',
  'STAFF SYSTEMS ARCHITECT',
  'AI INFRASTRUCTURE ENGINEER',
  'BACKEND & DATA PLATFORM ENGINEER',
];

const MODULE_TABS: Array<{ id: ModuleId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'resume', label: 'Resume' },
  { id: 'company-dna', label: 'Company DNA' },
  { id: 'gaps', label: 'Skill Gaps' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'interview', label: 'Interview Arena' },
  { id: 'progress', label: 'Progress' },
  { id: 'applications', label: 'Applications' },
  { id: 'linkedin', label: 'LinkedIn Studio' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

function RolexIqMonogram() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M12 2L17.5 6.5V17.5L12 22L6.5 17.5V6.5L12 2Z"
        stroke="#B86D37"
        strokeWidth="1.15"
      />
      <path
        d="M12 5.2V18.8"
        stroke="#EAE4DC"
        strokeWidth="0.9"
        strokeOpacity="0.8"
      />
      <path
        d="M7.5 9.2L12 12L16.5 9.2"
        stroke="#B86D37"
        strokeWidth="1"
      />
    </svg>
  );
}

function RolexIqPlatformShell() {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const {
    store,
    storageMode,
    storageNotice,
    user,
    activeModule,
    setActiveModule,
    setSelectedGapSkillId,
    setCommandPaletteOpen,
    setReadinessDrawerOpen,
    signInWithGoogle,
    signOutUser,
    loadDemoCandidate,
    clearDemoData,
    analysis,
    analytics,
    nextBestStep,
    journeySteps,
  } = useCareerStore();

  const [activePopover, setActivePopover] = useState<HeaderPopover>(null);
  const [roleDraft, setRoleDraft] = useState<string>('SOFTWARE ENGINEER');
  const [sceneReady, setSceneReady] = useState(false);

  const headerPopoverRef = useRef<HTMLDivElement | null>(null);
  const nextStepRef = useRef<HTMLElement | null>(null);

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  const primaryRoleLabel =
    store.targetRoles[0]?.title?.toUpperCase() || roleDraft;

  const readinessPct = Math.round(analysis.overallReadiness * 100);
  const activeGapCount = analysis.gaps.filter((g) => g.status !== 'strong').length;
  const scoredInterviews = store.interviewSessions.filter((s) => Boolean(s.report));
  const completedCheckpoints = journeySteps.filter((s) => s.done).length;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (activePopover !== 'notifications' && activePopover !== 'profile') {
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      if (
        headerPopoverRef.current &&
        !headerPopoverRef.current.contains(e.target as Node)
      ) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [activePopover]);

  const executeNextBestStep = () => {
    setActivePopover(null);
    if (nextBestStep.targetModule === 'gaps' && nextBestStep.skillId) {
      setSelectedGapSkillId(nextBestStep.skillId);
    }
    setActiveModule(nextBestStep.targetModule);
  };

  const scrollToNextStep = () => {
    setActivePopover(null);
    if (activeModule !== 'overview') {
      setActiveModule('overview');
      setTimeout(() => {
        nextStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 150);
    } else {
      nextStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  return (
    <div className="min-h-screen bg-[#12100F] text-[#EAE4DC] flex flex-col justify-between selection:bg-[#B86D37]/25">
      {/* =========================================================
          1. SLIM ARCHITECTURAL TOP NAVIGATION (~80px)
          ========================================================= */}
      <header className="relative z-30 w-full bg-[#12100F] border-b border-[#B86D37]/25 no-print">
        <div
          ref={headerPopoverRef}
          className="max-w-[1440px] mx-auto h-20 px-6 sm:px-10 lg:px-14 flex items-center justify-between gap-4"
        >
          {/* Left: RolexIQ wordmark + tagline */}
          <button
            type="button"
            onClick={() => {
              setActivePopover(null);
              setActiveModule('overview');
            }}
            className="flex items-center gap-3.5 group text-left focus-visible:outline-none"
          >
            <RolexIqMonogram />
            <div className="flex flex-col leading-none">
              <span className="font-editorial text-[22px] font-normal tracking-[0.06em] text-[#EAE4DC] group-hover:text-white transition-colors">
                Rolex<span className="text-[#B86D37]">IQ</span>
              </span>
              <span className="mt-1 font-sans-ui text-[10px] tracking-[0.14em] uppercase text-[#A69A8C] hidden sm:block">
                From Potential to Proven Capability
              </span>
            </div>
          </button>

          {/* Centre: Workspace & Next Step */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-9"
          >
            <button
              type="button"
              onClick={() => setActiveModule('overview')}
              className={`relative py-1.5 font-sans-ui text-[12px] tracking-[0.18em] uppercase transition-colors ${
                activeModule === 'overview'
                  ? 'text-[#EAE4DC]'
                  : 'text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              Overview
              <span
                className={`absolute left-0 right-0 bottom-0 h-px bg-[#B86D37] transition-transform duration-300 origin-left ${
                  activeModule === 'overview' ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() =>
                setActivePopover((prev) => (prev === 'workspace' ? null : 'workspace'))
              }
              className={`relative py-1.5 font-sans-ui text-[12px] tracking-[0.18em] uppercase transition-colors ${
                activePopover === 'workspace'
                  ? 'text-[#EAE4DC]'
                  : 'text-[#A69A8C] hover:text-[#EAE4DC]'
              }`}
            >
              Workspace
              <span
                className={`absolute left-0 right-0 bottom-0 h-px bg-[#B86D37] transition-transform duration-300 origin-left ${
                  activePopover === 'workspace' ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={scrollToNextStep}
              className="relative py-1.5 font-sans-ui text-[12px] tracking-[0.18em] uppercase text-[#A69A8C] hover:text-[#EAE4DC] transition-colors group"
            >
              Next Step
              <span className="absolute left-0 right-0 bottom-0 h-px bg-[#B86D37] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </button>
          </nav>

          {/* Right: Global Search (Cmd+K), Notifications & Candidate Profile */}
          <div className="relative flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Global workspace search (Cmd+K)"
              onClick={() => {
                setActivePopover(null);
                setCommandPaletteOpen(true);
              }}
              className="h-9 px-2.5 sm:px-3 flex items-center gap-2 border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#B86D37] bg-[#1B1714] transition-colors duration-200"
            >
              <Search className="w-3.5 h-3.5 text-[#B86D37]" strokeWidth={1.5} />
              <span className="hidden lg:inline text-[10px] tracking-[0.14em] uppercase">
                Search
              </span>
              <span className="hidden xl:inline text-[9px] font-mono-tabular text-[#A69A8C]/75 border border-[#382920] px-1 py-0.5">
                ⌘K
              </span>
            </button>

            <button
              type="button"
              aria-label="Career notifications"
              aria-expanded={activePopover === 'notifications'}
              onClick={() =>
                setActivePopover((prev) =>
                  prev === 'notifications' ? null : 'notifications'
                )
              }
              className={`relative h-9 w-9 flex items-center justify-center border transition-colors duration-200 ${
                activePopover === 'notifications'
                  ? 'border-[#B86D37] text-[#EAE4DC] bg-[#211A16]'
                  : 'border-transparent text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#382920]'
              }`}
            >
              <Bell className="w-4 h-4" strokeWidth={1.4} />
              {activeGapCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#B86D37]"
                />
              )}
            </button>

            <button
              type="button"
              aria-label="Candidate profile and sync"
              aria-expanded={activePopover === 'profile'}
              onClick={() =>
                setActivePopover((prev) => (prev === 'profile' ? null : 'profile'))
              }
              className={`h-9 w-9 flex items-center justify-center border transition-colors duration-200 ${
                activePopover === 'profile'
                  ? 'border-[#B86D37] text-[#EAE4DC] bg-[#211A16]'
                  : 'border-[#382920] text-[#EAE4DC] hover:border-[#B86D37]'
              }`}
            >
              <User className="w-4 h-4" strokeWidth={1.4} />
            </button>

            <AnimatePresence>
              {activePopover === 'notifications' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="absolute right-0 top-12 w-80 bg-[#12100F] border border-[#382920] p-4 shadow-2xl z-40"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#382920]">
                    <span className="font-sans-ui text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                      Career Signals
                    </span>
                    <button
                      type="button"
                      onClick={() => setActivePopover(null)}
                      aria-label="Close signals"
                      className="text-[#A69A8C] hover:text-[#EAE4DC]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="pt-3 space-y-3 text-xs">
                    <div className="p-2.5 bg-[#1B1714] border border-[#382920] space-y-1">
                      <div className="text-[10px] tracking-[0.14em] uppercase text-[#B86D37]">
                        Next Recommended Action
                      </div>
                      <div className="text-[#EAE4DC]">{nextBestStep.title}</div>
                      <button
                        type="button"
                        onClick={executeNextBestStep}
                        className="text-[11px] text-[#B86D37] hover:underline inline-flex items-center gap-1 pt-0.5"
                      >
                        <span>{nextBestStep.ctaLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#A69A8C]">
                      <span>Readiness Benchmark</span>
                      <span className="font-mono-tabular text-[#EAE4DC]">{readinessPct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#A69A8C]">
                      <span>Journey Checkpoints</span>
                      <span className="font-mono-tabular text-[#EAE4DC]">
                        {completedCheckpoints} / 15
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {activePopover === 'profile' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="absolute right-0 top-12 w-80 bg-[#12100F] border border-[#382920] p-4 shadow-2xl z-40 space-y-3"
                >
                  <div className="pb-3 border-b border-[#382920]">
                    <div className="font-editorial text-xl text-[#EAE4DC]">
                      {store.profile?.name || 'Candidate Workspace'}
                    </div>
                    <div className="mt-0.5 text-[10px] tracking-[0.14em] uppercase text-[#B86D37]">
                      {primaryRoleLabel}
                    </div>
                    <div className="mt-1.5 text-[11px] text-[#A69A8C] flex items-center gap-1.5">
                      {storageMode === 'firestore' ? (
                        <>
                          <Cloud className="w-3 h-3 text-[#B86D37]" />
                          <span>Synced to Cloud ({user?.email || 'Google'})</span>
                        </>
                      ) : (
                        <>
                          <CloudOff className="w-3 h-3 text-[#A69A8C]" />
                          <span>Stored locally on this device</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs">
                    {user ? (
                      <button
                        type="button"
                        onClick={() => {
                          void signOutUser();
                          setActivePopover(null);
                        }}
                        className="text-left py-1.5 text-[#EAE4DC] hover:text-[#B86D37] inline-flex items-center justify-between"
                      >
                        <span>Sign out ({user.displayName || user.email})</span>
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void signInWithGoogle();
                          setActivePopover(null);
                        }}
                        className="text-left py-1.5 text-[#EAE4DC] hover:text-[#B86D37] inline-flex items-center justify-between"
                      >
                        <span>Sign in with Google to Sync</span>
                        <LogIn className="w-3.5 h-3.5 text-[#B86D37]" />
                      </button>
                    )}

                    {!store.resumeVersions.length && !store.jobDescriptions.length ? (
                      <button
                        type="button"
                        onClick={() => {
                          void loadDemoCandidate();
                          setActivePopover(null);
                        }}
                        className="text-left py-1.5 text-[#B86D37] hover:underline inline-flex items-center justify-between"
                      >
                        <span>Explore Sample Demo Workspace</span>
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    ) : store.isDemoData ? (
                      <button
                        type="button"
                        onClick={() => {
                          void clearDemoData();
                          setActivePopover(null);
                        }}
                        className="text-left py-1.5 text-[#A69A8C] hover:text-[#EAE4DC]"
                      >
                        Clear Sample Demo Data
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setActivePopover(null);
                        setActiveModule('settings');
                      }}
                      className="text-left py-1.5 text-[#A69A8C] hover:text-[#EAE4DC] inline-flex items-center justify-between"
                    >
                      <span>Workspace Settings & Export</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* =========================================================
            SLIM HORIZONTAL 13-MODULE RIBBON (ZERO SIDEBAR)
            ========================================================= */}
        <div className="border-t border-[#382920] bg-[#1B1714]/90">
          <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 flex items-center justify-between gap-4">
            <nav
              aria-label="Workspace modules"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1"
            >
              {MODULE_TABS.map((m) => {
                const active = activeModule === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveModule(m.id)}
                    className={`relative whitespace-nowrap px-3 py-2 text-[11px] tracking-[0.11em] uppercase transition-colors shrink-0 ${
                      active
                        ? 'text-[#EAE4DC] font-medium'
                        : 'text-[#A69A8C] hover:text-[#EAE4DC]'
                    }`}
                  >
                    <span>{m.label}</span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-3 right-3 bottom-0 h-[1.5px] bg-[#B86D37]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => setReadinessDrawerOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 shrink-0 py-1.5 px-3 border border-[#382920] hover:border-[#B86D37] bg-[#12100F] text-[11px] font-mono-tabular text-[#EAE4DC] transition-colors"
            >
              <span className="text-[#A69A8C] uppercase tracking-[0.1em] text-[10px]">
                Readiness
              </span>
              <span className="text-[#B86D37] font-semibold">{readinessPct}%</span>
            </button>
          </div>
        </div>

        {/* =========================================================
            PERSISTENCE TRANSPARENCY & DEMO STATUS STRIP
            ========================================================= */}
        {(storageMode === 'indexeddb' || store.isDemoData || storageNotice) && (
          <div className="border-t border-[#382920]/70 bg-[#12100F] px-6 sm:px-10 lg:px-14 py-1.5">
            <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#A69A8C]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {storageMode === 'indexeddb' && (
                  <span>
                    <strong className="text-[#EAE4DC] font-medium">
                      Data is stored only on this device.
                    </strong>{' '}
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="text-[#B86D37] hover:underline ml-1"
                    >
                      Sign in with Google to sync
                    </button>
                  </span>
                )}
                {store.isDemoData && (
                  <span className="text-[#B86D37]">
                    Sample demo workspace active ({store.profile?.name || 'Maya Lin'})
                  </span>
                )}
                {storageNotice && <span className="text-[#EAE4DC]">{storageNotice}</span>}
              </div>

              {store.isDemoData && (
                <button
                  type="button"
                  onClick={() => void clearDemoData()}
                  className="text-[10px] tracking-[0.14em] uppercase text-[#EAE4DC] hover:text-[#B86D37]"
                >
                  Clear sample data
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* =========================================================
          MAIN CONTENT: PRESERVED OVERVIEW HERO OR ACTIVE MODULE
          ========================================================= */}
      {activeModule === 'overview' ? (
        <main id="top" className="relative flex-1 flex flex-col">
          {/* 2. FULL-SCREEN CINEMATIC HERO (~80% OF DESKTOP VIEWPORT) */}
          <section
            aria-label="RolexIQ Cinematic Hero"
            className="relative w-full min-h-[580px] lg:h-[calc(80vh-116px)] lg:min-h-[560px] lg:max-h-[760px] overflow-hidden bg-[#12100F]"
          >
            {/* Full-environment 3D WebGL scene */}
            <div className="absolute inset-0 z-0">
              <ArchitecturalSculptureScene
                reducedMotion={prefersReducedMotion}
                onReady={handleSceneReady}
              />
            </div>

            {/* Crisp atmospheric contrast scrim */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-[#12100F]/92 via-[#12100F]/82 to-[#12100F]/92 lg:bg-gradient-to-r lg:from-[#12100F] lg:via-[#12100F]/78 lg:to-transparent lg:w-[58%]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 z-10 bg-gradient-to-t from-[#12100F] to-transparent"
            />

            {/* Hero Foreground Layout */}
            <div className="pointer-events-none relative z-20 max-w-[1440px] mx-auto h-full px-6 sm:px-10 lg:px-14 py-12 lg:py-0 flex flex-col justify-center">
              <div className="pointer-events-auto max-w-[540px]">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-3 mb-5"
                >
                  <span className="h-px w-7 bg-[#B86D37]" />
                  <span className="font-sans-ui text-[11px] font-medium tracking-[0.26em] uppercase text-[#B86D37]">
                    CAREER INTELLIGENCE
                  </span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.85,
                    delay: 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="font-editorial font-light text-[42px] sm:text-[54px] lg:text-[62px] xl:text-[68px] leading-[0.98] tracking-[-0.015em] text-[#EAE4DC]"
                >
                  <span className="block">YOUR NEXT</span>
                  <span className="block">CAREER MOVE.</span>
                  <span className="block mt-1.5 text-[#EAE4DC]/92 italic font-light">
                    BEGINS WITH CLARITY.
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.75,
                    delay: 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="mt-6 font-sans-ui text-[14px] sm:text-[15px] font-light leading-[1.7] text-[#A69A8C] max-w-[44ch]"
                >
                  Understand your strengths, discover what companies expect and
                  build the capabilities behind your next opportunity.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.7,
                    delay: 0.26,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="mt-7 flex items-center gap-2.5 font-sans-ui text-[11px] tracking-[0.18em] uppercase"
                >
                  <span className="text-[#A69A8C]">Target role:</span>
                  <button
                    type="button"
                    onClick={() => setActivePopover('workspace')}
                    className="text-[#EAE4DC] border-b border-[#B86D37]/60 hover:border-[#B86D37] pb-0.5 transition-colors"
                  >
                    {primaryRoleLabel}
                  </button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.75,
                    delay: 0.34,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="mt-8 flex flex-wrap items-center gap-4 sm:gap-5"
                >
                  <motion.button
                    type="button"
                    whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                    onClick={executeNextBestStep}
                    className="group relative inline-flex items-center gap-3 px-6 py-3.5 bg-[#211A16] border border-[#B86D37]/75 hover:border-[#B86D37] hover:bg-[#382920] text-[#EAE4DC] font-sans-ui text-[12px] font-medium tracking-[0.14em] uppercase transition-all duration-300"
                  >
                    <span>Continue your journey</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B86D37] transition-transform duration-300 group-hover:translate-x-1" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                    onClick={() => setActivePopover('explore')}
                    className="inline-flex items-center px-6 py-3.5 border border-[#382920] hover:border-[#A69A8C]/60 text-[#EAE4DC] font-sans-ui text-[12px] font-normal tracking-[0.14em] uppercase transition-colors duration-300"
                  >
                    Explore RolexIQ
                  </motion.button>
                </motion.div>
              </div>

              <div
                className={`pointer-events-none hidden lg:flex items-center gap-2.5 absolute right-14 bottom-6 font-sans-ui text-[10px] tracking-[0.22em] uppercase text-[#A69A8C]/75 transition-opacity duration-700 ${
                  sceneReady ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <span className="h-px w-5 bg-[#B86D37]/60" />
                <span>Drag sculpture to rotate</span>
              </div>
            </div>
          </section>

          {/* 3. NARROW SUPPORTING SECTION BENEATH THE HERO (DYNAMIC NEXT BEST STEP) */}
          <section
            ref={nextStepRef}
            id="next-best-step"
            aria-label="Your next best step"
            className="relative z-20 w-full bg-[#12100F] border-t border-[#B86D37]/30"
          >
            <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 py-7 lg:py-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex flex-col md:flex-row md:items-baseline gap-3 md:gap-10">
                <span className="font-sans-ui text-[11px] font-medium tracking-[0.24em] uppercase text-[#B86D37] shrink-0">
                  {nextBestStep.stepNumber} / YOUR NEXT BEST STEP
                </span>

                <div className="space-y-1">
                  <h2 className="font-editorial text-[24px] sm:text-[28px] font-light leading-tight text-[#EAE4DC]">
                    {nextBestStep.title}
                  </h2>
                  <p className="font-sans-ui text-[13px] font-light text-[#A69A8C]">
                    {nextBestStep.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {!store.resumeVersions.length && !store.jobDescriptions.length && (
                  <button
                    type="button"
                    onClick={() => void loadDemoCandidate()}
                    className="arch-btn-secondary px-4 py-3"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Explore Demo</span>
                  </button>
                )}

                <motion.button
                  type="button"
                  whileHover={prefersReducedMotion ? undefined : { x: 2 }}
                  onClick={executeNextBestStep}
                  className="group inline-flex items-center gap-3 px-5 py-3 border border-[#382920] hover:border-[#B86D37] bg-[#211A16]/70 hover:bg-[#211A16] text-[#EAE4DC] font-sans-ui text-[12px] tracking-[0.14em] uppercase transition-colors duration-300"
                >
                  <span>{nextBestStep.ctaLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#B86D37] transition-transform duration-300 group-hover:translate-x-1" />
                </motion.button>
              </div>
            </div>
          </section>

          {/* 4. COMPACT ARCHITECTURAL READINESS SUMMARY STRIP */}
          <section
            aria-label="Workspace readiness overview"
            className="w-full bg-[#1B1714]/60 border-t border-[#382920]"
          >
            <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 py-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <button
                type="button"
                onClick={() => setReadinessDrawerOpen(true)}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Readiness
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#B86D37] mt-1">
                  {readinessPct}%
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">Inspect audit →</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('company-dna')}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Target JDs
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
                  {store.jobDescriptions.length}
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">
                  {store.companies.length} companies
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('gaps')}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Priority Gaps
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
                  {activeGapCount}
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">Explore matrix →</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('preparation')}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Prep Resources
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
                  {store.learningResources.length}
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">Dual-track prep →</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('interview')}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Mock Interviews
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
                  {scoredInterviews.length}
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">
                  {scoredInterviews[scoredInterviews.length - 1]?.report
                    ? `Latest ${scoredInterviews[scoredInterviews.length - 1].report!.overallScore}/100`
                    : 'Enter arena →'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('applications')}
                className="text-left p-4 bg-[#12100F] border border-[#382920] hover:border-[#B86D37] transition-colors"
              >
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                  Applications
                </div>
                <div className="font-mono-tabular text-2xl font-light text-[#EAE4DC] mt-1">
                  {analytics.total}
                </div>
                <div className="text-[11px] text-[#A69A8C] mt-0.5">
                  {analytics.responses} responses
                </div>
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 py-8 sm:py-10">
          {activeModule === 'resume' && <ResumeModule />}
          {activeModule === 'company-dna' && <CompanyDnaModule />}
          {activeModule === 'gaps' && <GapExplorerModule />}
          {activeModule === 'preparation' && <PreparationStudioModule />}
          {activeModule === 'roadmap' && <RoadmapModule />}
          {activeModule === 'portfolio' && <PortfolioModule />}
          {activeModule === 'interview' && <InterviewArenaModule />}
          {activeModule === 'progress' && <ProgressModule />}
          {activeModule === 'applications' && <ApplicationsModule />}
          {activeModule === 'linkedin' && <LinkedInStudioModule />}
          {activeModule === 'reports' && <ReportsModule />}
          {activeModule === 'settings' && <SettingsModule />}
        </main>
      )}

      {/* =========================================================
          MINIMAL ARCHITECTURAL DRAWERS (WORKSPACE / EXPLORE)
          ========================================================= */}
      <AnimatePresence>
        {(activePopover === 'explore' || activePopover === 'workspace') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex justify-end bg-[#12100F]/80"
            onClick={() => setActivePopover(null)}
          >
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg h-full bg-[#12100F] border-l border-[#382920] p-7 sm:p-10 overflow-y-auto flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-6 border-b border-[#382920]">
                  <span className="font-sans-ui text-[11px] tracking-[0.22em] uppercase text-[#B86D37]">
                    {activePopover === 'explore'
                      ? 'Architecture of Clarity'
                      : 'RolexIQ Workspace Switcher'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePopover(null)}
                    aria-label="Close panel"
                    className="h-8 w-8 flex items-center justify-center border border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC] hover:border-[#B86D37] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activePopover === 'explore' && (
                  <div className="mt-8 space-y-8">
                    <div>
                      <h3 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                        From Potential to Proven Capability.
                      </h3>
                      <p className="mt-3 text-sm font-light leading-relaxed text-[#A69A8C]">
                        RolexIQ connects every stage of your career pivot into one evidence-backed
                        spine — zero mock numbers, zero fabricated claims.
                      </p>
                    </div>
                    <div className="divide-y divide-[#382920]">
                      {(
                        [
                          [
                            '01',
                            'Understand your baseline',
                            'Extract and edit your resume, turning claimed skills into auditable evidence.',
                            'resume',
                          ],
                          [
                            '02',
                            'Decode target organisations',
                            'Compare real job descriptions across companies to separate universal role skills from company-specific focus.',
                            'company-dna',
                          ],
                          [
                            '03',
                            'Master & demonstrate gaps',
                            'Use Preparation Studio, Weekly Roadmap, and Portfolio Studio to ship concrete proof.',
                            'preparation',
                          ],
                          [
                            '04',
                            'Practise & measure readiness',
                            'Run Gemini Live & rubric-scored mock interviews, log applications, and export executive reports.',
                            'interview',
                          ],
                        ] as Array<[string, string, string, ModuleId]>
                      ).map(([num, title, desc, target]) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => {
                            setActivePopover(null);
                            setActiveModule(target);
                          }}
                          className="w-full py-5 text-left space-y-1.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] tracking-[0.22em] text-[#B86D37]">
                              {num}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#B86D37] opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                          </div>
                          <div className="font-editorial text-xl text-[#EAE4DC] group-hover:text-white">
                            {title}
                          </div>
                          <p className="text-xs font-light leading-relaxed text-[#A69A8C]">
                            {desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activePopover === 'workspace' && (
                  <div className="mt-8 space-y-6">
                    <div>
                      <h3 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                        Active Calibration
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-[#A69A8C]">
                        Jump directly to any workspace module or select your primary target role focus.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                        Target Role Focus
                      </div>
                      <div className="divide-y divide-[#382920] border border-[#382920]">
                        {PRESET_TARGET_ROLES.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                              setRoleDraft(role);
                              setActivePopover(null);
                              setActiveModule('company-dna');
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between text-left group hover:bg-[#1B1714]"
                          >
                            <span className="text-xs tracking-[0.14em] uppercase text-[#EAE4DC]">
                              {role}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#B86D37]" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] tracking-[0.18em] uppercase text-[#A69A8C]">
                        Quick Navigation
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {MODULE_TABS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setActivePopover(null);
                              setActiveModule(m.id);
                            }}
                            className="px-3 py-2.5 text-left text-xs border border-[#382920] bg-[#1B1714] hover:border-[#B86D37] text-[#EAE4DC]"
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-[#382920] text-[10px] tracking-[0.2em] uppercase text-[#A69A8C]/70">
                RolexIQ — Career Intelligence Platform
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <ReadinessDrawer />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <CareerStoreProvider>
          <RolexIqPlatformShell />
        </CareerStoreProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
