import type {
  Company,
  EvidenceLevel,
  EvidenceRecord,
  Gap,
  GapStatus,
  JobDescription,
  RequirementLevel,
  TargetRole,
} from './schemas';

export function normalizeSkillId(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#.\s-]/g, '')
    .replace(/\s+/g, ' ');
}

export interface SkillStrengthResult {
  skillId: string;
  strength: number;
  maxLevel: EvidenceLevel | null;
  claimedCount: number;
  demonstratedCount: number;
  assessedCount: number;
  assessedMean: number | null;
  evidenceIds: string[];
  formulaNote: string;
}

export function computeSkillStrength(
  skillId: string,
  evidenceRecords: EvidenceRecord[]
): SkillStrengthResult {
  const norm = normalizeSkillId(skillId);
  const matching = evidenceRecords.filter(
    (e) => normalizeSkillId(e.skillId) === norm || (e.skillLabel && normalizeSkillId(e.skillLabel) === norm)
  );

  if (matching.length === 0) {
    return {
      skillId: norm,
      strength: 0,
      maxLevel: null,
      claimedCount: 0,
      demonstratedCount: 0,
      assessedCount: 0,
      assessedMean: null,
      evidenceIds: [],
      formulaNote: 'No evidence recorded (0.00)',
    };
  }

  const claimed = matching.filter((e) => e.level === 'claimed');
  const demonstrated = matching.filter((e) => e.level === 'demonstrated');
  const assessed = matching.filter((e) => e.level === 'assessed');

  // Count independent demonstrated items by unique sourceRef
  const uniqueDemonstratedSources = new Set(
    demonstrated.map((d) => `${d.sourceType}:${d.sourceRef.trim().toLowerCase()}`)
  );
  const independentDemonstratedCount = uniqueDemonstratedSources.size;

  const claimedScore = claimed.length > 0 ? 0.2 : 0;
  const demonstratedScore =
    independentDemonstratedCount > 0
      ? Math.min(0.7, 0.5 + 0.1 * Math.max(0, independentDemonstratedCount - 1))
      : 0;

  let assessedScore = 0;
  let assessedMean: number | null = null;
  if (assessed.length > 0) {
    const scored = assessed.filter((a) => typeof a.score === 'number');
    if (scored.length > 0) {
      assessedMean = scored.reduce((acc, cur) => acc + (cur.score ?? 0), 0) / scored.length;
    } else {
      assessedMean = 50;
    }
    assessedScore = 0.5 + 0.5 * (assessedMean / 100);
  }

  const strength = Number(Math.max(claimedScore, demonstratedScore, assessedScore).toFixed(4));

  let maxLevel: EvidenceLevel = 'claimed';
  if (assessedScore >= demonstratedScore && assessedScore >= claimedScore && assessed.length > 0) {
    maxLevel = 'assessed';
  } else if (demonstratedScore >= claimedScore && demonstrated.length > 0) {
    maxLevel = 'demonstrated';
  }

  let formulaNote = '';
  if (strength === claimedScore && claimed.length > 0 && demonstrated.length === 0 && assessed.length === 0) {
    formulaNote = 'Claimed only = 0.20';
  } else if (demonstratedScore >= assessedScore && demonstrated.length > 0) {
    formulaNote = `Demonstrated (${independentDemonstratedCount} independent item${independentDemonstratedCount === 1 ? '' : 's'}): 0.50 + 0.10 × ${Math.max(0, independentDemonstratedCount - 1)} = ${demonstratedScore.toFixed(2)} (cap 0.70)`;
  } else if (assessed.length > 0) {
    formulaNote = `Assessed (mean ${assessedMean?.toFixed(1)}%): 0.50 + 0.50 × (${(assessedMean ?? 0).toFixed(1)} / 100) = ${assessedScore.toFixed(2)}`;
  }

  return {
    skillId: norm,
    strength,
    maxLevel,
    claimedCount: claimed.length,
    demonstratedCount: independentDemonstratedCount,
    assessedCount: assessed.length,
    assessedMean,
    evidenceIds: matching.map((m) => m.id),
    formulaNote,
  };
}

