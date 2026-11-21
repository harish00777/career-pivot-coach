import { z } from 'zod';

export const ProvenanceTagSchema = z.enum([
  'resume',
  'candidate',
  'uploaded_jd',
  'public_jd',
  'project_evidence',
  'interview',
  'application',
  'ai_inference',
  'sample_demo',
]);
export type ProvenanceTag = z.infer<typeof ProvenanceTagSchema>;

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  contact: z.string(),
  careerObjective: z.string(),
  targetRoleIds: z.array(z.string()),
  hoursPerWeek: z.number().min(1).max(80),
  targetWeeks: z.number().min(1).max(104),
  createdAt: z.string(),
  provenance: ProvenanceTagSchema.default('candidate'),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ParsedResumeSchema = z.object({
  education: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  experience: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([]),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export const ResumeVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  roleId: z.string().optional(),
  rawText: z.string(),
  parsed: ParsedResumeSchema,
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  userEditedFields: z.array(z.string()).default([]),
  createdAt: z.string(),
  provenance: ProvenanceTagSchema.default('resume'),
});
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>;

export const CompanyCategorySchema = z.enum(['bigtech', 'startup', 'enterprise', 'other']);
export type CompanyCategory = z.infer<typeof CompanyCategorySchema>;

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CompanyCategorySchema,
  provenance: ProvenanceTagSchema.default('candidate'),
});
export type Company = z.infer<typeof CompanySchema>;

export const TargetRoleSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  title: z.string(),
  provenance: ProvenanceTagSchema.default('candidate'),
});
export type TargetRole = z.infer<typeof TargetRoleSchema>;

export const RequirementCategorySchema = z.enum(['technical', 'role', 'professional']);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

export const RequirementLevelSchema = z.enum(['required', 'preferred']);
export type RequirementLevel = z.infer<typeof RequirementLevelSchema>;

export const RequirementSchema = z.object({
  id: z.string(),
  skill: z.string(),
  category: RequirementCategorySchema,
  level: RequirementLevelSchema,
  quote: z.string(),
  basis: z.enum(['explicit', 'inferred']),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const JobDescriptionSourceSchema = z.object({
  type: z.enum(['url', 'pasted', 'uploaded']),
  url: z.string().optional(),
  fileName: z.string().optional(),
  fetchedAt: z.string(),
  status: z.enum(['ok', 'partial', 'failed']),
  errorMessage: z.string().optional(),
});
export type JobDescriptionSource = z.infer<typeof JobDescriptionSourceSchema>;

export const JobDescriptionSchema = z.object({
  id: z.string(),
  targetRoleId: z.string(),
  source: JobDescriptionSourceSchema,
  rawText: z.string(),
  location: z.string().optional(),
  experience: z.string().optional(),
  education: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(RequirementSchema).default([]),
  behavioural: z.array(z.string()).default([]),
  provenance: ProvenanceTagSchema.default('uploaded_jd'),
});
export type JobDescription = z.infer<typeof JobDescriptionSchema>;

export const EvidenceLevelSchema = z.enum(['claimed', 'demonstrated', 'assessed']);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const EvidenceSourceTypeSchema = z.enum([
  'resume',
  'manual',
  'project',
  'certification',
  'interview',
  'assessment',
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  skillLabel: z.string().optional(),
  level: EvidenceLevelSchema,
  sourceType: EvidenceSourceTypeSchema,
  sourceRef: z.string(),
  date: z.string(),
  score: z.number().min(0).max(100).optional(),
  note: z.string().optional(),
  provenance: ProvenanceTagSchema.default('candidate'),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const GapStatusSchema = z.enum([
  'strong',
  'developing',
  'missing',
  'insufficient_evidence',
  'optional',
]);
export type GapStatus = z.infer<typeof GapStatusSchema>;

export const GapSchema = z.object({
  skillId: z.string(),
  skillLabel: z.string(),
  status: GapStatusSchema,
  strength: z.number().min(0).max(1),
  weight: z.number(),
  priorityScore: z.number(),
  priorityBreakdown: z.object({
    weight: z.number(),
    strengthGap: z.number(),
    dependencyBoost: z.number(),
    timelineFactor: z.number(),
  }),
  requirementRefs: z.array(
    z.object({
      jdId: z.string(),
      companyId: z.string(),
      companyName: z.string(),
      roleTitle: z.string(),
      level: RequirementLevelSchema,
      quote: z.string(),
      basis: z.enum(['explicit', 'inferred']),
      fetchedAt: z.string(),
      sourceLabel: z.string(),
    })
  ),
  evidenceRefs: z.array(z.string()),
  nextAction: z.string(),
  explanation: z.string().optional(),
});
export type Gap = z.infer<typeof GapSchema>;

export const RoadmapResourceSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  searchTerm: z.string().optional(),
  verified: z.boolean(),
});
export type RoadmapResource = z.infer<typeof RoadmapResourceSchema>;

export const RoadmapTaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['todo', 'done']),
  evidenceId: z.string().optional(),
  evidenceUrl: z.string().optional(),
  evidenceNote: z.string().optional(),
  completedAt: z.string().optional(),
});
export type RoadmapTask = z.infer<typeof RoadmapTaskSchema>;

