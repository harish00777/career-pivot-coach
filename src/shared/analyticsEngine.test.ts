import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeechFeatures, computeApplicationAnalytics } from './analyticsEngine';
import { validateExternalJdUrl, isPrivateOrReservedIp } from './ssrfGuard';
import type { Application, ResumeVersion } from './schemas';

test('computeApplicationAnalytics enforces minimum sample rules (<10 overall, <5 per group)', () => {
  const resumes: ResumeVersion[] = [
    {
      id: 'res1',
      label: 'Backend v1',
      rawText: '...',
      parsed: {
        education: [],
        skills: [],
        languages: [],
        frameworks: [],
        tools: [],
        projects: [],
        certifications: [],
        experience: [],
        achievements: [],
        leadership: [],
      },
      fieldConfidence: {},
      userEditedFields: [],
      createdAt: '2026-11-01',
      provenance: 'resume',
    },
  ];

  const apps: Application[] = Array.from({ length: 6 }, (_, i) => ({
    id: `a${i}`,
    company: `Co ${i}`,
    companyCategory: 'startup',
    role: 'Backend Engineer',
    date: '2026-11-01',
    resumeVersionId: 'res1',
    referral: i < 2,
    channel: 'Direct',
    status: i === 0 ? 'interview' : 'applied',
    notes: '',
    history: [{ status: 'applied', date: '2026-11-01' }],
    provenance: 'application',
  }));

  const res = computeApplicationAnalytics(apps, resumes);
  assert.equal(res.total, 6);
  assert.equal(res.overallEnoughData, false);
  assert.match(res.overallMessage, /Not enough data to see a pattern/);
  const referralGroup = res.byReferral.find((g) => g.groupKey === 'referral');
  assert.equal(referralGroup?.insufficientSample, true);
  assert.match(referralGroup?.caveat ?? '', /Not enough data to see a pattern/);
});

test('analyzeSpeechFeatures detects long pauses and high filler rates without scoring', () => {
  const res = analyzeSpeechFeatures(
    'Um I think uh basically we used like PostgreSQL and you know um Redis for caching.',
    40,
    7.5
  );
  assert.equal(res.longPauseDetected, true);
  assert.equal(res.suggestion?.feature, 'long_pause');
  assert.ok(res.fillerCount >= 5);
});

test('ssrfGuard blocks localhost, cloud metadata, and private IPs while allowing https', () => {
  assert.equal(validateExternalJdUrl('http://localhost:3000/secret').valid, false);
  assert.equal(validateExternalJdUrl('http://127.0.0.1/admin').valid, false);
  assert.equal(validateExternalJdUrl('http://169.254.169.254/latest/meta-data/').valid, false);
  assert.equal(validateExternalJdUrl('ftp://example.com/jd.txt').valid, false);
  assert.equal(isPrivateOrReservedIp('192.168.1.10'), true);
  assert.equal(isPrivateOrReservedIp('10.0.0.5'), true);
  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.equal(validateExternalJdUrl('https://jobs.lever.co/example/123').valid, true);
});
