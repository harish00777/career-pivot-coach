# RolexIQ — From Potential to Proven Capability

RolexIQ is a full-stack AI Career Intelligence & Interview Readiness Platform built with React, TypeScript, Vite, Tailwind CSS, Express, Firebase Firestore (with IndexedDB on-device fallback), and the `@google/genai` SDK.

## Active Gemini Models (`server/config.ts`)
- **Text / Structured Extraction / Evaluation**: `gemini-4-hydrogen` (`TEXT_MODEL`)
- **Full-Duplex Live Voice Interview**: `gemini-3.8-live` (`LIVE_MODEL`)
- **Turn-Based Speech Synthesis**: `gemini-3.8-flash-lite-tts` (`TTS_MODEL`)

All Gemini API calls execute server-side using `process.env.GEMINI_API_KEY`. The API key is never exposed to the browser.

## Interview Arena Modes
1. **Mode A — Gemini Live (WebSocket `/api/live`)**: Real-time 16 kHz PCM microphone stream up and 24 kHz PCM audio down with live transcription and barge-in. Affective dialog is intentionally disabled.
2. **Mode B — Browser Speech Recognition + Server TTS**: Turn-based fallback using Web Speech API (`SpeechRecognition`) and `/api/ai/tts`.
3. **Mode C — Text-Only Fallback**: Always-available keyboard interview flow for environments without microphone access or WebSocket audio support.

## Fairness & Provenance Guarantees
- **Camera**: Off by default; when enabled for self-view, frames never leave the browser and are never analyzed.
- **Scoring Independence**: Delivery coaching cues (filler phrases, speaking pace, restarts, pauses) are strictly unscored and separated from rubric scoring.
- **Provenance Tags**: Every record displays its origin (`resume`, `candidate`, `uploaded_jd`, `public_jd`, `project_evidence`, `interview`, `application`, `ai_inference`, or `sample_demo`).
- **Known Limitations**: Automated job-board URL fetching (`/api/fetch-jd`) only extracts server-rendered HTML pages and blocks private/internal IPs (SSRF protection). JavaScript-heavy or authenticated postings gracefully prompt for direct paste or file upload.

## Running Locally
- Development server (port `3000`): `npm run dev`
- Production build: `npm run build`
- Production start: `npm start`
- Pure-logic unit tests: `npx tsx --test src/shared/evidenceEngine.test.ts src/shared/analyticsEngine.test.ts`