export const RoadmapWeekSchema = z.object({
  n: z.number().int().min(1),
  objective: z.string(),
  skills: z.array(z.string()),
  topics: z.array(z.string()),
  exercises: z.array(z.string()),
  resources: z.array(RoadmapResourceSchema),
  estHours: z.number().min(0.5),
  deliverables: z.array(z.string()),
  completionCriteria: z.array(z.string()),
  evidenceToCollect: z.array(z.string()),
  tasks: z.array(RoadmapTaskSchema),
});
export type RoadmapWeek = z.infer<typeof RoadmapWeekSchema>;

export const RoadmapChangeSchema = z.object({
  id: z.string(),
  date: z.string(),
  trigger: z.string(),
  reason: z.string(),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  reprioritised: z.array(z.string()),
});
export type RoadmapChange = z.infer<typeof RoadmapChangeSchema>;

export const RoadmapSchema = z.object({
  id: z.string(),
  hoursPerWeek: z.number(),
  totalWeeks: z.number(),
  weeks: z.array(RoadmapWeekSchema),
  changes: z.array(RoadmapChangeSchema),
  updatedAt: z.string(),
  provenance: ProvenanceTagSchema.default('ai_inference'),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

export const PortfolioEvidenceSubmissionSchema = z.object({
  id: z.string(),
  url: z.string(),
  notes: z.string(),
  skillsClaimed: z.array(z.string()),
  skillsVerified: z.array(z.string()),
  verificationNotes: z.string().optional(),
  submittedAt: z.string(),
});
export type PortfolioEvidenceSubmission = z.infer<typeof PortfolioEvidenceSubmissionSchema>;

export const PortfolioProjectSchema = z.object({
  id: z.string(),
  gapSkillIds: z.array(z.string()),
  title: z.string(),
  problem: z.string(),
  relevance: z.string(),
  skills: z.array(z.string()),
  whyForRole: z.string(),
  tech: z.array(z.string()),
  dataSources: z.array(z.string()),
  architecture: z.string(),
  milestones: z.array(z.string()),
  deliverables: z.array(z.string()),
  evaluationCriteria: z.array(z.string()),
  repoStructure: z.string(),
  presentationTips: z.string(),
  evidenceableSkills: z.array(z.string()),
  status: z.enum(['not_started', 'in_progress', 'completed', 'evidence_submitted']),
  evidence: z.array(PortfolioEvidenceSubmissionSchema).default([]),
  provenance: ProvenanceTagSchema.default('ai_inference'),
});
export type PortfolioProject = z.infer<typeof PortfolioProjectSchema>;

export const InterviewTypeSchema = z.enum([
  'Technical',
  'HR',
  'Behavioural',
  'Problem-solving',
  'System design',
  'Communication/situational',
  'Mixed company-specific',
]);
export type InterviewType = z.infer<typeof InterviewTypeSchema>;

export const RubricCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number().min(0).max(100),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const InterviewTurnSchema = z.object({
  id: z.string(),
  topic: z.string(),
  skillId: z.string().optional(),
  question: z.string(),
  transcript: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  pauseDurationSec: z.number().optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

export const CoachingEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  feature: z.enum(['filler_rate', 'restarts', 'long_pause', 'fast_pace', 'structure']),
  message: z.string(),
  metricDetail: z.string(),
});
export type CoachingEvent = z.infer<typeof CoachingEventSchema>;

export const QuestionEvaluationSchema = z.object({
  turnId: z.string(),
  topic: z.string(),
  skillId: z.string().optional(),
  question: z.string(),
  transcript: z.string(),
  score: z.number().min(0).max(100),
  explanation: z.string(),
  strongPoints: z.array(z.string()),
  missingElements: z.array(z.string()),
  technicalInaccuracies: z.array(z.string()),
  improvements: z.array(z.string()),
  sampleImprovedAnswer: z.string(),
  transcriptExcerpt: z.string(),
});
export type QuestionEvaluation = z.infer<typeof QuestionEvaluationSchema>;

export const InterviewReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  practiceOutcomeLabel: z.enum([
    'Strong preparation',
    'Progressing well',
    'Needs targeted improvement',
    'Not yet ready for the next level of practice',
  ]),
  disclaimer: z.string(),
  rubricWeightsUsed: z.array(RubricCriterionSchema),
  criterionScores: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      weight: z.number(),
      earned: z.number(),
      rationale: z.string(),
    })
  ),
  questionEvaluations: z.array(QuestionEvaluationSchema),
  technicalStrengths: z.array(z.string()),
  knowledgeGaps: z.array(z.string()),
  problemSolvingAssessment: z.string(),
  communicationFeedback: z.string(),
  deliveryObservations: z.array(z.string()),
  weakTopics: z.array(z.string()),
  answerImprovements: z.array(z.string()),
  topicsToRevise: z.array(z.string()),
  practiceExercises: z.array(z.string()),
  nextInterviewStrategy: z.string(),
  comparisonWithPrevious: z.string(),
  readinessImpactNote: z.string(),
  generatedAt: z.string(),
});
export type InterviewReport = z.infer<typeof InterviewReportSchema>;

