import type {
  Application,
  CareerStore,
  Gap,
  ReadinessSnapshot,
  ResumeVersion,
} from './schemas';

export interface AnalyticsGroupRow {
  groupKey: string;
  groupLabel: string;
  total: number;
  responses: number;
  interviews: number;
  offers: number;
  rejections: number;
  responseRate: number | null;
  interviewRate: number | null;
  insufficientSample: boolean;
  caveat: string;
  applicationIds: string[];
}

export interface ApplicationAnalyticsResult {
  total: number;
  overallEnoughData: boolean;
  overallMessage: string;
  responses: number;
  interviewInvitations: number;
  rejections: number;
  offers: number;
  responseRate: number | null;
  interviewConversionRate: number | null;
  byRoleCategory: AnalyticsGroupRow[];
  byCompanyCategory: AnalyticsGroupRow[];
  byChannel: AnalyticsGroupRow[];
  byReferral: AnalyticsGroupRow[];
  byResumeVersion: AnalyticsGroupRow[];
  recommendations: Array<{
    title: string;
    detail: string;
    actionModule: 'interview' | 'resume' | 'gap' | 'company';
    actionLabel: string;
  }>;
}

const RESPONSE_STATUSES = new Set([
  'under_review',
  'assessment',
  'interview',
  'offer',
  'rejected',
]);

const INTERVIEW_STATUSES = new Set(['interview', 'offer']);

function buildGroupRows(
  apps: Application[],
  keyFn: (a: Application) => { key: string; label: string }
): AnalyticsGroupRow[] {
  const map = new Map<string, { label: string; items: Application[] }>();
  for (const app of apps) {
    const { key, label } = keyFn(app);
    const existing = map.get(key);
    if (existing) {
      existing.items.push(app);
    } else {
      map.set(key, { label, items: [app] });
    }
  }

  const rows: AnalyticsGroupRow[] = [];
  for (const [groupKey, { label, items }] of map.entries()) {
    const total = items.length;
    const responses = items.filter(
      (a) =>
        RESPONSE_STATUSES.has(a.status) ||
        a.history.some((h) => RESPONSE_STATUSES.has(h.status))
    ).length;
    const interviews = items.filter(
      (a) =>
        INTERVIEW_STATUSES.has(a.status) ||
        a.history.some((h) => INTERVIEW_STATUSES.has(h.status))
    ).length;
    const offers = items.filter((a) => a.status === 'offer').length;
    const rejections = items.filter((a) => a.status === 'rejected').length;

    const insufficientSample = total < 5;
    rows.push({
      groupKey,
      groupLabel: label,
      total,
      responses,
      interviews,
      offers,
      rejections,
      responseRate: total > 0 ? Number((responses / total).toFixed(3)) : null,
      interviewRate: total > 0 ? Number((interviews / total).toFixed(3)) : null,
      insufficientSample,
      caveat: insufficientSample
        ? 'Not enough data to see a pattern (minimum n=5 per group)'
        : `Associative pattern observed across n=${total} applications`,
      applicationIds: items.map((i) => i.id),
    });
  }

  return rows.sort((a, b) => b.total - a.total);
}

