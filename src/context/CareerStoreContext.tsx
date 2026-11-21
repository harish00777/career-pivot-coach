import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  analyzeCareerProgress,
  computeApplicationAnalytics,
  computeJourneySteps,
  computeNextBestStep,
  type ApplicationAnalyticsResult,
  type CareerProgressInsights,
  type JourneyStep,
  type NextBestStep,
} from '../shared/analyticsEngine';
import {
  computeCareerAnalysis,
  computeCompanyMatrix,
  normalizeSkillId,
  type CompanyMatrixResult,
  type CompanyReadinessResult,
  type ReadinessBreakdownRow,
} from '../shared/evidenceEngine';
import type {
  CareerStore,
  EvidenceRecord,
  Gap,
  ReadinessSnapshot,
} from '../shared/schemas';
import { buildDemoCandidateStore } from '../services/demoData';
import { auth, googleProvider, testFirestoreConnection } from '../services/firebaseClient';
import {
  EMPTY_CAREER_STORE,
  FirestoreRepository,
  IndexedDBRepository,
  type CareerRepository,
} from '../services/repository';

export type ModuleId =
  | 'overview'
  | 'resume'
  | 'company-dna'
  | 'gaps'
  | 'preparation'
  | 'roadmap'
  | 'portfolio'
  | 'interview'
  | 'progress'
  | 'applications'
  | 'linkedin'
  | 'reports'
  | 'settings';

export interface PrepPreset {
  skill?: string;
  companyId?: string;
  tab?: 'role' | 'company' | 'resources';
}

