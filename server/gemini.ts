import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { z } from 'zod';
import { TEXT_MODEL, TRANSCRIPTION_MODEL, TTS_MODEL } from './config';

let sharedClient: GoogleGenAI | null = null;
let sharedAlphaClient: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY');
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiConfigError('Gemini AI service is not configured on the server.');
  }
  if (!sharedClient) {
    sharedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedClient;
}

export function getGeminiAlphaClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiConfigError('Gemini AI service is not configured on the server.');
  }
  if (!sharedAlphaClient) {
    sharedAlphaClient = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1alpha',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedAlphaClient;
}

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

export type GeminiErrorCode =
  | 'MISSING_KEY'
  | 'RATE_LIMIT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_SCHEMA'
  | 'TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'UPSTREAM_ERROR';

export interface StructuredCallResult<T> {
  ok: true;
  data: T;
  model: string;
}

export interface StructuredCallError {
  ok: false;
  data: null;
  error: string;
  code: GeminiErrorCode;
  retryable: boolean;
}

function isTransientUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
}

export function classifyGeminiError(err: unknown): StructuredCallError {
  if (err instanceof GeminiConfigError) {
    return {
      ok: false,
      data: null,
      error: err.message,
      code: 'MISSING_KEY',
      retryable: false,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      ok: false,
      data: null,
      error: 'The AI service is currently busy (rate limit reached). Please wait a moment and try again.',
      code: 'RATE_LIMIT',
      retryable: true,
    };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return {
      ok: false,
      data: null,
      error: 'The AI model is experiencing temporary high demand. Please retry in a few seconds.',
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    };
  }
  if (msg.includes('timeout') || msg.includes('AbortError')) {
    return {
      ok: false,
      data: null,
      error: 'The AI request timed out before finishing. Please try again.',
      code: 'TIMEOUT',
      retryable: true,
    };
  }
  if (msg.includes('empty response')) {
    return {
      ok: false,
      data: null,
      error: 'The AI returned an empty response. Please try again.',
      code: 'EMPTY_RESPONSE',
      retryable: true,
    };
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return {
      ok: false,
      data: null,
      error: 'The configured AI key was rejected by the upstream service.',
      code: 'MISSING_KEY',
      retryable: false,
    };
  }
  // Extract readable nested JSON message if upstream returned raw Google RPC JSON
  let cleanMessage = msg;
  try {
    const startIdx = msg.indexOf('{');
    if (startIdx >= 0) {
      const parsed = JSON.parse(msg.slice(startIdx)) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        cleanMessage = parsed.error.message;
      }
    }
  } catch {
    // keep raw message
  }
  return {
    ok: false,
    data: null,
    error: cleanMessage || 'AI service request failed.',
    code: 'UPSTREAM_ERROR',
    retryable: true,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const STRICT_GROUNDING_PREAMBLE = `CRITICAL GROUNDING & HONESTY RULES:
1. Use ONLY the supplied data. Never fabricate achievements, certifications, metrics, URLs, company hiring criteria, or sources.
2. Mark anything inferred rather than directly stated as basis:"inferred" (or clearly state it is inferred).
3. If data is missing or unknown, leave the field empty or state that it is missing—never guess or invent facts.
4. Output strictly valid JSON conforming to the provided schema.`;

export async function callStructuredGemini<T>(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Schema;
  zodSchema: z.ZodType<T>;
  thinkingLevel?: ThinkingLevel;
  inlineParts?: Array<{ inlineData: { mimeType: string; data: string } }>;
}): Promise<StructuredCallResult<T> | StructuredCallError> {
  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    return classifyGeminiError(err);
  }

  const fullSystem = `${STRICT_GROUNDING_PREAMBLE}\n\n${params.systemInstruction}`;

  const invokeWithBackoff = async (userPrompt: string) => {
    const contents = params.inlineParts?.length
      ? { parts: [...params.inlineParts, { text: userPrompt }] }
      : userPrompt;

    let lastErr: unknown;
    const delays = [900, 2200];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: TEXT_MODEL,
            contents,
            config: {
              systemInstruction: fullSystem,
              responseMimeType: 'application/json',
              responseSchema: params.responseSchema,
              ...(params.thinkingLevel ? { thinkingConfig: { thinkingLevel: params.thinkingLevel } } : {}),
            },
          }),
          42_000,
          'Gemini request'
        );

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new Error('Model returned an empty response');
        }
        const parsedJson = JSON.parse(rawText);
        return params.zodSchema.parse(parsedJson);
      } catch (err) {
        lastErr = err;
        if (attempt < delays.length && isTransientUpstreamError(err)) {
          await sleep(delays[attempt]);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  };

  try {
    const data = await invokeWithBackoff(params.prompt);
    return { ok: true, data, model: TEXT_MODEL };
  } catch (firstErr) {
    const isValidationFailure =
      firstErr instanceof SyntaxError || firstErr instanceof z.ZodError;
    if (!isValidationFailure) {
      return classifyGeminiError(firstErr);
    }

    const validationMessage =
      firstErr instanceof z.ZodError
        ? firstErr.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : firstErr.message;

    try {
      const retryPrompt = `${params.prompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION (${validationMessage}). Fix the JSON structure strictly to match the schema without fabricating data.`;
      const data = await invokeWithBackoff(retryPrompt);
      return { ok: true, data, model: TEXT_MODEL };
    } catch (secondErr) {
      if (secondErr instanceof SyntaxError || secondErr instanceof z.ZodError) {
        return {
          ok: false,
          data: null,
          error: 'The AI output did not match the expected structure. Please try again.',
          code: 'INVALID_SCHEMA',
          retryable: true,
        };
      }
      return classifyGeminiError(secondErr);
    }
  }
}

