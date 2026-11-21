import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Type, ThinkingLevel } from '@google/genai';
import * as cheerio from 'cheerio';
import express, { type NextFunction, type Request, type Response } from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import { z } from 'zod';
import { isPrivateOrReservedIp, validateExternalJdUrl } from '../src/shared/ssrfGuard';
import { MODEL_INFO } from './config';
import {
  callStructuredGemini,
  classifyGeminiError,
  extractPdfTextWithGemini,
  generateSpeechWav,
  isGeminiConfigured,
  probeGeminiHealth,
  searchLearningResourcesWithGemini,
  transcribeAudioWithGemini,
} from './gemini';

const require = createRequire(import.meta.url);

// Standardized envelope helpers
function sendOk<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.status(200).json({
    ok: true,
    data,
    error: null,
    ...(meta || {}),
  });
}

function sendErr(
  res: Response,
  status: number,
  error: string,
  code = 'REQUEST_ERROR',
  retryable = false
) {
  return res.status(status).json({
    ok: false,
    data: null,
    error,
    code,
    retryable,
  });
}

function statusFromGeminiCode(code?: string): number {
  if (code === 'RATE_LIMIT') return 429;
  if (code === 'MISSING_KEY') return 503;
  if (code === 'TIMEOUT') return 504;
  return 502;
}

// Simple in-memory rate limiter for AI & fetch routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMinute = 45) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMinute) {
      return sendErr(
        res,
        429,
        'Too many requests in the last minute. Please wait briefly and try again.',
        'RATE_LIMIT',
        true
      );
    }
    bucket.count += 1;
    return next();
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

const ALLOWED_EXTS = new Set(['.pdf', '.docx', '.txt', '.md']);

interface PdfParseV2Instance {
  getText: () => Promise<{ text?: string }>;
  destroy?: () => Promise<void>;
}

interface PdfParseModuleShape {
  PDFParse?: new (opts: { data: Buffer | Uint8Array }) => PdfParseV2Instance;
  default?: ((buf: Buffer) => Promise<{ text?: string }>) | PdfParseModuleShape;
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const loaded = require('pdf-parse') as PdfParseModuleShape | ((buf: Buffer) => Promise<{ text?: string }>);
    if (typeof loaded === 'function') {
      const parsed = await loaded(buffer);
      return (parsed?.text || '').trim();
    }
    const PdfCtor =
      loaded?.PDFParse ||
      (typeof loaded?.default === 'object' ? loaded.default?.PDFParse : undefined);
    if (PdfCtor) {
      const parser = new PdfCtor({ data: buffer });
      try {
        const parsed = await parser.getText();
        return (parsed?.text || '').trim();
      } finally {
        await parser.destroy?.().catch(() => {});
      }
    }
    if (typeof loaded?.default === 'function') {
      const parsed = await loaded.default(buffer);
      return (parsed?.text || '').trim();
    }
    return '';
  } catch {
    return '';
  }
}

async function safeLookupAndVerify(hostname: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) {
      return { ok: false, reason: 'Domain could not be resolved.' };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return { ok: false, reason: 'Resolved to a private or restricted IP address.' };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not resolve target hostname.' };
  }
}