export function computeApplicationAnalytics(
  applications: Application[],
  resumeVersions: ResumeVersion[]
): ApplicationAnalyticsResult {
  const total = applications.length;
  const overallEnoughData = total >= 10;

  const responses = applications.filter(
    (a) =>
      RESPONSE_STATUSES.has(a.status) ||
      a.history.some((h) => RESPONSE_STATUSES.has(h.status))
  ).length;
  const interviewInvitations = applications.filter(
    (a) =>
      INTERVIEW_STATUSES.has(a.status) ||
      a.history.some((h) => INTERVIEW_STATUSES.has(h.status))
  ).length;
  const rejections = applications.filter((a) => a.status === 'rejected').length;
  const offers = applications.filter((a) => a.status === 'offer').length;

  const responseRate = total > 0 ? Number((responses / total).toFixed(3)) : null;
  const interviewConversionRate =
    total > 0 ? Number((interviewInvitations / total).toFixed(3)) : null;

  const resumeMap = new Map(resumeVersions.map((r) => [r.id, r.label]));

  const byRoleCategory = buildGroupRows(applications, (a) => {
    const normalized = a.role.trim() || 'Unspecified role';
    return { key: normalized.toLowerCase(), label: normalized };
  });

  const byCompanyCategory = buildGroupRows(applications, (a) => ({
    key: a.companyCategory,
    label:
      a.companyCategory === 'bigtech'
        ? 'Big Tech'
        : a.companyCategory === 'startup'
          ? 'Startup'
          : a.companyCategory === 'enterprise'
            ? 'Enterprise'
            : 'Other',
  }));

  const byChannel = buildGroupRows(applications, (a) => ({
    key: (a.channel || 'direct').toLowerCase(),
    label: a.channel || 'Direct',
  }));

  const byReferral = buildGroupRows(applications, (a) => ({
    key: a.referral ? 'referral' : 'no_referral',
    label: a.referral ? 'With referral' : 'Without referral',
  }));

  const byResumeVersion = buildGroupRows(applications, (a) => ({
    key: a.resumeVersionId,
    label: resumeMap.get(a.resumeVersionId) ?? 'Unknown resume version',
  }));

  const assessmentsCount = applications.filter(
    (a) => a.status === 'assessment' || a.history.some((h) => h.status === 'assessment')
  ).length;

  const recommendations: ApplicationAnalyticsResult['recommendations'] = [];
  if (!overallEnoughData) {
    recommendations.push({
      title: 'Not enough data to see a pattern',
      detail: `You have ${total} tracked application${total === 1 ? '' : 's'}. Log at least 10 total applications (and 5 per group) before drawing associative trends.`,
      actionModule: 'company',
      actionLabel: 'Review target roles',
    });
  } else {
    if (assessmentsCount >= 3 && interviewInvitations < assessmentsCount * 0.4) {
      recommendations.push({
        title: 'Assessments appear higher than interview conversions',
        detail:
          'In your data, several applications reached assessment stages without progressing to interviews. Targeted technical practice may help.',
        actionModule: 'interview',
        actionLabel: 'Practise in Interview Arena',
      });
    }
    if ((responseRate ?? 0) < 0.2) {
      recommendations.push({
        title: 'Lower overall response rate observed',
        detail:
          'In your data, fewer than 20% of applications received a stage update. Reviewing role alignment and resume keyword relevance may help.',
        actionModule: 'resume',
        actionLabel: 'Inspect Resume Intelligence',
      });
    }
  }

  return {
    total,
    overallEnoughData,
    overallMessage: overallEnoughData
      ? `Associative statistics across n=${total} applications (correlations only, not causation).`
      : `Not enough data to see a pattern (currently n=${total}; minimum n=10 overall and n=5 per subgroup).`,
    responses,
    interviewInvitations,
    rejections,
    offers,
    responseRate,
    interviewConversionRate,
    byRoleCategory,
    byCompanyCategory,
    byChannel,
    byReferral,
    byResumeVersion,
    recommendations,
  };
}

export interface SpeechFeatureResult {
  wordCount: number;
  fillerCount: number;
  fillerRatePer100Words: number;
  restartCount: number;
  wpm: number | null;
  longPauseDetected: boolean;
  suggestion: {
    feature: 'filler_rate' | 'restarts' | 'long_pause' | 'fast_pace' | 'structure';
    message: string;
    metricDetail: string;
  } | null;
}

const FILLER_REGEX = /\b(um|uh|erm|like|you know|basically|actually|sort of|kind of)\b/gi;
const RESTART_REGEX = /(\bI mean\b|\bsorry,\s*let me\b|\bwait,\b|--)/gi;

