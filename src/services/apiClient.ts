export interface ApiFailure {
  ok: false;
  error: string;
  code?: string;
  retryable?: boolean;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

async function parseJsonSafe(res: Response): Promise<{
  payload: Record<string, unknown> | null;
  rawText: string;
}> {
  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text().catch(() => '');
  if (!rawText) {
    return { payload: null, rawText: '' };
  }
  const trimmed = rawText.trim();
  if (
    !contentType.includes('application/json') &&
    (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<'))
  ) {
    return { payload: null, rawText };
  }
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { payload: parsed, rawText };
  } catch {
    return { payload: null, rawText };
  }
}

export async function getJson<T>(
  url: string,
  timeoutMs = 15_000
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const { payload } = await parseJsonSafe(res);
    if (!payload) {
      return {
        ok: false,
        error: `Unable to read response from the server (HTTP ${res.status}).`,
        code: 'UNREADABLE_RESPONSE',
        retryable: res.status >= 500,
      };
    }
    if (!res.ok || payload.ok === false) {
      return {
        ok: false,
        error:
          (typeof payload.error === 'string' && payload.error) ||
          `Request failed with status ${res.status}.`,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        retryable: typeof payload.retryable === 'boolean' ? payload.retryable : res.status >= 500,
      };
    }
    return { ok: true, data: (payload.data ?? payload) as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'The request timed out before finishing. Please try again.',
        code: 'TIMEOUT',
        retryable: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network request failed.',
      code: 'NETWORK_ERROR',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson<T>(
  url: string,
  body: unknown,
  timeoutMs = 55_000
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const { payload } = await parseJsonSafe(res);
    if (!payload) {
      return {
        ok: false,
        error:
          res.status >= 500
            ? 'The server could not complete this request right now. Please try again.'
            : `Unable to read response from the server (HTTP ${res.status}).`,
        code: 'UNREADABLE_RESPONSE',
        retryable: res.status >= 500,
      };
    }
    if (!res.ok || payload.ok === false) {
      return {
        ok: false,
        error:
          (typeof payload.error === 'string' && payload.error) ||
          `Request failed with status ${res.status}.`,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        retryable: typeof payload.retryable === 'boolean' ? payload.retryable : res.status >= 500,
      };
    }
    return { ok: true, data: (payload.data ?? payload) as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'The request took too long to finish. Please try again.',
        code: 'TIMEOUT',
        retryable: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network request failed.',
      code: 'NETWORK_ERROR',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadFileForParsing(
  file: File,
  timeoutMs = 35_000
): Promise<
  | { ok: true; text: string; fileName: string; charCount?: number; method?: string }
  | ApiFailure
> {
  const formData = new FormData();
  formData.append('file', file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/parse-file', {
      method: 'POST',
      signal: controller.signal,
      body: formData,
    });
    const { payload } = await parseJsonSafe(res);
    if (!payload || !res.ok || payload.ok === false) {
      return {
        ok: false,
        error:
          (payload && typeof payload.error === 'string' && payload.error) ||
          `Could not extract text from file (HTTP ${res.status}).`,
        code: payload && typeof payload.code === 'string' ? payload.code : 'PARSE_FAILED',
        retryable: res.status >= 500,
      };
    }
    const inner = (payload.data ?? payload) as {
      text: string;
      fileName: string;
      charCount?: number;
      method?: string;
    };
    return {
      ok: true,
      text: inner.text,
      fileName: inner.fileName,
      charCount: inner.charCount,
      method: inner.method,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'File upload timed out. Try a smaller file or paste your text directly.',
        code: 'TIMEOUT',
        retryable: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'File upload failed.',
      code: 'NETWORK_ERROR',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthStatusResponse {
  status: 'healthy' | 'degraded' | 'unavailable' | 'configured';
  geminiConfigured: boolean;
  models: {
    textModel: string;
    liveModel: string;
    ttsModel: string;
  };
  probe: {
    configured: boolean;
    status: 'healthy' | 'degraded' | 'unavailable';
    reachable: boolean;
    latencyMs: number | null;
    checkedAt: string;
    message: string;
  } | null;
}

export async function probeAiHealth(force = false): Promise<ApiResponse<HealthStatusResponse>> {
  const qs = force ? '?probe=1&force=1' : '?probe=1';
  return getJson<HealthStatusResponse>(`/api/health${qs}`, 15_000);
}