export function computeRequirementWeight(
  level: RequirementLevel,
  otherCompaniesRequiringCount: number
): number {
  const base = level === 'required' ? 3 : 1;
  return Number((base * (1 + 0.25 * Math.max(0, otherCompaniesRequiringCount))).toFixed(4));
}

const DEPENDENCY_FOUNDATION_SKILLS = new Set([
  'sql',
  'python',
  'javascript',
  'typescript',
  'git',
  'data structures',
  'algorithms',
  'statistics',
  'linux',
  'http',
  'rest api',
  'system design',
  'docker',
]);

export function classifyGapStatus(
  strength: number,
  maxLevel: EvidenceLevel | null,
  maxReqLevel: RequirementLevel,
  weight: number
): GapStatus {
  if (strength >= 0.7) {
    return 'strong';
  }
  if (maxLevel === 'demonstrated' || maxLevel === 'assessed') {
    if (strength >= 0.4) {
      return 'developing';
    }
  }
  if (maxLevel === 'claimed') {
    return 'insufficient_evidence';
  }
  if (maxReqLevel === 'preferred' && weight <= 1.25) {
    return 'optional';
  }
  return 'missing';
}

export interface ReadinessBreakdownRow {
  skillId: string;
  skillLabel: string;
  maxReqLevel: RequirementLevel;
  companyCount: number;
  weight: number;
  strength: number;
  weightedScore: number;
  maxLevel: EvidenceLevel | null;
  status: GapStatus;
  formulaNote: string;
}

export interface CompanyReadinessResult {
  companyId: string;
  companyName: string;
  readiness: number;
  totalWeight: number;
  totalWeightedScore: number;
  rows: ReadinessBreakdownRow[];
}

export function jdSourceLabel(type: 'url' | 'pasted' | 'uploaded'): string {
  if (type === 'url') return 'Public job description';
  if (type === 'uploaded') return 'Uploaded document';
  return 'Candidate-provided text';
}