export async function extractPdfTextWithGemini(base64Pdf: string): Promise<string> {
  const ai = getGeminiClient();
  const response = await withTimeout(
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
          {
            text: 'Extract all readable text verbatim from this PDF document in reading order. Return plain text only, without commentary or added facts.',
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    }),
    35_000,
    'PDF OCR extraction'
  );
  return (response.text ?? '').trim();
}

export async function transcribeAudioWithGemini(
  base64Audio: string,
  mimeType: string
): Promise<{ transcript: string; model: string }> {
  const ai = getGeminiClient();
  const safeMime =
    mimeType && mimeType.startsWith('audio/') ? mimeType.split(';')[0].trim() : 'audio/webm';

  const response = await withTimeout(
    ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe this spoken interview response verbatim in English. Return only the spoken words without timestamps, commentary, or labels.',
          },
        ],
      },
    }),
    30_000,
    'Audio transcription'
  );

  return {
    transcript: (response.text ?? '').trim(),
    model: TRANSCRIPTION_MODEL,
  };
}

export interface GroundedResourceOutput {
  resources: Array<{
    skill: string;
    title: string;
    provider: string;
    resourceType: 'documentation' | 'course' | 'tutorial' | 'article' | 'video' | 'practice' | 'book';
    difficulty: 'foundational' | 'intermediate' | 'advanced';
    format: 'interactive' | 'reading' | 'video' | 'project';
    estimatedMinutes: number;
    summary: string;
    whyRecommended: string;
    url?: string;
    searchTerm: string;
    verified: boolean;
  }>;
  groundedSourceCount: number;
}

export async function searchLearningResourcesWithGemini(params: {
  skill: string;
  targetRole?: string;
  companyName?: string;
  level?: string;
  preferredFormat?: string;
}): Promise<StructuredCallResult<GroundedResourceOutput> | StructuredCallError> {
  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    return classifyGeminiError(err);
  }

  // Step 1: Run Google Search grounding to collect real, verifiable web URLs
  const groundedSources: Array<{ title: string; uri: string }> = [];
  let searchSummary = '';
  try {
    const queryPrompt = `Find 4 to 6 high-quality official documentation pages, technical courses, hands-on tutorials, or engineering guides to learn "${params.skill}"${params.targetRole ? ` for a ${params.targetRole} candidate` : ''}${params.companyName ? ` preparing for ${params.companyName}` : ''}. Focus on authoritative resources (official docs, engineering blogs, reputable learning platforms).`;

    const searchRes = await withTimeout(
      ai.models.generateContent({
        model: TEXT_MODEL,
        contents: queryPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      25_000,
      'Grounded learning resource search'
    );

    searchSummary = (searchRes.text ?? '').trim();
    const chunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seenUris = new Set<string>();
    for (const chunk of chunks) {
      const uri = chunk.web?.uri?.trim();
      const title = chunk.web?.title?.trim() || 'Reference';
      if (uri && (uri.startsWith('https://') || uri.startsWith('http://')) && !seenUris.has(uri)) {
        seenUris.add(uri);
        groundedSources.push({ title, uri });
      }
    }
  } catch {
    // Grounded web search is optional; fall back cleanly to unverified searchTerm guidance
  }

  const allowedUrls = new Set(groundedSources.map((g) => g.uri));

  const zodOut = z.object({
    resources: z
      .array(
        z.object({
          skill: z.string(),
          title: z.string(),
          provider: z.string(),
          resourceType: z.enum([
            'documentation',
            'course',
            'tutorial',
            'article',
            'video',
            'practice',
            'book',
          ]),
          difficulty: z.enum(['foundational', 'intermediate', 'advanced']),
          format: z.enum(['interactive', 'reading', 'video', 'project']),
          estimatedMinutes: z.number().min(10).max(600),
          summary: z.string(),
          whyRecommended: z.string(),
          url: z.string().optional(),
          searchTerm: z.string(),
          verified: z.boolean(),
        })
      )
      .min(3)
      .max(6),
  });

  const structured = await callStructuredGemini({
    systemInstruction: `You are the RolexIQ Learning Resource Discovery Agent.
Recommend 4 to 5 focused, practical learning resources for the requested skill.
CRITICAL URL RULE:
- You may ONLY include a "url" field AND set "verified": true if that exact URL appears verbatim in GROUNDED_SOURCES below.
- If no matching URL exists in GROUNDED_SOURCES for an item, omit "url" (leave undefined/empty), set "verified": false, and provide a crisp "searchTerm" so the user can find it safely without broken links.
- Never invent or guess any URL.`,
    prompt: JSON.stringify({
      request: params,
      GROUNDED_SOURCES: groundedSources,
      searchNotes: searchSummary.slice(0, 2000),
    }),
    zodSchema: zodOut,
    thinkingLevel: ThinkingLevel.LOW,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        resources: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              skill: { type: Type.STRING },
              title: { type: Type.STRING },
              provider: { type: Type.STRING },
              resourceType: {
                type: Type.STRING,
                enum: ['documentation', 'course', 'tutorial', 'article', 'video', 'practice', 'book'],
              },
              difficulty: {
                type: Type.STRING,
                enum: ['foundational', 'intermediate', 'advanced'],
              },
              format: {
                type: Type.STRING,
                enum: ['interactive', 'reading', 'video', 'project'],
              },
              estimatedMinutes: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              whyRecommended: { type: Type.STRING },
              url: { type: Type.STRING },
              searchTerm: { type: Type.STRING },
              verified: { type: Type.BOOLEAN },
            },
            required: [
              'skill',
              'title',
              'provider',
              'resourceType',
              'difficulty',
              'format',
              'estimatedMinutes',
              'summary',
              'whyRecommended',
              'searchTerm',
              'verified',
            ],
          },
        },
      },
      required: ['resources'],
    },
  });

  if (!structured.ok) {
    return structured;
  }

  // Enforce strict server-side verification gate on returned URLs
  const sanitizedResources = structured.data.resources.map((r) => {
    const cleanUrl = r.url?.trim();
    const isGrounded = Boolean(cleanUrl && allowedUrls.has(cleanUrl));
    return {
      ...r,
      url: isGrounded ? cleanUrl : undefined,
      verified: isGrounded,
    };
  });

  return {
    ok: true,
    model: structured.model,
    data: {
      resources: sanitizedResources,
      groundedSourceCount: groundedSources.length,
    },
  };
}