export function analyzeSpeechFeatures(
  transcript: string,
  durationSec: number,
  pauseDurationSec = 0
): SpeechFeatureResult {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const fillerMatches = transcript.match(FILLER_REGEX) ?? [];
  const restartMatches = transcript.match(RESTART_REGEX) ?? [];
  const fillerCount = fillerMatches.length;
  const restartCount = restartMatches.length;
  const fillerRatePer100Words =
    wordCount > 0 ? Number(((fillerCount / wordCount) * 100).toFixed(1)) : 0;
  const wpm =
    durationSec >= 5 && wordCount >= 10
      ? Math.round((wordCount / durationSec) * 60)
      : null;
  const longPauseDetected = pauseDurationSec >= 6;

  let suggestion: SpeechFeatureResult['suggestion'] = null;
  if (longPauseDetected) {
    suggestion = {
      feature: 'long_pause',
      message: 'Take a breath. You have time to think through your answer.',
      metricDetail: `Detected pause of ${pauseDurationSec.toFixed(1)}s`,
    };
  } else if (wpm !== null && wpm > 185) {
    suggestion = {
      feature: 'fast_pace',
      message: 'No need to rush. Try explaining your reasoning step by step.',
      metricDetail: `Estimated speaking pace ~${wpm} words/min`,
    };
  } else if (fillerRatePer100Words >= 8 && fillerCount >= 4) {
    suggestion = {
      feature: 'filler_rate',
      message: 'Would you like a few seconds to collect your thoughts?',
      metricDetail: `${fillerCount} filler phrases across ${wordCount} words (${fillerRatePer100Words}%)`,
    };
  } else if (restartCount >= 3) {
    suggestion = {
      feature: 'restarts',
      message: "You're making progress. Focus on the next point.",
      metricDetail: `${restartCount} mid-sentence restarts detected`,
    };
  }

  return {
    wordCount,
    fillerCount,
    fillerRatePer100Words,
    restartCount,
    wpm,
    longPauseDetected,
    suggestion,
  };
}

export interface CareerProgressInsights {
  hasEnoughSnapshots: boolean;
  readinessDelta: number | null;
  improvingSkills: string[];
  persistentlyWeakSkills: string[];
  overdueTasks: Array<{ weekN: number; taskText: string }>;
  recurringInterviewGaps: string[];
}

export function analyzeCareerProgress(
  snapshots: ReadinessSnapshot[],
  gaps: Gap[],
  store: CareerStore
): CareerProgressInsights {
  const hasEnoughSnapshots = snapshots.length >= 2;
  const readinessDelta = hasEnoughSnapshots
    ? Number(
        (
          snapshots[snapshots.length - 1].overallReadiness -
          snapshots[0].overallReadiness
        ).toFixed(4)
      )
    : null;

  // Improving skills: skills with >1 evidence item chronologically increasing or >= 0.65
  const skillEvidenceGroups = new Map<string, number[]>();
  for (const rec of store.evidenceRecords) {
    const score =
      rec.level === 'assessed'
        ? 0.5 + 0.5 * ((rec.score ?? 50) / 100)
        : rec.level === 'demonstrated'
          ? 0.55
          : 0.2;
    const list = skillEvidenceGroups.get(rec.skillLabel || rec.skillId) ?? [];
    list.push(score);
    skillEvidenceGroups.set(rec.skillLabel || rec.skillId, list);
  }

  const improvingSkills: string[] = [];
  for (const [label, scores] of skillEvidenceGroups.entries()) {
    if (scores.length >= 2 && scores[scores.length - 1] > scores[0]) {
      improvingSkills.push(label);
    }
  }

  const persistentlyWeakSkills = gaps
    .filter((g) => g.status === 'missing' || g.status === 'insufficient_evidence')
    .slice(0, 5)
    .map((g) => g.skillLabel);

  const overdueTasks: Array<{ weekN: number; taskText: string }> = [];
  if (store.roadmap) {
    const activeWeekIndex = store.roadmap.weeks.findIndex((w) =>
      w.tasks.some((t) => t.status === 'todo')
    );
    if (activeWeekIndex > 0) {
      for (let i = 0; i < activeWeekIndex; i++) {
        const week = store.roadmap.weeks[i];
        for (const t of week.tasks) {
          if (t.status === 'todo') {
            overdueTasks.push({ weekN: week.n, taskText: t.text });
          }
        }
      }
    }
  }

  const weakTopicCounts = new Map<string, number>();
  for (const session of store.interviewSessions) {
    for (const topic of session.report?.weakTopics ?? []) {
      const k = topic.trim();
      weakTopicCounts.set(k, (weakTopicCounts.get(k) ?? 0) + 1);
    }
  }
  const recurringInterviewGaps = Array.from(weakTopicCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([topic]) => topic);

  return {
    hasEnoughSnapshots,
    readinessDelta,
    improvingSkills,
    persistentlyWeakSkills,
    overdueTasks,
    recurringInterviewGaps,
  };
}