export function computeCareerAnalysis(params: {
  companies: Company[];
  targetRoles: TargetRole[];
  jobDescriptions: JobDescription[];
  evidenceRecords: EvidenceRecord[];
  targetWeeks?: number;
  gapExplanations?: Record<string, string>;
}): {
  overallReadiness: number;
  totalWeight: number;
  totalWeightedScore: number;
  overallBreakdown: ReadinessBreakdownRow[];
  companyReadiness: Record<string, CompanyReadinessResult>;
  gaps: Gap[];
} {
  const {
    companies,
    targetRoles,
    jobDescriptions,
    evidenceRecords,
    targetWeeks = 12,
    gapExplanations = {},
  } = params;

  const roleMap = new Map(targetRoles.map((r) => [r.id, r]));
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  // Map skillId -> requirements across all JDs
  interface SkillReqAccum {
    skillId: string;
    skillLabel: string;
    companyIds: Set<string>;
    maxReqLevel: RequirementLevel;
    refs: Gap['requirementRefs'];
  }

  const skillMap = new Map<string, SkillReqAccum>();

  for (const jd of jobDescriptions) {
    const role = roleMap.get(jd.targetRoleId);
    const company = role ? companyMap.get(role.companyId) : undefined;
    const companyId = company?.id ?? 'unknown';
    const companyName = company?.name ?? 'Target Company';
    const roleTitle = role?.title ?? 'Target Role';

    for (const req of jd.requirements) {
      const skillId = normalizeSkillId(req.skill);
      if (!skillId) continue;

      let entry = skillMap.get(skillId);
      if (!entry) {
        entry = {
          skillId,
          skillLabel: req.skill.trim(),
          companyIds: new Set(),
          maxReqLevel: req.level,
          refs: [],
        };
        skillMap.set(skillId, entry);
      }
      if (req.level === 'required') {
        entry.maxReqLevel = 'required';
      }
      entry.companyIds.add(companyId);
      entry.refs.push({
        jdId: jd.id,
        companyId,
        companyName,
        roleTitle,
        level: req.level,
        quote: req.quote,
        basis: req.basis,
        fetchedAt: jd.source.fetchedAt,
        sourceLabel: jdSourceLabel(jd.source.type),
      });
    }
  }

  const allSkillIds = new Set(skillMap.keys());
  const timelineFactor = targetWeeks <= 6 ? 1.2 : targetWeeks <= 12 ? 1.05 : 1.0;

  const gaps: Gap[] = [];
  const overallBreakdown: ReadinessBreakdownRow[] = [];
  let totalWeight = 0;
  let totalWeightedScore = 0;

  for (const entry of skillMap.values()) {
    const otherCompaniesCount = Math.max(0, entry.companyIds.size - 1);
    const weight = computeRequirementWeight(entry.maxReqLevel, otherCompaniesCount);
    const strengthRes = computeSkillStrength(entry.skillId, evidenceRecords);
    const status = classifyGapStatus(
      strengthRes.strength,
      strengthRes.maxLevel,
      entry.maxReqLevel,
      weight
    );

    const dependencyBoost =
      DEPENDENCY_FOUNDATION_SKILLS.has(entry.skillId) && allSkillIds.size > 3 ? 1.25 : 1.0;
    const strengthGap = Number((1 - strengthRes.strength).toFixed(4));
    const priorityScore = Number(
      (weight * strengthGap * dependencyBoost * timelineFactor).toFixed(3)
    );

    const weightedScore = Number((weight * strengthRes.strength).toFixed(4));
    totalWeight += weight;
    totalWeightedScore += weightedScore;

    let nextAction = 'Maintain with periodic interview practice';
    if (status === 'missing') {
      nextAction = `Build a focused project or complete guided practice to demonstrate ${entry.skillLabel}`;
    } else if (status === 'insufficient_evidence') {
      nextAction = `Listed on resume only — attach a repo/project deliverable or complete an assessed mock interview on ${entry.skillLabel}`;
    } else if (status === 'developing') {
      nextAction = `Strengthen ${entry.skillLabel} from ${Math.round(strengthRes.strength * 100)}% to 70%+ via deeper assessed interview practice`;
    } else if (status === 'optional') {
      nextAction = `Optional preferred skill across ${entry.companyIds.size} company — tackle after required gaps`;
    }

    const defaultExplanation =
      status === 'strong'
        ? `${entry.skillLabel} is strongly evidenced (${Math.round(strengthRes.strength * 100)}%) via ${strengthRes.maxLevel} records.`
        : status === 'insufficient_evidence'
          ? `${entry.skillLabel} is required across ${entry.companyIds.size} target company/companies, but currently has claimed-only (resume) evidence (0.20).`
          : status === 'developing'
            ? `${entry.skillLabel} has ${strengthRes.maxLevel} evidence (${Math.round(strengthRes.strength * 100)}%), approaching the 70% strong threshold.`
            : status === 'optional'
              ? `${entry.skillLabel} is listed as preferred and has lower cross-company priority.`
              : `${entry.skillLabel} has no recorded evidence yet and is required by ${entry.companyIds.size} target company/companies.`;

    gaps.push({
      skillId: entry.skillId,
      skillLabel: entry.skillLabel,
      status,
      strength: strengthRes.strength,
      weight,
      priorityScore,
      priorityBreakdown: {
        weight,
        strengthGap,
        dependencyBoost,
        timelineFactor,
      },
      requirementRefs: entry.refs,
      evidenceRefs: strengthRes.evidenceIds,
      nextAction,
      explanation: gapExplanations[entry.skillId] || defaultExplanation,
    });

    overallBreakdown.push({
      skillId: entry.skillId,
      skillLabel: entry.skillLabel,
      maxReqLevel: entry.maxReqLevel,
      companyCount: entry.companyIds.size,
      weight,
      strength: strengthRes.strength,
      weightedScore,
      maxLevel: strengthRes.maxLevel,
      status,
      formulaNote: strengthRes.formulaNote,
    });
  }

  gaps.sort((a, b) => b.priorityScore - a.priorityScore);
  overallBreakdown.sort((a, b) => b.weight - a.weight);

  const overallReadiness =
    totalWeight > 0 ? Number((totalWeightedScore / totalWeight).toFixed(4)) : 0;

  // Per-company readiness
  const companyReadiness: Record<string, CompanyReadinessResult> = {};
  for (const company of companies) {
    const companyRoles = targetRoles.filter((r) => r.companyId === company.id);
    const companyRoleIds = new Set(companyRoles.map((r) => r.id));
    const companyJds = jobDescriptions.filter((j) => companyRoleIds.has(j.targetRoleId));

    const compSkillLevels = new Map<string, { label: string; level: RequirementLevel }>();
    for (const jd of companyJds) {
      for (const req of jd.requirements) {
        const sid = normalizeSkillId(req.skill);
        if (!sid) continue;
        const prev = compSkillLevels.get(sid);
        if (!prev) {
          compSkillLevels.set(sid, { label: req.skill.trim(), level: req.level });
        } else if (req.level === 'required') {
          prev.level = 'required';
        }
      }
    }

    let cWeight = 0;
    let cWeightedScore = 0;
    const rows: ReadinessBreakdownRow[] = [];

    for (const [sid, info] of compSkillLevels.entries()) {
      const globalEntry = skillMap.get(sid);
      const otherCount = globalEntry ? Math.max(0, globalEntry.companyIds.size - 1) : 0;
      const w = computeRequirementWeight(info.level, otherCount);
      const strengthRes = computeSkillStrength(sid, evidenceRecords);
      const ws = Number((w * strengthRes.strength).toFixed(4));
      cWeight += w;
      cWeightedScore += ws;

      rows.push({
        skillId: sid,
        skillLabel: info.label,
        maxReqLevel: info.level,
        companyCount: globalEntry?.companyIds.size ?? 1,
        weight: w,
        strength: strengthRes.strength,
        weightedScore: ws,
        maxLevel: strengthRes.maxLevel,
        status: classifyGapStatus(strengthRes.strength, strengthRes.maxLevel, info.level, w),
        formulaNote: strengthRes.formulaNote,
      });
    }

    rows.sort((a, b) => b.weight - a.weight);
    companyReadiness[company.id] = {
      companyId: company.id,
      companyName: company.name,
      readiness: cWeight > 0 ? Number((cWeightedScore / cWeight).toFixed(4)) : 0,
      totalWeight: Number(cWeight.toFixed(4)),
      totalWeightedScore: Number(cWeightedScore.toFixed(4)),
      rows,
    };
  }

  return {
    overallReadiness,
    totalWeight: Number(totalWeight.toFixed(4)),
    totalWeightedScore: Number(totalWeightedScore.toFixed(4)),
    overallBreakdown,
    companyReadiness,
    gaps,
  };
}