export function createApiRouter() {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    const runProbe = req.query.probe === '1' || req.query.probe === 'true';
    const force = req.query.force === '1' || req.query.force === 'true';
    const geminiConfigured = isGeminiConfigured();
    const probe = runProbe ? await probeGeminiHealth(force) : null;

    return sendOk(res, {
      status: probe ? probe.status : geminiConfigured ? 'configured' : 'unavailable',
      geminiConfigured,
      models: MODEL_INFO,
      probe,
    });
  });

  // File parsing endpoint (PDF / DOCX / TXT / MD)
  router.post('/parse-file', rateLimit(30), (req, res) => {
    upload.single('file')(req, res, async (uploadErr: unknown) => {
      if (uploadErr) {
        const msg =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'File exceeds the 5 MB size limit.'
            : 'Invalid file upload.';
        return sendErr(res, 400, msg, 'INVALID_UPLOAD', false);
      }

      const file = req.file;
      if (!file) {
        return sendErr(res, 400, 'No file was uploaded.', 'MISSING_FILE', false);
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return sendErr(
          res,
          400,
          `Unsupported file type "${ext || 'unknown'}". Please upload a PDF, DOCX, or TXT file.`,
          'UNSUPPORTED_FILE_TYPE',
          false
        );
      }

      try {
        let text = '';
        let method: 'text' | 'docx' | 'pdf_text' | 'pdf_ocr' = 'text';

        if (ext === '.txt' || ext === '.md') {
          text = file.buffer.toString('utf-8').trim();
          method = 'text';
        } else if (ext === '.docx') {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          text = (result.value || '').trim();
          method = 'docx';
        } else if (ext === '.pdf') {
          text = await extractTextFromPdfBuffer(file.buffer);
          method = 'pdf_text';
          if (text.length < 40 && isGeminiConfigured()) {
            try {
              const ocrText = await extractPdfTextWithGemini(file.buffer.toString('base64'));
              if (ocrText.length > text.length) {
                text = ocrText;
                method = 'pdf_ocr';
              }
            } catch {
              // Keep best extracted text if OCR fails
            }
          }
        }

        if (!text || text.length < 20) {
          return sendErr(
            res,
            422,
            'Could not extract readable text from this file (it may be empty or an image-only scan). You can paste the resume text below instead.',
            'UNREADABLE_FILE',
            false
          );
        }

        return sendOk(res, {
          fileName: file.originalname,
          fileSize: file.size,
          method,
          text,
          charCount: text.length,
        });
      } catch (err) {
        return sendErr(
          res,
          500,
          err instanceof Error ? err.message : 'Failed to parse uploaded file.',
          'FILE_PARSE_ERROR',
          true
        );
      }
    });
  });

  // SSRF-hardened JD URL fetcher
  router.post('/fetch-jd', rateLimit(30), async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const check = validateExternalJdUrl(rawUrl);
    if (!check.valid || !check.parsed) {
      return sendErr(res, 400, check.reason || 'Invalid URL.', 'INVALID_URL', false);
    }

    try {
      let currentUrl = check.parsed;
      let html = '';

      for (let hop = 0; hop < 4; hop++) {
        const dnsCheck = await safeLookupAndVerify(currentUrl.hostname);
        if (!dnsCheck.ok) {
          return sendErr(res, 400, `Blocked URL: ${dnsCheck.reason}`, 'BLOCKED_URL', false);
        }

        const resp = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent': 'RolexIQ-Career-Reader/1.0',
            Accept: 'text/html,application/xhtml+xml,text/plain',
          },
        });

        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get('location');
          if (!loc) {
            return sendErr(
              res,
              502,
              'Could not retrieve this page (redirect without location). Please paste the job description text below.',
              'FETCH_REDIRECT_ERROR',
              false
            );
          }
          const nextParsed = validateExternalJdUrl(new URL(loc, currentUrl).toString());
          if (!nextParsed.valid || !nextParsed.parsed) {
            return sendErr(
              res,
              400,
              'Redirect target was blocked for security.',
              'BLOCKED_REDIRECT',
              false
            );
          }
          currentUrl = nextParsed.parsed;
          continue;
        }

        if (!resp.ok) {
          return sendErr(
            res,
            422,
            `Could not retrieve this page (HTTP ${resp.status}). Please paste the job description text below.`,
            'FETCH_HTTP_ERROR',
            false
          );
        }

        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.byteLength > 2 * 1024 * 1024) {
          return sendErr(
            res,
            422,
            'Page exceeded the 2 MB limit. Please paste the job description text below.',
            'FETCH_TOO_LARGE',
            false
          );
        }
        html = buf.toString('utf-8');
        break;
      }

      const $ = cheerio.load(html);
      $('script, style, noscript, svg, iframe, nav, footer, header').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      if (text.length < 180) {
        return sendErr(
          res,
          422,
          'Could not retrieve enough readable text from this link (the site may require client-side JavaScript or sign-in). Please paste the job description below.',
          'FETCH_INSUFFICIENT_TEXT',
          false
        );
      }

      return sendOk(res, {
        status: 'ok' as const,
        url: currentUrl.toString(),
        text: text.slice(0, 24_000),
      });
    } catch {
      return sendErr(
        res,
        502,
        'Could not retrieve this page (network timeout or site blocked automated reads). Please paste the job description text below.',
        'FETCH_FAILED',
        true
      );
    }
  });

  // 1. Resume Extraction Agent
  router.post('/ai/resume', rateLimit(), async (req, res) => {
    const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';
    if (rawText.length < 30) {
      return sendErr(
        res,
        400,
        'Please provide at least 30 characters of resume text before running extraction.',
        'VALIDATION_ERROR',
        false
      );
    }

    const zodOut = z.object({
      parsed: z.object({
        education: z.array(z.string()),
        skills: z.array(z.string()),
        languages: z.array(z.string()),
        frameworks: z.array(z.string()),
        tools: z.array(z.string()),
        projects: z.array(z.string()),
        certifications: z.array(z.string()),
        experience: z.array(z.string()),
        achievements: z.array(z.string()),
        leadership: z.array(z.string()),
      }),
      fieldConfidence: z.object({
        education: z.number().min(0).max(1),
        skills: z.number().min(0).max(1),
        languages: z.number().min(0).max(1),
        frameworks: z.number().min(0).max(1),
        tools: z.number().min(0).max(1),
        projects: z.number().min(0).max(1),
        certifications: z.number().min(0).max(1),
        experience: z.number().min(0).max(1),
        achievements: z.number().min(0).max(1),
        leadership: z.number().min(0).max(1),
      }),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Resume Agent. Extract structured fields strictly from the resume text provided. Leave unknown or absent fields as empty arrays [] with low confidence (0.0-0.3). Never guess or invent items.',
      prompt: `Extract structured resume fields from this text:\n\n${rawText.slice(0, 20_000)}`,
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          parsed: {
            type: Type.OBJECT,
            properties: {
              education: { type: Type.ARRAY, items: { type: Type.STRING } },
              skills: { type: Type.ARRAY, items: { type: Type.STRING } },
              languages: { type: Type.ARRAY, items: { type: Type.STRING } },
              frameworks: { type: Type.ARRAY, items: { type: Type.STRING } },
              tools: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: { type: Type.ARRAY, items: { type: Type.STRING } },
              certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
              experience: { type: Type.ARRAY, items: { type: Type.STRING } },
              achievements: { type: Type.ARRAY, items: { type: Type.STRING } },
              leadership: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'education',
              'skills',
              'languages',
              'frameworks',
              'tools',
              'projects',
              'certifications',
              'experience',
              'achievements',
              'leadership',
            ],
          },
          fieldConfidence: {
            type: Type.OBJECT,
            properties: {
              education: { type: Type.NUMBER },
              skills: { type: Type.NUMBER },
              languages: { type: Type.NUMBER },
              frameworks: { type: Type.NUMBER },
              tools: { type: Type.NUMBER },
              projects: { type: Type.NUMBER },
              certifications: { type: Type.NUMBER },
              experience: { type: Type.NUMBER },
              achievements: { type: Type.NUMBER },
              leadership: { type: Type.NUMBER },
            },
            required: [
              'education',
              'skills',
              'languages',
              'frameworks',
              'tools',
              'projects',
              'certifications',
              'experience',
              'achievements',
              'leadership',
            ],
          },
        },
        required: ['parsed', 'fieldConfidence'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 1b. Resume Analysis for selected target role
  router.post('/ai/resume-analyze', rateLimit(), async (req, res) => {
    const { resume, targetRoleTitle, companyName, jdRequirements, userClarifications } = req.body ?? {};
    if (!resume?.rawText) {
      return sendErr(res, 400, 'Resume content is required for analysis.', 'VALIDATION_ERROR', false);
    }

    const zodOut = z.object({
      strongSections: z.array(z.string()),
      missingInfo: z.array(z.string()),
      skillsWithoutEvidence: z.array(z.string()),
      weakOrUnquantifiedBullets: z.array(
        z.object({
          original: z.string(),
          issue: z.string(),
          clarificationQuestion: z.string(),
          rewrittenWithFactPlaceholders: z.string(),
        })
      ),
      keywordAlignmentSummary: z.string(),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Resume Analyst. Critique the resume strictly against the supplied role requirements. NEVER invent metrics, numbers, or achievements. If a bullet lacks numbers, ask the user for the missing metric and use [Add metric: ...] placeholders unless the user already provided the fact in userClarifications.',
      prompt: JSON.stringify({
        targetRoleTitle: targetRoleTitle || 'General Target Role',
        companyName: companyName || 'Target Company',
        resumeParsed: resume.parsed,
        rawText: String(resume.rawText).slice(0, 12_000),
        jdRequirements: jdRequirements || [],
        userClarifications: userClarifications || '',
      }),
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strongSections: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
          skillsWithoutEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          weakOrUnquantifiedBullets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                issue: { type: Type.STRING },
                clarificationQuestion: { type: Type.STRING },
                rewrittenWithFactPlaceholders: { type: Type.STRING },
              },
              required: [
                'original',
                'issue',
                'clarificationQuestion',
                'rewrittenWithFactPlaceholders',
              ],
            },
          },
          keywordAlignmentSummary: { type: Type.STRING },
        },
        required: [
          'strongSections',
          'missingInfo',
          'skillsWithoutEvidence',
          'weakOrUnquantifiedBullets',
          'keywordAlignmentSummary',
        ],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 2. JD Agent
  router.post('/ai/jd', rateLimit(), async (req, res) => {
    const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';
    const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName : '';
    const roleTitle = typeof req.body?.roleTitle === 'string' ? req.body.roleTitle : '';

    if (rawText.length < 40) {
      return sendErr(
        res,
        400,
        'Job description text must be at least 40 characters.',
        'VALIDATION_ERROR',
        false
      );
    }

    const zodOut = z.object({
      location: z.string().optional().default(''),
      experience: z.string().optional().default(''),
      education: z.string().optional().default(''),
      responsibilities: z.array(z.string()),
      behavioural: z.array(z.string()),
      requirements: z.array(
        z.object({
          skill: z.string(),
          category: z.enum(['technical', 'role', 'professional']),
          level: z.enum(['required', 'preferred']),
          quote: z.string(),
          basis: z.enum(['explicit', 'inferred']),
        })
      ),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ JD Agent. Extract structured requirements from the job description. Every requirement MUST include a verbatim quote copied directly from the JD text. If a requirement has no direct verbatim quote in the JD, set basis:"inferred" and explain why in quote. Classify category as technical (languages, frameworks, databases, cloud, tools, architecture, security, DSA, ML, deployment), role (responsibilities, problem solving, system design, domain), or professional (communication, collaboration, ownership, leadership).',
      prompt: `Company: ${companyName}\nRole: ${roleTitle}\n\nJob Description:\n${rawText.slice(0, 20_000)}`,
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING },
          experience: { type: Type.STRING },
          education: { type: Type.STRING },
          responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
          behavioural: { type: Type.ARRAY, items: { type: Type.STRING } },
          requirements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skill: { type: Type.STRING },
                category: { type: Type.STRING, enum: ['technical', 'role', 'professional'] },
                level: { type: Type.STRING, enum: ['required', 'preferred'] },
                quote: { type: Type.STRING },
                basis: { type: Type.STRING, enum: ['explicit', 'inferred'] },
              },
              required: ['skill', 'category', 'level', 'quote', 'basis'],
            },
          },
        },
        required: ['responsibilities', 'behavioural', 'requirements'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }

    // Server-side quote verification
    const normRaw = rawText.toLowerCase().replace(/\s+/g, ' ');
    const verifiedRequirements = result.data.requirements.map((reqItem, idx) => {
      const normQuote = reqItem.quote.toLowerCase().replace(/\s+/g, ' ').trim();
      const hasVerbatim = normQuote.length >= 4 && normRaw.includes(normQuote);
      return {
        id: `req-${Date.now()}-${idx}`,
        ...reqItem,
        basis: hasVerbatim ? reqItem.basis : ('inferred' as const),
      };
    });

    return sendOk(res, {
      ...result.data,
      requirements: verifiedRequirements,
    });
  });

  // 3. Company DNA Agent (narrates code-computed counts)
  router.post('/ai/company-dna', rateLimit(), async (req, res) => {
    const { matrixSummary } = req.body ?? {};
    if (!matrixSummary) {
      return sendErr(res, 400, 'Company comparison data is required.', 'VALIDATION_ERROR', false);
    }

    const zodOut = z.object({
      narrative: z.string(),
      differentiators: z.array(z.string()),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Company DNA Agent. You receive pre-computed skill frequencies, common skills, unique skills, and experience/responsibility comparisons. Narrate what differentiates these companies using ONLY the supplied facts. Do not invent hiring criteria.',
      prompt: JSON.stringify(matrixSummary),
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          narrative: { type: Type.STRING },
          differentiators: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['narrative', 'differentiators'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 4. Gap Agent
  router.post('/ai/gap-explain', rateLimit(), async (req, res) => {
    const { gaps } = req.body ?? {};
    if (!Array.isArray(gaps) || gaps.length === 0) {
      return sendErr(res, 400, 'Computed skill gaps are required.', 'VALIDATION_ERROR', false);
    }

    const zodOut = z.object({
      explanations: z.array(
        z.object({
          skillId: z.string(),
          explanation: z.string(),
        })
      ),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Gap Agent. Write a concise, grounded one-sentence explanation for each skill gap using ONLY its computed status, strength, weight, and requirement references. Use plain career coaching language.',
      prompt: JSON.stringify(gaps.slice(0, 25)),
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skillId: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['skillId', 'explanation'],
            },
          },
        },
        required: ['explanations'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 5. Planner Agent (Create or Adapt Diff)
  router.post('/ai/planner', rateLimit(), async (req, res) => {
    const { mode, gaps, hoursPerWeek, targetWeeks, existingRoadmap, trigger, reasonContext } =
      req.body ?? {};

    const weekSchema = {
      type: Type.OBJECT,
      properties: {
        n: { type: Type.INTEGER },
        objective: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        topics: { type: Type.ARRAY, items: { type: Type.STRING } },
        exercises: { type: Type.ARRAY, items: { type: Type.STRING } },
        resources: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
              searchTerm: { type: Type.STRING },
              verified: { type: Type.BOOLEAN },
            },
            required: ['title', 'verified'],
          },
        },
        estHours: { type: Type.NUMBER },
        deliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
        completionCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
        evidenceToCollect: { type: Type.ARRAY, items: { type: Type.STRING } },
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              text: { type: Type.STRING },
            },
            required: ['id', 'text'],
          },
        },
      },
      required: [
        'n',
        'objective',
        'skills',
        'topics',
        'exercises',
        'resources',
        'estHours',
        'deliverables',
        'completionCriteria',
        'evidenceToCollect',
        'tasks',
      ],
    };

    const zodWeek = z.object({
      n: z.number().int().min(1),
      objective: z.string(),
      skills: z.array(z.string()),
      topics: z.array(z.string()),
      exercises: z.array(z.string()),
      resources: z.array(
        z.object({
          title: z.string(),
          url: z.string().optional(),
          searchTerm: z.string().optional(),
          verified: z.boolean(),
        })
      ),
      estHours: z.number(),
      deliverables: z.array(z.string()),
      completionCriteria: z.array(z.string()),
      evidenceToCollect: z.array(z.string()),
      tasks: z.array(z.object({ id: z.string(), text: z.string() })),
    });

    if (mode === 'adapt' && existingRoadmap) {
      const zodAdapt = z.object({
        reason: z.string(),
        added: z.array(z.string()),
        removed: z.array(z.string()),
        reprioritised: z.array(z.string()),
        updatedIncompleteWeeks: z.array(zodWeek),
      });

      const result = await callStructuredGemini({
        systemInstruction:
          'You are the RolexIQ Planner Agent adapting an existing roadmap. NEVER modify or remove completed tasks. Keep estHours per week <= hoursPerWeek. Recommend resources ONLY from well-known official docs (MDN, React, TypeScript, Python, PostgreSQL, AWS/GCP/Microsoft docs, freeCodeCamp, Kaggle). Provide url ONLY if confident it is an exact canonical documentation URL; otherwise omit url, provide searchTerm, and set verified:false.',
        prompt: JSON.stringify({
          trigger,
          reasonContext,
          hoursPerWeek,
          targetWeeks,
          rankedGaps: (gaps || []).slice(0, 15),
          existingWeeks: existingRoadmap.weeks,
        }),
        zodSchema: zodAdapt,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reason: { type: Type.STRING },
            added: { type: Type.ARRAY, items: { type: Type.STRING } },
            removed: { type: Type.ARRAY, items: { type: Type.STRING } },
            reprioritised: { type: Type.ARRAY, items: { type: Type.STRING } },
            updatedIncompleteWeeks: { type: Type.ARRAY, items: weekSchema },
          },
          required: ['reason', 'added', 'removed', 'reprioritised', 'updatedIncompleteWeeks'],
        },
      });

      if (!result.ok) {
        return sendErr(
          res,
          statusFromGeminiCode(result.code),
          result.error,
          result.code,
          result.retryable
        );
      }
      return sendOk(res, result.data, { model: result.model });
    }

    const zodCreate = z.object({
      weeks: z.array(zodWeek),
    });

    const weeksCount = Math.min(12, Math.max(2, Number(targetWeeks) || 6));
    const hrs = Math.min(40, Math.max(2, Number(hoursPerWeek) || 8));

    const result = await callStructuredGemini({
      systemInstruction: `You are the RolexIQ Planner Agent. Build a ${weeksCount}-week learning roadmap prioritizing cross-company high-priority gaps. CRITICAL: estHours for EVERY week MUST be <= ${hrs}. Recommend resources ONLY from official docs (MDN, official language/framework docs, AWS/GCP/Azure docs, freeCodeCamp, Kaggle). Provide url ONLY if confident it is real; otherwise provide searchTerm and set verified:false. Never invent courses or certifications.`,
      prompt: JSON.stringify({
        hoursPerWeek: hrs,
        targetWeeks: weeksCount,
        rankedGaps: (gaps || []).slice(0, 18),
      }),
      zodSchema: zodCreate,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weeks: { type: Type.ARRAY, items: weekSchema },
        },
        required: ['weeks'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }

    const cappedWeeks = result.data.weeks.map((w, idx) => ({
      ...w,
      n: idx + 1,
      estHours: Math.min(hrs, Math.max(1, Number(w.estHours.toFixed(1)))),
      tasks: w.tasks.map((t, tIdx) => ({
        id: t.id || `task-w${idx + 1}-${tIdx + 1}`,
        text: t.text,
        status: 'todo' as const,
      })),
    }));

    return sendOk(res, { weeks: cappedWeeks }, { model: result.model });
  });

  // 6. Mentor Agent (Portfolio projects & Evidence verification)
  router.post('/ai/mentor', rateLimit(), async (req, res) => {
    const { action, gaps, targetRoles, project, submission } = req.body ?? {};

    if (action === 'verify_evidence') {
      if (!submission?.notes && !submission?.url) {
        return sendErr(
          res,
          400,
          'Please provide a repository/document link or detailed technical notes to verify.',
          'VALIDATION_ERROR',
          false
        );
      }

      const zodVerify = z.object({
        skillsVerified: z.array(z.string()),
        skillsUnverified: z.array(z.string()),
        verificationNotes: z.string(),
      });

      const result = await callStructuredGemini({
        systemInstruction:
          'You are the RolexIQ Mentor Agent verifying portfolio project evidence. Verify ONLY skills that are genuinely supported by the technical details, architecture, implementation specifics, or deliverables described in the candidate notes/URL. If a skill is merely listed without substance in the notes, put it in skillsUnverified. Never accept empty or generic claims.',
        prompt: JSON.stringify({
          projectTitle: project?.title,
          projectDeliverables: project?.deliverables,
          skillsClaimed: submission.skillsClaimed,
          url: submission.url,
          notes: submission.notes,
        }),
        zodSchema: zodVerify,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            skillsVerified: { type: Type.ARRAY, items: { type: Type.STRING } },
            skillsUnverified: { type: Type.ARRAY, items: { type: Type.STRING } },
            verificationNotes: { type: Type.STRING },
          },
          required: ['skillsVerified', 'skillsUnverified', 'verificationNotes'],
        },
      });

      if (!result.ok) {
        return sendErr(
          res,
          statusFromGeminiCode(result.code),
          result.error,
          result.code,
          result.retryable
        );
      }
      return sendOk(res, result.data, { model: result.model });
    }

    const zodProjects = z.object({
      projects: z.array(
        z.object({
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
        })
      ),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Mentor Agent. Design 2-3 tailored portfolio projects directly addressing the top ranked skill gaps and target roles. Include all 14 required fields with realistic, verifiable architecture and deliverables.',
      prompt: JSON.stringify({
        topGaps: (gaps || []).slice(0, 10),
        targetRoles: targetRoles || [],
      }),
      zodSchema: zodProjects,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                gapSkillIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                title: { type: Type.STRING },
                problem: { type: Type.STRING },
                relevance: { type: Type.STRING },
                skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                whyForRole: { type: Type.STRING },
                tech: { type: Type.ARRAY, items: { type: Type.STRING } },
                dataSources: { type: Type.ARRAY, items: { type: Type.STRING } },
                architecture: { type: Type.STRING },
                milestones: { type: Type.ARRAY, items: { type: Type.STRING } },
                deliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
                evaluationCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
                repoStructure: { type: Type.STRING },
                presentationTips: { type: Type.STRING },
                evidenceableSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'gapSkillIds',
                'title',
                'problem',
                'relevance',
                'skills',
                'whyForRole',
                'tech',
                'dataSources',
                'architecture',
                'milestones',
                'deliverables',
                'evaluationCriteria',
                'repoStructure',
                'presentationTips',
                'evidenceableSkills',
              ],
            },
          },
        },
        required: ['projects'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 7. Interviewer Agent (Text, Voice Sequential & Q1 Bootstrap)
  router.post('/ai/interviewer', rateLimit(), async (req, res) => {
    const { config, companyName, roleTitle, jd, topGaps, turns, elapsedMin } = req.body ?? {};

    const zodInterviewer = z.object({
      action: z.enum(['ask', 'follow_up', 'close']),
      topic: z.string(),
      skillId: z.string(),
      spokenText: z.string(),
    });

    const result = await callStructuredGemini({
      systemInstruction: `You are the RolexIQ Interviewer Agent conducting a ${config?.type || 'Technical'} interview (${config?.difficulty || 'Standard'} difficulty) for ${roleTitle || 'the role'} at ${companyName || 'the target company'}.
RULES:
1. Ask ONE focused, clear question at a time.
2. Reference the candidate's actual previous answer when following up—probe vague claims, ask for justification of trade-offs, and explore alternatives.
3. Never repeat a question already in turns.
4. Prioritize required/weak skills from topGaps and jd.
5. NEVER reveal numerical scores or rubric grades during the interview.
6. If elapsedMin >= durationMin - 1 or turns >= 6, set action:"close" and deliver a concise closing statement thanking the candidate.`,
      prompt: JSON.stringify({
        config,
        companyName,
        roleTitle,
        jdSummary: {
          responsibilities: jd?.responsibilities?.slice(0, 5) || [],
          requirements: jd?.requirements?.slice(0, 10) || [],
        },
        topGaps: (topGaps || []).slice(0, 6),
        priorTurns: turns || [],
        elapsedMin: elapsedMin || 0,
      }),
      zodSchema: zodInterviewer,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ['ask', 'follow_up', 'close'] },
          topic: { type: Type.STRING },
          skillId: { type: Type.STRING },
          spokenText: { type: Type.STRING },
        },
        required: ['action', 'topic', 'skillId', 'spokenText'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 7b. TTS Endpoint for Sequential Voice fallback
  router.post('/ai/tts', rateLimit(), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return sendErr(res, 400, 'Text is required for speech synthesis.', 'VALIDATION_ERROR', false);
    }
    try {
      const audio = await generateSpeechWav(text.slice(0, 1500));
      return sendOk(res, audio);
    } catch (err) {
      const classified = classifyGeminiError(err);
      return sendErr(
        res,
        502,
        classified.error || 'Server voice synthesis is temporarily unavailable.',
        'TTS_UNAVAILABLE',
        false
      );
    }
  });

  // 8. Evaluator Agent (post-session rubric scoring strictly on content)
  router.post('/ai/evaluator', rateLimit(), async (req, res) => {
    const { session, companyName, roleTitle, rubricWeights, previousScores } = req.body ?? {};
    const turns = session?.turns || [];
    if (!Array.isArray(turns) || turns.length === 0) {
      return sendErr(
        res,
        400,
        'Cannot evaluate an empty interview transcript.',
        'VALIDATION_ERROR',
        false
      );
    }

    const weights = Array.isArray(rubricWeights) && rubricWeights.length > 0 ? rubricWeights : [];
    const totalWeight = weights.reduce(
      (s: number, w: { weight: number }) => s + Number(w.weight || 0),
      0
    );
    if (totalWeight !== 100) {
      return sendErr(
        res,
        400,
        `Rubric weights must sum to 100 (received ${totalWeight}).`,
        'VALIDATION_ERROR',
        false
      );
    }

    const zodEval = z.object({
      criterionScores: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          weight: z.number(),
          earned: z.number(),
          rationale: z.string(),
        })
      ),
      questionEvaluations: z.array(
        z.object({
          turnId: z.string(),
          topic: z.string(),
          skillId: z.string(),
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
        })
      ),
      technicalStrengths: z.array(z.string()),
      knowledgeGaps: z.array(z.string()),
      problemSolvingAssessment: z.string(),
      communicationFeedback: z.string(),
      weakTopics: z.array(z.string()),
      answerImprovements: z.array(z.string()),
      topicsToRevise: z.array(z.string()),
      practiceExercises: z.array(z.string()),
      nextInterviewStrategy: z.string(),
      comparisonWithPrevious: z.string(),
      readinessImpactNote: z.string(),
    });

    const result = await callStructuredGemini({
      systemInstruction: `You are the RolexIQ Evaluator Agent. Evaluate ONLY the substance and reasoning of the candidate's transcript answers against the rubric.
FAIRNESS MANDATE:
- Filler words ("um", "uh", "like"), pauses, restarts, speaking speed, accent, or delivery style MUST NEVER reduce any score.
- Do NOT reward buzzwords without correct technical reasoning.
- Every question evaluation MUST include a short quoted transcriptExcerpt directly from the candidate's transcript as evidence.
- Score criterion earned points strictly within [0, weight].
- Set communicationFeedback strictly to clarity, relevance, coherence, and structure of reasoning.`,
      prompt: JSON.stringify({
        companyName,
        roleTitle,
        interviewType: session.config?.type,
        difficulty: session.config?.difficulty,
        rubricWeights: weights,
        turns: turns.map(
          (t: { id: string; topic: string; skillId?: string; question: string; transcript: string }) => ({
            turnId: t.id,
            topic: t.topic,
            skillId: t.skillId || t.topic,
            question: t.question,
            transcript: t.transcript,
          })
        ),
        previousScores: previousScores || [],
      }),
      zodSchema: zodEval,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criterionScores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                label: { type: Type.STRING },
                weight: { type: Type.NUMBER },
                earned: { type: Type.NUMBER },
                rationale: { type: Type.STRING },
              },
              required: ['key', 'label', 'weight', 'earned', 'rationale'],
            },
          },
          questionEvaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                turnId: { type: Type.STRING },
                topic: { type: Type.STRING },
                skillId: { type: Type.STRING },
                question: { type: Type.STRING },
                transcript: { type: Type.STRING },
                score: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
                strongPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                missingElements: { type: Type.ARRAY, items: { type: Type.STRING } },
                technicalInaccuracies: { type: Type.ARRAY, items: { type: Type.STRING } },
                improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                sampleImprovedAnswer: { type: Type.STRING },
                transcriptExcerpt: { type: Type.STRING },
              },
              required: [
                'turnId',
                'topic',
                'skillId',
                'question',
                'transcript',
                'score',
                'explanation',
                'strongPoints',
                'missingElements',
                'technicalInaccuracies',
                'improvements',
                'sampleImprovedAnswer',
                'transcriptExcerpt',
              ],
            },
          },
          technicalStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          knowledgeGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
          problemSolvingAssessment: { type: Type.STRING },
          communicationFeedback: { type: Type.STRING },
          weakTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          answerImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
          topicsToRevise: { type: Type.ARRAY, items: { type: Type.STRING } },
          practiceExercises: { type: Type.ARRAY, items: { type: Type.STRING } },
          nextInterviewStrategy: { type: Type.STRING },
          comparisonWithPrevious: { type: Type.STRING },
          readinessImpactNote: { type: Type.STRING },
        },
        required: [
          'criterionScores',
          'questionEvaluations',
          'technicalStrengths',
          'knowledgeGaps',
          'problemSolvingAssessment',
          'communicationFeedback',
          'weakTopics',
          'answerImprovements',
          'topicsToRevise',
          'practiceExercises',
          'nextInterviewStrategy',
          'comparisonWithPrevious',
          'readinessImpactNote',
        ],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }

    const normalizedCriteria = weights.map((w: { key: string; label: string; weight: number }) => {
      const found = result.data.criterionScores.find((c) => c.key === w.key || c.label === w.label);
      const earned = found ? Math.min(w.weight, Math.max(0, Number(found.earned.toFixed(1)))) : 0;
      return {
        key: w.key,
        label: w.label,
        weight: w.weight,
        earned,
        rationale: found?.rationale || 'Evaluated from transcript content.',
      };
    });

    const overallScore = Number(
      normalizedCriteria.reduce((acc, c) => acc + c.earned, 0).toFixed(1)
    );

    const practiceOutcomeLabel =
      overallScore >= 80
        ? ('Strong preparation' as const)
        : overallScore >= 65
          ? ('Progressing well' as const)
          : overallScore >= 45
            ? ('Needs targeted improvement' as const)
            : ('Not yet ready for the next level of practice' as const);

    const deliveryObservations: string[] = (session.coachingEvents || []).map(
      (ev: { feature: string; metricDetail: string; message: string }) =>
        `${ev.metricDetail} — note shown: "${ev.message}" (unscored)`
    );

    return sendOk(res, {
      overallScore,
      practiceOutcomeLabel,
      disclaimer: 'Practice simulation, not a hiring prediction',
      rubricWeightsUsed: weights,
      criterionScores: normalizedCriteria,
      questionEvaluations: result.data.questionEvaluations,
      technicalStrengths: result.data.technicalStrengths,
      knowledgeGaps: result.data.knowledgeGaps,
      problemSolvingAssessment: result.data.problemSolvingAssessment,
      communicationFeedback: result.data.communicationFeedback,
      deliveryObservations,
      weakTopics: result.data.weakTopics,
      answerImprovements: result.data.answerImprovements,
      topicsToRevise: result.data.topicsToRevise,
      practiceExercises: result.data.practiceExercises,
      nextInterviewStrategy: result.data.nextInterviewStrategy,
      comparisonWithPrevious: result.data.comparisonWithPrevious,
      readinessImpactNote: result.data.readinessImpactNote,
      generatedAt: new Date().toISOString(),
    });
  });

  // 9. Insights Agent (narrates code-computed application statistics)
  router.post('/ai/insights', rateLimit(), async (req, res) => {
    const { analytics } = req.body ?? {};
    if (!analytics) {
      return sendErr(res, 400, 'Application analytics data is required.', 'VALIDATION_ERROR', false);
    }

    const zodOut = z.object({
      summary: z.string(),
      caveat: z.string(),
      observations: z.array(z.string()),
    });

    const result = await callStructuredGemini({
      systemInstruction:
        'You are the RolexIQ Insights Agent. Summarize ONLY the supplied computed application statistics. Include explicit sample-size caveats (groups n<5 or overall n<10 cannot establish patterns). Use associative wording ("appears to", "in your data") and NEVER claim causation.',
      prompt: JSON.stringify(analytics),
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          caveat: { type: Type.STRING },
          observations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'caveat', 'observations'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 10. Content Agent (LinkedIn Studio)
  router.post('/ai/content', rateLimit(), async (req, res) => {
    const { postType, selectedEvidence, targetRole, tone, length } = req.body ?? {};
    if (!Array.isArray(selectedEvidence) || selectedEvidence.length === 0) {
      return sendErr(
        res,
        400,
        'Select at least one completed achievement or milestone to draft a post.',
        'VALIDATION_ERROR',
        false
      );
    }

    const validTone = ['professional', 'conversational', 'storytelling', 'technical'].includes(tone)
      ? tone
      : 'professional';
    const validLength = ['short', 'medium', 'detailed'].includes(length) ? length : 'medium';

    const lengthGuidance =
      validLength === 'short'
        ? 'Keep the post concise: 70-120 words with crisp takeaways.'
        : validLength === 'detailed'
          ? 'Write a thorough breakdown: 220-320 words with context, implementation detail, and reflection.'
          : 'Write a balanced medium post: 130-200 words.';

    const zodOut = z.object({
      text: z.string(),
      placeholdersUsed: z.array(z.string()),
    });

    const result = await callStructuredGemini({
      systemInstruction: `You are the RolexIQ Content Agent. Write an authentic LinkedIn post strictly grounded in the selected evidence items.
Tone: ${validTone}.
Length guidance: ${lengthGuidance}
Use [Placeholder: ...] brackets for any personal reflection, metric, or link not explicitly present in the selected items. Never invent metrics, employers, or outcomes.`,
      prompt: JSON.stringify({
        postType,
        tone: validTone,
        length: validLength,
        selectedEvidence,
        targetRole,
      }),
      zodSchema: zodOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          placeholdersUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['text', 'placeholdersUsed'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }
    return sendOk(res, result.data, { model: result.model });
  });

  // 11. Preparation Track Generator (Track A Role Mastery & Track B Company Prep)
  router.post('/ai/preparation', rateLimit(), async (req, res) => {
    const {
      trackType,
      roleTitle,
      companyId,
      companyName,
      jdId,
      jdRequirements,
      sharedSkills,
      companySpecificSkills,
      gaps,
      resumeSummary,
    } = req.body ?? {};

    const mode = trackType === 'company' ? 'company' : 'role';
    if (mode === 'company' && !companyName) {
      return sendErr(res, 400, 'Company name is required for company-specific preparation.', 'VALIDATION_ERROR', false);
    }

    const modItemZod = z.object({
      id: z.string(),
      title: z.string(),
      category: z.enum(['core_concept', 'hands_on', 'system_design', 'behavioural', 'company_specific']),
      priority: z.enum(['critical', 'high', 'medium']),
      skillTag: z.string(),
      summary: z.string(),
      checklist: z.array(z.string()).min(2).max(5),
      practicePrompt: z.string(),
    });

    const modItemSchema = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        category: {
          type: Type.STRING,
          enum: ['core_concept', 'hands_on', 'system_design', 'behavioural', 'company_specific'],
        },
        priority: { type: Type.STRING, enum: ['critical', 'high', 'medium'] },
        skillTag: { type: Type.STRING },
        summary: { type: Type.STRING },
        checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
        practicePrompt: { type: Type.STRING },
      },
      required: ['id', 'title', 'category', 'priority', 'skillTag', 'summary', 'checklist', 'practicePrompt'],
    };

    if (mode === 'role') {
      const zodOut = z.object({
        roleTitle: z.string(),
        coreCompetencies: z.array(z.string()).min(2).max(10),
        sharedCompanyThemes: z.array(z.string()).min(1).max(6),
        modules: z.array(modItemZod).min(3).max(6),
      });

      const result = await callStructuredGemini({
        systemInstruction: `You are the RolexIQ Role Mastery Architect (Track A).
Build a structured, foundational ROLE MASTERY track covering competencies shared across target roles and the candidate's highest-priority capability gaps.
Base everything ONLY on the provided target roles, extracted JD requirements, gap scores, and candidate summary. Never invent company expectations.`,
        prompt: JSON.stringify({
          roleTitle: roleTitle || 'Target Role',
          sharedSkills,
          gaps: Array.isArray(gaps) ? gaps.slice(0, 10) : [],
          resumeSummary,
        }),
        zodSchema: zodOut,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            roleTitle: { type: Type.STRING },
            coreCompetencies: { type: Type.ARRAY, items: { type: Type.STRING } },
            sharedCompanyThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
            modules: { type: Type.ARRAY, items: modItemSchema },
          },
          required: ['roleTitle', 'coreCompetencies', 'sharedCompanyThemes', 'modules'],
        },
      });

      if (!result.ok) {
        return sendErr(
          res,
          statusFromGeminiCode(result.code),
          result.error,
          result.code,
          result.retryable
        );
      }

      return sendOk(
        res,
        {
          ...result.data,
          modules: result.data.modules.map((m, idx) => ({
            ...m,
            id: m.id || `role-mod-${Date.now()}-${idx}`,
            completed: false,
          })),
          generatedAt: new Date().toISOString(),
        },
        { model: result.model }
      );
    }

    const zodCompanyOut = z.object({
      companyFocusSummary: z.string(),
      interviewFormatNotes: z.array(z.string()).min(2).max(5),
      modules: z.array(modItemZod).min(3).max(6),
    });

    const result = await callStructuredGemini({
      systemInstruction: `You are the RolexIQ Company Preparation Strategist (Track B).
Build a company-specific preparation track for ${companyName} (${roleTitle || 'Target Role'}).
Clearly distinguish shared role skills from company-specific requirements stated in the JD. Never invent secret company hiring criteria not grounded in the JD.`,
      prompt: JSON.stringify({
        companyName,
        roleTitle,
        sharedSkills,
        companySpecificSkills,
        jdRequirements,
        gaps: Array.isArray(gaps) ? gaps.slice(0, 8) : [],
      }),
      zodSchema: zodCompanyOut,
      thinkingLevel: ThinkingLevel.LOW,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          companyFocusSummary: { type: Type.STRING },
          interviewFormatNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          modules: { type: Type.ARRAY, items: modItemSchema },
        },
        required: ['companyFocusSummary', 'interviewFormatNotes', 'modules'],
      },
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }

    return sendOk(
      res,
      {
        companyId: companyId || `comp-${Date.now()}`,
        companyName,
        roleTitle: roleTitle || 'Target Role',
        jdId: jdId || '',
        companyFocusSummary: result.data.companyFocusSummary,
        sharedSkills: Array.isArray(sharedSkills) ? sharedSkills : [],
        companySpecificSkills: Array.isArray(companySpecificSkills) ? companySpecificSkills : [],
        interviewFormatNotes: result.data.interviewFormatNotes,
        modules: result.data.modules.map((m, idx) => ({
          ...m,
          id: m.id || `comp-mod-${Date.now()}-${idx}`,
          completed: false,
        })),
        generatedAt: new Date().toISOString(),
      },
      { model: result.model }
    );
  });

  // 12. Learning Resource Discovery Agent (Google Search Grounded)
  router.post('/ai/resources', rateLimit(), async (req, res) => {
    const { skill, targetRole, companyName, level, preferredFormat } = req.body ?? {};
    if (!skill || typeof skill !== 'string' || !skill.trim()) {
      return sendErr(res, 400, 'Please specify a skill or topic to search resources for.', 'VALIDATION_ERROR', false);
    }

    const result = await searchLearningResourcesWithGemini({
      skill: skill.trim(),
      targetRole: typeof targetRole === 'string' ? targetRole.trim() : undefined,
      companyName: typeof companyName === 'string' ? companyName.trim() : undefined,
      level: typeof level === 'string' ? level.trim() : undefined,
      preferredFormat: typeof preferredFormat === 'string' ? preferredFormat.trim() : undefined,
    });

    if (!result.ok) {
      return sendErr(
        res,
        statusFromGeminiCode(result.code),
        result.error,
        result.code,
        result.retryable
      );
    }

    return sendOk(res, result.data, { model: result.model });
  });

  // 13. Audio Transcription (Gemini Speech-to-Text fallback/assist for Interview Arena)
  router.post('/ai/transcribe', rateLimit(60), upload.single('audio'), async (req, res) => {
    if (!isGeminiConfigured()) {
      return sendErr(
        res,
        503,
        'AI transcription is unavailable because GEMINI_API_KEY is not configured.',
        'MISSING_KEY',
        false
      );
    }

    let base64Audio = '';
    let mimeType = 'audio/webm';

    if (req.file?.buffer) {
      base64Audio = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype || 'audio/webm';
    } else if (req.body?.audioBase64 && typeof req.body.audioBase64 === 'string') {
      const raw = req.body.audioBase64.trim();
      const commaIdx = raw.indexOf(',');
      base64Audio = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw;
      mimeType = typeof req.body.mimeType === 'string' ? req.body.mimeType : 'audio/webm';
    }

    if (!base64Audio || base64Audio.length < 16) {
      return sendErr(res, 400, 'No recorded audio payload was provided.', 'VALIDATION_ERROR', false);
    }

    try {
      const result = await transcribeAudioWithGemini(base64Audio, mimeType);
      return sendOk(res, { transcript: result.transcript }, { model: result.model });
    } catch (err) {
      const classified = classifyGeminiError(err);
      return sendErr(
        res,
        statusFromGeminiCode(classified.code),
        classified.error,
        classified.code,
        classified.retryable
      );
    }
  });

  // Explicit 404 JSON catch-all so unmatched /api/* never hits SPA HTML
  router.use((_req, res) => {
    return sendErr(res, 404, 'API endpoint not found.', 'NOT_FOUND', false);
  });

  return router;
}