export interface JourneyStep {
  step: number;
  label: string;
  done: boolean;
  module: string;
}

export function computeJourneySteps(store: CareerStore, gaps: Gap[]): JourneyStep[] {
  const hasProfile = Boolean(store.profile?.careerObjective);
  const hasResume = store.resumeVersions.length > 0;
  const hasEditedResume = store.resumeVersions.some((r) => r.userEditedFields.length > 0);
  const hasCompanies = store.companies.length >= 2;
  const hasJds = store.jobDescriptions.length >= 2;
  const hasGaps = gaps.length > 0;
  const hasDemonstrated = store.evidenceRecords.some((e) => e.level === 'demonstrated');
  const hasRoadmap = Boolean(store.roadmap && store.roadmap.weeks.length > 0);
  const hasCompletedTask = Boolean(
    store.roadmap?.weeks.some((w) => w.tasks.some((t) => t.status === 'done'))
  );
  const hasPortfolioProject = store.portfolioProjects.length > 0;
  const hasVerifiedProject = store.portfolioProjects.some(
    (p) => p.status === 'evidence_submitted'
  );
  const hasInterview = store.interviewSessions.some((s) => Boolean(s.report));
  const hasProgress = store.readinessSnapshots.length >= 2;
  const hasApplications = store.applications.length > 0;
  const hasContentOrReport =
    store.linkedInPosts.length > 0 || store.reports.length > 0;

  return [
    { step: 1, label: 'Career objective set', done: hasProfile, module: 'overview' },
    { step: 2, label: 'Resume uploaded & parsed', done: hasResume, module: 'resume' },
    { step: 3, label: 'Resume verified & edited', done: hasEditedResume, module: 'resume' },
    { step: 4, label: '2+ target companies chosen', done: hasCompanies, module: 'company-dna' },
    { step: 5, label: 'Job descriptions extracted', done: hasJds, module: 'company-dna' },
    { step: 6, label: 'Skill-gap map computed', done: hasGaps, module: 'gaps' },
    { step: 7, label: 'Learning roadmap built', done: hasRoadmap, module: 'roadmap' },
    { step: 8, label: 'First roadmap task completed', done: hasCompletedTask, module: 'roadmap' },
    { step: 9, label: 'Portfolio project tailored', done: hasPortfolioProject, module: 'portfolio' },
    { step: 10, label: 'Project evidence verified', done: hasVerifiedProject || hasDemonstrated, module: 'portfolio' },
    { step: 11, label: 'Mock interview scored', done: hasInterview, module: 'interview' },
    { step: 12, label: 'Readiness trajectory tracked', done: hasProgress, module: 'progress' },
    { step: 13, label: 'Applications logged', done: hasApplications, module: 'applications' },
    { step: 14, label: 'Achievement shared or drafted', done: hasContentOrReport, module: 'linkedin' },
    { step: 15, label: 'Executive report generated', done: store.reports.length > 0, module: 'reports' },
  ];
}

export interface NextBestStep {
  stepNumber: string;
  title: string;
  description: string;
  ctaLabel: string;
  targetModule:
    | 'resume'
    | 'company-dna'
    | 'gaps'
    | 'preparation'
    | 'roadmap'
    | 'portfolio'
    | 'interview'
    | 'progress'
    | 'applications'
    | 'reports';
  skillId?: string;
}