export async function generateSpeechWav(
  text: string,
  style = 'Clear, calm, professional technical interviewer'
): Promise<{ audioBase64: string; mimeType: string }> {
  const clients = [getGeminiClient(), getGeminiAlphaClient()];
  const requests = [
    // Primary documented pattern
    (ai: GoogleGenAI) =>
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: { style },
              } as unknown as { text: string },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }),
    // Fallback without speechMetadata if backend endpoint rejects that field
    (ai: GoogleGenAI) =>
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: `${style}: ${text}`,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }),
  ];

  let lastError: unknown;
  for (const ai of clients) {
    for (const runReq of requests) {
      try {
        const response = await withTimeout(runReq(ai), 20_000, 'TTS synthesis');
        const part = response.candidates?.[0]?.content?.parts?.[0];
        const base64Audio = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType || 'audio/wav';
        if (base64Audio) {
          return { audioBase64: base64Audio, mimeType };
        }
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        // Only try next variant if argument/endpoint mismatch or transient error
        if (!msg.includes('400') && !msg.includes('404') && !isTransientUpstreamError(err)) {
          throw err;
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('TTS model did not return audio data.');
}

export interface HealthProbeStatus {
  configured: boolean;
  status: 'healthy' | 'degraded' | 'unavailable';
  reachable: boolean;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
}

let cachedProbe: { value: HealthProbeStatus; expiresAt: number } | null = null;

export async function probeGeminiHealth(force = false): Promise<HealthProbeStatus> {
  if (!isGeminiConfigured()) {
    return {
      configured: false,
      status: 'unavailable',
      reachable: false,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      message: 'AI key is not configured on the server.',
    };
  }

  if (!force && cachedProbe && Date.now() < cachedProbe.expiresAt) {
    return cachedProbe.value;
  }

  const startedAt = Date.now();
  try {
    const ai = getGeminiClient();
    const res = await withTimeout(
      ai.models.generateContent({
        model: TEXT_MODEL,
        contents: 'Reply with OK',
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      }),
      10_000,
      'Gemini health probe'
    );
    const latencyMs = Date.now() - startedAt;
    const text = (res.text ?? '').trim();
    const status: HealthProbeStatus = {
      configured: true,
      status: text ? 'healthy' : 'degraded',
      reachable: true,
      latencyMs,
      checkedAt: new Date().toISOString(),
      message: text ? 'Connected and responding normally.' : 'Connected, minimal response received.',
    };
    cachedProbe = { value: status, expiresAt: Date.now() + 60_000 };
    return status;
  } catch (err) {
    const classified = classifyGeminiError(err);
    const status: HealthProbeStatus = {
      configured: true,
      status: classified.retryable ? 'degraded' : 'unavailable',
      reachable: false,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      message: classified.error,
    };
    cachedProbe = { value: status, expiresAt: Date.now() + 15_000 };
    return status;
  }
}