export interface MatrixCell {
  status: 'required' | 'preferred' | 'absent';
  quotes: Array<{
    jdId: string;
    quote: string;
    basis: 'explicit' | 'inferred';
    fetchedAt: string;
    sourceLabel: string;
    roleTitle: string;
  }>;
}

export interface CompanyMatrixResult {
  companies: Array<{ id: string; name: string }>;
  rows: Array<{
    skillId: string;
    skillLabel: string;
    category: 'technical' | 'role' | 'professional';
    companyCount: number;
    requiredCount: number;
    preferredCount: number;
    cells: Record<string, MatrixCell>;
  }>;
  commonSkills: string[];
  uniqueSkillsByCompany: Record<string, string[]>;
  experienceDifferences: Array<{ companyName: string; roleTitle: string; experience: string; education: string }>;
  responsibilityComparison: Array<{ companyName: string; roleTitle: string; responsibilities: string[] }>;
}

export function computeCompanyMatrix(
  companies: Company[],
  targetRoles: TargetRole[],
  jobDescriptions: JobDescription[]
): CompanyMatrixResult {
  const roleMap = new Map(targetRoles.map((r) => [r.id, r]));
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  const rowMap = new Map<
    string,
    {
      skillId: string;
      skillLabel: string;
      category: 'technical' | 'role' | 'professional';
      cells: Record<string, MatrixCell>;
    }
  >();

  const experienceDifferences: CompanyMatrixResult['experienceDifferences'] = [];
  const responsibilityComparison: CompanyMatrixResult['responsibilityComparison'] = [];

  for (const jd of jobDescriptions) {
    const role = roleMap.get(jd.targetRoleId);
    const company = role ? companyMap.get(role.companyId) : undefined;
    if (!company || !role) continue;

    experienceDifferences.push({
      companyName: company.name,
      roleTitle: role.title,
      experience: jd.experience || 'Not specified in JD',
      education: jd.education || 'Not specified in JD',
    });

    responsibilityComparison.push({
      companyName: company.name,
      roleTitle: role.title,
      responsibilities: jd.responsibilities,
    });

    for (const req of jd.requirements) {
      const sid = normalizeSkillId(req.skill);
      if (!sid) continue;
      let row = rowMap.get(sid);
      if (!row) {
        row = {
          skillId: sid,
          skillLabel: req.skill.trim(),
          category: req.category,
          cells: {},
        };
        rowMap.set(sid, row);
      }
      if (!row.cells[company.id]) {
        row.cells[company.id] = { status: req.level, quotes: [] };
      } else if (req.level === 'required') {
        row.cells[company.id].status = 'required';
      }
      row.cells[company.id].quotes.push({
        jdId: jd.id,
        quote: req.quote,
        basis: req.basis,
        fetchedAt: jd.source.fetchedAt,
        sourceLabel: jdSourceLabel(jd.source.type),
        roleTitle: role.title,
      });
    }
  }

  const activeCompanies = companies.filter((c) =>
    jobDescriptions.some((jd) => roleMap.get(jd.targetRoleId)?.companyId === c.id)
  );

  const rows: CompanyMatrixResult['rows'] = [];
  const commonSkills: string[] = [];
  const uniqueSkillsByCompany: Record<string, string[]> = {};
  for (const c of activeCompanies) uniqueSkillsByCompany[c.id] = [];

  for (const row of rowMap.values()) {
    let companyCount = 0;
    let requiredCount = 0;
    let preferredCount = 0;
    const filledCells: Record<string, MatrixCell> = {};

    for (const c of activeCompanies) {
      const cell = row.cells[c.id];
      if (cell) {
        companyCount++;
        if (cell.status === 'required') requiredCount++;
        else preferredCount++;
        filledCells[c.id] = cell;
      } else {
        filledCells[c.id] = { status: 'absent', quotes: [] };
      }
    }

    if (activeCompanies.length >= 2 && companyCount === activeCompanies.length) {
      commonSkills.push(row.skillLabel);
    }
    if (companyCount === 1) {
      const onlyCompany = activeCompanies.find((c) => filledCells[c.id]?.status !== 'absent');
      if (onlyCompany) uniqueSkillsByCompany[onlyCompany.id].push(row.skillLabel);
    }

    rows.push({
      skillId: row.skillId,
      skillLabel: row.skillLabel,
      category: row.category,
      companyCount,
      requiredCount,
      preferredCount,
      cells: filledCells,
    });
  }

  rows.sort((a, b) => b.companyCount - a.companyCount || b.requiredCount - a.requiredCount);

  return {
    companies: activeCompanies.map((c) => ({ id: c.id, name: c.name })),
    rows,
    commonSkills,
    uniqueSkillsByCompany,
    experienceDifferences,
    responsibilityComparison,
  };
}
