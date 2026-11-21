import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGapStatus,
  computeCareerAnalysis,
  computeCompanyMatrix,
  computeRequirementWeight,
  computeSkillStrength,
} from './evidenceEngine';
import type { Company, EvidenceRecord, JobDescription, TargetRole } from './schemas';

test('computeSkillStrength follows exact Claimed / Demonstrated / Assessed rules', () => {
  const claimedOnly: EvidenceRecord[] = [
    {
      id: 'e1',
      skillId: 'typescript',
      level: 'claimed',
      sourceType: 'resume',
      sourceRef: 'Resume v1',
      date: '2026-11-01',
      provenance: 'resume',
    },
    {
      id: 'e2',
      skillId: 'typescript',
      level: 'claimed',
      sourceType: 'manual',
      sourceRef: 'Manual entry',
      date: '2026-11-02',
      provenance: 'candidate',
    },
  ];
  const res1 = computeSkillStrength('TypeScript', claimedOnly);
  assert.equal(res1.strength, 0.2);
  assert.equal(res1.maxLevel, 'claimed');

  const demonstratedThree: EvidenceRecord[] = [
    ...claimedOnly,
    {
      id: 'e3',
      skillId: 'typescript',
      level: 'demonstrated',
      sourceType: 'project',
      sourceRef: 'repo-a',
      date: '2026-11-03',
      provenance: 'project_evidence',
    },
    {
      id: 'e4',
      skillId: 'typescript',
      level: 'demonstrated',
      sourceType: 'project',
      sourceRef: 'repo-b',
      date: '2026-11-04',
      provenance: 'project_evidence',
    },
    {
      id: 'e5',
      skillId: 'typescript',
      level: 'demonstrated',
      sourceType: 'certification',
      sourceRef: 'cert-c',
      date: '2026-11-05',
      provenance: 'project_evidence',
    },
    {
      id: 'e6',
      skillId: 'typescript',
      level: 'demonstrated',
      sourceType: 'project',
      sourceRef: 'repo-d',
      date: '2026-11-06',
      provenance: 'project_evidence',
    },
  ];
  const res2 = computeSkillStrength('typescript', demonstratedThree);
  assert.equal(res2.strength, 0.7); // capped at 0.70
  assert.equal(res2.maxLevel, 'demonstrated');

  const assessed: EvidenceRecord[] = [
    ...claimedOnly,
    {
      id: 'e7',
      skillId: 'typescript',
      level: 'assessed',
      sourceType: 'interview',
      sourceRef: 'Mock #1',
      date: '2026-11-07',
      score: 80,
      provenance: 'interview',
    },
  ];
  const res3 = computeSkillStrength('typescript', assessed);
  assert.equal(res3.strength, 0.9); // 0.5 + 0.5 * 0.80 = 0.90
  assert.equal(res3.maxLevel, 'assessed');
});

test('computeRequirementWeight and computeCareerAnalysis sum accurately', () => {
  assert.equal(computeRequirementWeight('required', 0), 3);
  assert.equal(computeRequirementWeight('required', 2), 4.5);
  assert.equal(computeRequirementWeight('preferred', 1), 1.25);

  const companies: Company[] = [
    { id: 'c1', name: 'Stripe', category: 'startup', provenance: 'candidate' },
    { id: 'c2', name: 'Datadog', category: 'enterprise', provenance: 'candidate' },
  ];
  const targetRoles: TargetRole[] = [
    { id: 'r1', companyId: 'c1', title: 'Backend Engineer', provenance: 'candidate' },
    { id: 'r2', companyId: 'c2', title: 'Platform Engineer', provenance: 'candidate' },
  ];
  const jobDescriptions: JobDescription[] = [
    {
      id: 'jd1',
      targetRoleId: 'r1',
      source: { type: 'pasted', fetchedAt: '2026-11-10', status: 'ok' },
      rawText: 'Need TypeScript and Go.',
      responsibilities: ['Build payment APIs'],
      requirements: [
        {
          id: 'req1',
          skill: 'TypeScript',
          category: 'technical',
          level: 'required',
          quote: 'Need TypeScript',
          basis: 'explicit',
        },
        {
          id: 'req2',
          skill: 'Go',
          category: 'technical',
          level: 'preferred',
          quote: 'and Go.',
          basis: 'explicit',
        },
      ],
      behavioural: [],
      provenance: 'candidate',
    },
    {
      id: 'jd2',
      targetRoleId: 'r2',
      source: { type: 'pasted', fetchedAt: '2026-11-11', status: 'ok' },
      rawText: 'TypeScript required.',
      responsibilities: ['Build telemetry pipelines'],
      requirements: [
        {
          id: 'req3',
          skill: 'TypeScript',
          category: 'technical',
          level: 'required',
          quote: 'TypeScript required.',
          basis: 'explicit',
        },
      ],
      behavioural: [],
      provenance: 'candidate',
    },
  ];
  const evidenceRecords: EvidenceRecord[] = [
    {
      id: 'ev1',
      skillId: 'typescript',
      level: 'assessed',
      sourceType: 'interview',
      sourceRef: 'Interview 1',
      date: '2026-11-12',
      score: 60, // 0.5 + 0.3 = 0.80
      provenance: 'interview',
    },
  ];

  const analysis = computeCareerAnalysis({
    companies,
    targetRoles,
    jobDescriptions,
    evidenceRecords,
    targetWeeks: 8,
  });

  // TypeScript: required at 2 companies => weight = 3 * 1.25 = 3.75; strength = 0.80 => weighted = 3.0
  // Go: preferred at 1 company => weight = 1 * 1.0 = 1.0; strength = 0 => weighted = 0
  // Total weight = 4.75, total weighted = 3.0 => readiness = 3.0 / 4.75 = 0.6316
  assert.equal(analysis.totalWeight, 4.75);
  assert.equal(analysis.totalWeightedScore, 3);
  assert.equal(analysis.overallReadiness, 0.6316);

  const matrix = computeCompanyMatrix(companies, targetRoles, jobDescriptions);
  assert.deepEqual(matrix.commonSkills, ['TypeScript']);
  assert.deepEqual(matrix.uniqueSkillsByCompany['c1'], ['Go']);
});

test('classifyGapStatus handles all 5 statuses', () => {
  assert.equal(classifyGapStatus(0.75, 'assessed', 'required', 3), 'strong');
  assert.equal(classifyGapStatus(0.55, 'demonstrated', 'required', 3), 'developing');
  assert.equal(classifyGapStatus(0.2, 'claimed', 'required', 3), 'insufficient_evidence');
  assert.equal(classifyGapStatus(0, null, 'required', 3), 'missing');
  assert.equal(classifyGapStatus(0, null, 'preferred', 1), 'optional');
});