export const InterviewSessionSchema = z.object({
  id: z.string(),
  config: z.object({
    companyId: z.string(),
    roleId: z.string(),
    jdId: z.string(),
    type: InterviewTypeSchema,
    difficulty: z.enum(['Foundational', 'Standard', 'Senior', 'Stretch']),
    durationMin: z.number().min(5).max(60),
    focus: z.string(),
    coachingEnabled: z.boolean(),
    mode: z.enum(['live', 'stt_tts', 'text']),
    rubricWeights: z.array(RubricCriterionSchema).optional(),
  }),
  turns: z.array(InterviewTurnSchema),
  coachingEvents: z.array(CoachingEventSchema),
  report: InterviewReportSchema.optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  provenance: ProvenanceTagSchema.default('interview'),
});
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;

export const ApplicationStatusSchema = z.enum([
  'saved',
  'applied',
  'under_review',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationSchema = z.object({
  id: z.string(),
  company: z.string(),
  companyCategory: CompanyCategorySchema.default('other'),
  role: z.string(),
  date: z.string(),
  jdId: z.string().optional(),
  resumeVersionId: z.string(),
  referral: z.boolean(),
  channel: z.string(),
  status: ApplicationStatusSchema,
  stage: z.string().optional(),
  outcome: z.string().optional(),
  rejectionReason: z.string().optional(),
  feedback: z.string().optional(),
  notes: z.string(),
  history: z.array(
    z.object({
      status: ApplicationStatusSchema,
      date: z.string(),
    })
  ),
  provenance: ProvenanceTagSchema.default('application'),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const LinkedInPostSchema = z.object({
  id: z.string(),
  type: z.enum([
    'project_launch',
    'learning_milestone',
    'technical_explanation',
    'hackathon_summary',
    'skill_update',
    'portfolio_announcement',
    'reflection',
  ]),
  evidenceIds: z.array(z.string()),
  text: z.string(),
  createdAt: z.string(),
  manualMetrics: z
    .object({
      impressions: z.number().min(0),
      reactions: z.number().min(0),
      comments: z.number().min(0),
      date: z.string(),
    })
    .optional(),
  provenance: ProvenanceTagSchema.default('candidate'),
});
export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

export const ReportTypeSchema = z.enum([
  'candidate_profile',
  'resume_intelligence',
  'skill_gap',
  'company_preparation',
  'multi_company_comparison',
  'learning_roadmap',
  'portfolio_recommendations',
  'interview_performance',
  'career_readiness',
  'application_outcomes',
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  type: ReportTypeSchema,
  generatedAt: z.string(),
  sourceSnapshot: z.record(z.string(), z.unknown()),
});
export type Report = z.infer<typeof ReportSchema>;

export const ReadinessSnapshotSchema = z.object({
  id: z.string(),
  date: z.string(),
  overallReadiness: z.number().min(0).max(1),
  companyReadiness: z.record(z.string(), z.number()),
  strongCount: z.number(),
  developingCount: z.number(),
  insufficientCount: z.number(),
  missingCount: z.number(),
  trigger: z.string(),
});
export type ReadinessSnapshot = z.infer<typeof ReadinessSnapshotSchema>;

export const AppSettingsSchema = z.object({
  cameraDefaultOff: z.boolean().default(true),
  micDefaultOff: z.boolean().default(true),
  coachingDefaultOn: z.boolean().default(true),
  preferredVoiceMode: z.enum(['live', 'stt_tts', 'text']).default('live'),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const LearningResourceSchema = z.object({
  id: z.string(),
  skill: z.string(),
  title: z.string(),
  provider: z.string().default(''),
  resourceType: z.enum(['documentation', 'course', 'tutorial', 'article', 'video', 'practice', 'book']).default('tutorial'),
  difficulty: z.enum(['foundational', 'intermediate', 'advanced']).default('intermediate'),
  format: z.enum(['interactive', 'reading', 'video', 'project']).default('reading'),
  estimatedMinutes: z.number().min(5).max(1200).optional(),
  summary: z.string().default(''),
  whyRecommended: z.string().default(''),
  url: z.string().optional(),
  searchTerm: z.string().optional(),
  verified: z.boolean().default(false),
  status: z.enum(['saved', 'in_progress', 'completed']).default('saved'),
  notes: z.string().default(''),
  targetCompany: z.string().optional(),
  createdAt: z.string(),
  provenance: ProvenanceTagSchema.default('ai_inference'),
});
export type LearningResource = z.infer<typeof LearningResourceSchema>;

export const PrepModuleItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['core_concept', 'hands_on', 'system_design', 'behavioural', 'company_specific']).default('core_concept'),
  priority: z.enum(['critical', 'high', 'medium']).default('high'),
  skillTag: z.string(),
  summary: z.string(),
  checklist: z.array(z.string()).default([]),
  practicePrompt: z.string().default(''),
  completed: z.boolean().default(false),
});
export type PrepModuleItem = z.infer<typeof PrepModuleItemSchema>;

export const RoleMasteryTrackSchema = z.object({
  roleTitle: z.string(),
  coreCompetencies: z.array(z.string()).default([]),
  sharedCompanyThemes: z.array(z.string()).default([]),
  modules: z.array(PrepModuleItemSchema).default([]),
  generatedAt: z.string(),
});
export type RoleMasteryTrack = z.infer<typeof RoleMasteryTrackSchema>;

export const CompanyPrepTrackSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  roleTitle: z.string(),
  jdId: z.string(),
  companyFocusSummary: z.string().default(''),
  sharedSkills: z.array(z.string()).default([]),
  companySpecificSkills: z.array(z.string()).default([]),
  interviewFormatNotes: z.array(z.string()).default([]),
  modules: z.array(PrepModuleItemSchema).default([]),
  generatedAt: z.string(),
});
export type CompanyPrepTrack = z.infer<typeof CompanyPrepTrackSchema>;

export const CareerStoreSchema = z.object({
  version: z.number().default(1),
  onboardingComplete: z.boolean().default(false),
  isDemoData: z.boolean().default(false),
  profile: ProfileSchema.nullable().default(null),
  resumeVersions: z.array(ResumeVersionSchema).default([]),
  activeResumeId: z.string().nullable().default(null),
  companies: z.array(CompanySchema).default([]),
  targetRoles: z.array(TargetRoleSchema).default([]),
  jobDescriptions: z.array(JobDescriptionSchema).default([]),
  evidenceRecords: z.array(EvidenceRecordSchema).default([]),
  gapExplanations: z.record(z.string(), z.string()).default({}),
  companyDnaNarrative: z.string().nullable().default(null),
  roadmap: RoadmapSchema.nullable().default(null),
  portfolioProjects: z.array(PortfolioProjectSchema).default([]),
  interviewSessions: z.array(InterviewSessionSchema).default([]),
  applications: z.array(ApplicationSchema).default([]),
  linkedInPosts: z.array(LinkedInPostSchema).default([]),
  reports: z.array(ReportSchema).default([]),
  readinessSnapshots: z.array(ReadinessSnapshotSchema).default([]),
  learningResources: z.array(LearningResourceSchema).default([]),
  roleMasteryTrack: RoleMasteryTrackSchema.nullable().default(null),
  companyPrepTracks: z.record(z.string(), CompanyPrepTrackSchema).default({}),
  settings: AppSettingsSchema.default({
    cameraDefaultOff: true,
    micDefaultOff: true,
    coachingDefaultOn: true,
    preferredVoiceMode: 'live',
  }),
});
export type CareerStore = z.infer<typeof CareerStoreSchema>;

export const DEFAULT_RUBRIC_BY_TYPE: Record<InterviewType, RubricCriterion[]> = {
  Technical: [
    { key: 'technical_accuracy', label: 'Technical accuracy', weight: 25 },
    { key: 'problem_solving', label: 'Problem-solving', weight: 20 },
    { key: 'role_knowledge', label: 'Role-specific knowledge', weight: 15 },
    { key: 'practical_depth', label: 'Practical application and depth', weight: 15 },
    { key: 'reasoning_tradeoffs', label: 'Logical reasoning and trade-offs', weight: 10 },
    { key: 'answer_structure', label: 'Answer structure', weight: 10 },
    { key: 'relevance_clarity', label: 'Relevance and clarity', weight: 5 },
  ],
  Behavioural: [
    { key: 'star_structure', label: 'Situation/action/result structure', weight: 25 },
    { key: 'ownership_reflection', label: 'Ownership and reflection', weight: 20 },
    { key: 'role_relevance', label: 'Relevance to role', weight: 15 },
    { key: 'collaboration', label: 'Collaboration', weight: 15 },
    { key: 'communication_clarity', label: 'Communication clarity', weight: 15 },
    { key: 'specificity', label: 'Specificity of examples', weight: 10 },
  ],
  HR: [
    { key: 'motivation_fit', label: 'Motivation and role fit', weight: 25 },
    { key: 'communication_clarity', label: 'Communication clarity', weight: 25 },
    { key: 'self_awareness', label: 'Self-awareness', weight: 20 },
    { key: 'professionalism', label: 'Professionalism', weight: 15 },
    { key: 'company_understanding', label: 'Company/role understanding', weight: 15 },
  ],
  'System design': [
    { key: 'requirements_scoping', label: 'Requirements and scoping', weight: 20 },
    { key: 'architecture', label: 'Architecture', weight: 25 },
    { key: 'tradeoffs', label: 'Trade-offs', weight: 20 },
    { key: 'scalability_reliability', label: 'Scalability and reliability', weight: 15 },
    { key: 'data_modelling', label: 'Data modelling', weight: 10 },
    { key: 'communication', label: 'Communication', weight: 10 },
  ],
  'Problem-solving': [
    { key: 'problem_decomposition', label: 'Problem decomposition', weight: 25 },
    { key: 'algorithmic_thinking', label: 'Logical and algorithmic reasoning', weight: 25 },
    { key: 'edge_cases', label: 'Edge cases and validation', weight: 15 },
    { key: 'tradeoffs', label: 'Complexity and trade-offs', weight: 15 },
    { key: 'practical_application', label: 'Practical application', weight: 10 },
    { key: 'clarity', label: 'Explanation clarity', weight: 10 },
  ],
  'Communication/situational': [
    { key: 'stakeholder_framing', label: 'Stakeholder framing', weight: 25 },
    { key: 'clarity_coherence', label: 'Clarity and coherence', weight: 25 },
    { key: 'decision_rationale', label: 'Decision rationale', weight: 20 },
    { key: 'adaptability', label: 'Adaptability under ambiguity', weight: 15 },
    { key: 'conciseness', label: 'Structure and conciseness', weight: 15 },
  ],
  'Mixed company-specific': [
    { key: 'technical_accuracy', label: 'Technical and domain accuracy', weight: 25 },
    { key: 'problem_solving', label: 'Problem-solving and trade-offs', weight: 20 },
    { key: 'role_alignment', label: 'Company and role alignment', weight: 20 },
    { key: 'practical_depth', label: 'Practical depth and examples', weight: 15 },
    { key: 'structure_clarity', label: 'Answer structure and clarity', weight: 20 },
  ],
};