interface CareerContextValue {
  store: CareerStore;
  loading: boolean;
  storageMode: 'firestore' | 'indexeddb';
  storageNotice: string | null;
  user: User | null;
  authReady: boolean;
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
  selectedGapSkillId: string | null;
  setSelectedGapSkillId: (skillId: string | null) => void;
  interviewPreset: { companyId?: string; roleId?: string; focus?: string } | null;
  setInterviewPreset: (preset: { companyId?: string; roleId?: string; focus?: string } | null) => void;
  prepPreset: PrepPreset | null;
  setPrepPreset: (preset: PrepPreset | null) => void;
  readinessDrawerOpen: boolean;
  setReadinessDrawerOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  updateStore: (
    updater: (prev: CareerStore) => CareerStore,
    snapshotTrigger?: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  loadDemoCandidate: () => Promise<void>;
  clearDemoData: () => Promise<void>;
  deleteAllData: () => Promise<void>;
  exportAllJson: () => void;
  analysis: {
    overallReadiness: number;
    totalWeight: number;
    totalWeightedScore: number;
    overallBreakdown: ReadinessBreakdownRow[];
    companyReadiness: Record<string, CompanyReadinessResult>;
    gaps: Gap[];
  };
  matrix: CompanyMatrixResult;
  journeySteps: JourneyStep[];
  analytics: ApplicationAnalyticsResult;
  progressInsights: CareerProgressInsights;
  nextBestStep: NextBestStep;
}

const CareerStoreContext = createContext<CareerContextValue | null>(null);

export function CareerStoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<CareerStore>(EMPTY_CAREER_STORE);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreAvailable, setFirestoreAvailable] = useState(true);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [activeModule, setActiveModuleState] = useState<ModuleId>('overview');
  const [selectedGapSkillId, setSelectedGapSkillId] = useState<string | null>(null);
  const [interviewPreset, setInterviewPreset] = useState<{
    companyId?: string;
    roleId?: string;
    focus?: string;
  } | null>(null);
  const [prepPreset, setPrepPreset] = useState<PrepPreset | null>(null);
  const [readinessDrawerOpen, setReadinessDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const repoRef = useRef<CareerRepository>(new IndexedDBRepository());

  const setActiveModule = useCallback((id: ModuleId) => {
    setActiveModuleState(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!mounted) return;
      setUser(nextUser);
      setAuthReady(true);

      let canUseFirestore = false;
      if (nextUser) {
        canUseFirestore = await testFirestoreConnection();
        if (mounted) setFirestoreAvailable(canUseFirestore);
      } else if (mounted) {
        setFirestoreAvailable(true);
      }

      const repo: CareerRepository =
        nextUser && canUseFirestore
          ? new FirestoreRepository(nextUser.uid)
          : new IndexedDBRepository();
      repoRef.current = repo;

      try {
        const loaded = await repo.load();
        if (!mounted) return;
        const autostart = new URLSearchParams(window.location.search).get('autostart') === '1';
        if (loaded) {
          setStore(autostart && !loaded.onboardingComplete ? { ...loaded, onboardingComplete: true } : loaded);
        } else if (autostart) {
          const demo = buildDemoCandidateStore();
          setStore(demo);
          await repo.save(demo);
        } else {
          setStore(EMPTY_CAREER_STORE);
        }
        setStorageNotice(null);
      } catch (err) {
        if (mounted) {
          setStorageNotice(
            err instanceof Error ? err.message : 'Unable to load saved workspace.'
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const storageMode: 'firestore' | 'indexeddb' =
    user && firestoreAvailable ? 'firestore' : 'indexeddb';

  const updateStore = useCallback(
    async (updater: (prev: CareerStore) => CareerStore, snapshotTrigger?: string) => {
      let computedNext: CareerStore | null = null;
      setStore((prev) => {
        const draft = updater(prev);
        if (snapshotTrigger && draft.jobDescriptions.length > 0) {
          const nextAnalysis = computeCareerAnalysis({
            companies: draft.companies,
            targetRoles: draft.targetRoles,
            jobDescriptions: draft.jobDescriptions,
            evidenceRecords: draft.evidenceRecords,
            targetWeeks: draft.profile?.targetWeeks ?? 12,
            gapExplanations: draft.gapExplanations,
          });
          const companyReadinessNums: Record<string, number> = {};
          for (const [cid, cr] of Object.entries(nextAnalysis.companyReadiness)) {
            companyReadinessNums[cid] = cr.readiness;
          }
          const snap: ReadinessSnapshot = {
            id: `snap-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            overallReadiness: nextAnalysis.overallReadiness,
            companyReadiness: companyReadinessNums,
            strongCount: nextAnalysis.gaps.filter((g) => g.status === 'strong').length,
            developingCount: nextAnalysis.gaps.filter((g) => g.status === 'developing').length,
            insufficientCount: nextAnalysis.gaps.filter(
              (g) => g.status === 'insufficient_evidence'
            ).length,
            missingCount: nextAnalysis.gaps.filter((g) => g.status === 'missing').length,
            trigger: snapshotTrigger,
          };
          const prevSnaps = draft.readinessSnapshots;
          const lastSnap = prevSnaps[prevSnaps.length - 1];
          const shouldAppend =
            !lastSnap ||
            Math.abs(lastSnap.overallReadiness - snap.overallReadiness) >= 0.001 ||
            lastSnap.trigger !== snap.trigger;
          computedNext = shouldAppend
            ? { ...draft, readinessSnapshots: [...prevSnaps.slice(-199), snap] }
            : draft;
        } else {
          computedNext = draft;
        }
        return computedNext;
      });

      if (computedNext) {
        try {
          await repoRef.current.save(computedNext);
          setStorageNotice(null);
        } catch (err) {
          setStorageNotice(
            err instanceof Error ? err.message : 'Failed to persist latest changes.'
          );
        }
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      setStorageNotice(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setStorageNotice(
        err instanceof Error
          ? `Google sign-in failed: ${err.message}`
          : 'Google sign-in failed. Data remains safely stored on this device.'
      );
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const loadDemoCandidate = useCallback(async () => {
    const demo = buildDemoCandidateStore();
    setStore(demo);
    try {
      await repoRef.current.save(demo);
      setStorageNotice(null);
    } catch (err) {
      setStorageNotice(err instanceof Error ? err.message : 'Could not save demo data.');
    }
  }, []);

  const clearDemoData = useCallback(async () => {
    setStore(EMPTY_CAREER_STORE);
    await repoRef.current.clear();
  }, []);

  const deleteAllData = useCallback(async () => {
    setStore(EMPTY_CAREER_STORE);
    await repoRef.current.clear();
    const idb = new IndexedDBRepository();
    await idb.clear();
    setActiveModule('overview');
  }, [setActiveModule]);

  const exportAllJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rolexiq-career-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const analysis = useMemo(
    () =>
      computeCareerAnalysis({
        companies: store.companies,
        targetRoles: store.targetRoles,
        jobDescriptions: store.jobDescriptions,
        evidenceRecords: store.evidenceRecords,
        targetWeeks: store.profile?.targetWeeks ?? 12,
        gapExplanations: store.gapExplanations,
      }),
    [
      store.companies,
      store.targetRoles,
      store.jobDescriptions,
      store.evidenceRecords,
      store.profile?.targetWeeks,
      store.gapExplanations,
    ]
  );

  const matrix = useMemo(
    () => computeCompanyMatrix(store.companies, store.targetRoles, store.jobDescriptions),
    [store.companies, store.targetRoles, store.jobDescriptions]
  );

  const journeySteps = useMemo(() => computeJourneySteps(store, analysis.gaps), [store, analysis.gaps]);

  const analytics = useMemo(
    () => computeApplicationAnalytics(store.applications, store.resumeVersions),
    [store.applications, store.resumeVersions]
  );

  const progressInsights = useMemo(
    () => analyzeCareerProgress(store.readinessSnapshots, analysis.gaps, store),
    [store.readinessSnapshots, analysis.gaps, store]
  );

  const nextBestStep = useMemo(
    () => computeNextBestStep(store, analysis.gaps),
    [store, analysis.gaps]
  );

  const value: CareerContextValue = {
    store,
    loading,
    storageMode,
    storageNotice,
    user,
    authReady,
    activeModule,
    setActiveModule,
    selectedGapSkillId,
    setSelectedGapSkillId,
    interviewPreset,
    setInterviewPreset,
    prepPreset,
    setPrepPreset,
    readinessDrawerOpen,
    setReadinessDrawerOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    updateStore,
    signInWithGoogle,
    signOutUser,
    loadDemoCandidate,
    clearDemoData,
    deleteAllData,
    exportAllJson,
    analysis,
    matrix,
    journeySteps,
    analytics,
    progressInsights,
    nextBestStep,
  };

  return <CareerStoreContext.Provider value={value}>{children}</CareerStoreContext.Provider>;
}

export function useCareerStore() {
  const ctx = useContext(CareerStoreContext);
  if (!ctx) {
    throw new Error('useCareerStore must be used inside CareerStoreProvider');
  }
  return ctx;
}

export function buildClaimedRecordsFromSkills(
  skills: string[],
  sourceRef: string,
  provenance: EvidenceRecord['provenance'] = 'resume'
): EvidenceRecord[] {
  const date = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const out: EvidenceRecord[] = [];
  for (const s of skills) {
    const sid = normalizeSkillId(s);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    out.push({
      id: `ev-res-${sid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      skillId: sid,
      skillLabel: s.trim(),
      level: 'claimed',
      sourceType: 'resume',
      sourceRef,
      date,
      note: `Extracted from resume "${sourceRef}"`,
      provenance,
    });
  }
  return out;
}