export function computeNextBestStep(
  store: CareerStore,
  gaps: Gap[]
): NextBestStep {
  if (store.resumeVersions.length === 0) {
    return {
      stepNumber: '01',
      title: 'Upload or parse your baseline resume.',
      description:
        'Extract your current skills, experience and projects into an editable intelligence profile.',
      ctaLabel: 'Upload Resume',
      targetModule: 'resume',
    };
  }

  if (store.jobDescriptions.length === 0) {
    return {
      stepNumber: '02',
      title: 'Analyse your target job description.',
      description:
        'Discover what companies expect and identify the capabilities you need to develop.',
      ctaLabel: 'Analyse Target Role',
      targetModule: 'company-dna',
    };
  }

  if (store.jobDescriptions.length === 1) {
    return {
      stepNumber: '03',
      title: 'Add a second company to compare expectations.',
      description:
        'Cross-company comparison separates shared role mastery from organisation-specific preparation.',
      ctaLabel: 'Compare Companies',
      targetModule: 'company-dna',
    };
  }

  const topGap = gaps.find(
    (g) => g.status === 'missing' || g.status === 'insufficient_evidence' || g.status === 'developing'
  );

  if (!store.roleMasteryTrack && store.learningResources.length === 0) {
    return {
      stepNumber: '04',
      title: topGap
        ? `Build a preparation plan around ${topGap.skillLabel}.`
        : 'Initialise your role & company preparation tracks.',
      description:
        'Separate shared role fundamentals from company-specific prep and discover verified learning resources.',
      ctaLabel: 'Open Preparation Studio',
      targetModule: 'preparation',
      skillId: topGap?.skillId,
    };
  }

  if (!store.roadmap || store.roadmap.weeks.length === 0) {
    return {
      stepNumber: '05',
      title: 'Generate your adaptive weekly roadmap.',
      description:
        'Convert your highest-priority capability gaps into a concrete week-by-week execution schedule.',
      ctaLabel: 'Build Roadmap',
      targetModule: 'roadmap',
    };
  }

  const incompleteTaskCount = store.roadmap.weeks.reduce(
    (acc, w) => acc + w.tasks.filter((t) => t.status === 'todo').length,
    0
  );
  const unverifiedProject = store.portfolioProjects.find(
    (p) => p.status !== 'evidence_submitted'
  );

  if (store.portfolioProjects.length === 0 || unverifiedProject) {
    return {
      stepNumber: '06',
      title: unverifiedProject
        ? `Submit proof for ${unverifiedProject.title}.`
        : 'Generate a targeted portfolio project.',
      description:
        'Replace claimed resume bullet points with verifiable architecture deliverables and project proof.',
      ctaLabel: 'Open Portfolio Studio',
      targetModule: 'portfolio',
    };
  }

  const scoredInterviews = store.interviewSessions.filter((s) => Boolean(s.report));
  if (scoredInterviews.length === 0) {
    return {
      stepNumber: '07',
      title: 'Complete a rubric-scored mock interview.',
      description:
        'Practise aloud or via text against real company expectations and receive 100-point rubric feedback.',
      ctaLabel: 'Enter Interview Arena',
      targetModule: 'interview',
    };
  }

  if (incompleteTaskCount > 0) {
    return {
      stepNumber: '08',
      title: topGap
        ? `Close ${topGap.skillLabel} gap in Week ${store.roadmap.weeks.find((w) => w.tasks.some((t) => t.status === 'todo'))?.n ?? 1}.`
        : 'Advance your active roadmap week.',
      description: `${incompleteTaskCount} roadmap task${incompleteTaskCount === 1 ? '' : 's'} remaining to elevate your verified readiness score.`,
      ctaLabel: 'Continue Roadmap',
      targetModule: 'roadmap',
    };
  }

  if (store.applications.length === 0) {
    return {
      stepNumber: '09',
      title: 'Track applications and outcome signals.',
      description:
        'Connect resume versions, referral status, and channels to uncover which roles yield responses.',
      ctaLabel: 'Track Applications',
      targetModule: 'applications',
    };
  }

  return {
    stepNumber: '10',
    title: 'Export your executive career dossier.',
    description:
      'Review trajectory gains across skill gaps, scored interviews, and company readiness benchmarks.',
    ctaLabel: 'Open Executive Reports',
    targetModule: 'reports',
  };
}
