import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { postJson } from '../services/apiClient';
import { analyzeSpeechFeatures } from '../shared/analyticsEngine';
import { normalizeSkillId } from '../shared/evidenceEngine';
import {
  DEFAULT_RUBRIC_BY_TYPE,
  type CoachingEvent,
  type EvidenceRecord,
  type InterviewReport,
  type InterviewSession,
  type InterviewTurn,
  type InterviewType,
  type RubricCriterion,
} from '../shared/schemas';

type StageStatus =
  | 'idle'
  | 'configuring'
  | 'preparing'
  | 'ready'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'submitting'
  | 'evaluating'
  | 'completed'
  | 'paused'
  | 'error';

const STATUS_LABEL: Record<StageStatus, string> = {
  idle: 'Ready to configure',
  configuring: 'Configuring session',
  preparing: 'Preparing first question...',
  ready: 'Question ready',
  speaking: 'Interviewer speaking',
  listening: 'Your turn to answer',
  thinking: 'Preparing next question...',
  submitting: 'Submitting answer...',
  evaluating: 'Scoring transcript...',
  completed: 'Evaluation ready',
  paused: 'Session paused',
  error: 'Attention needed',
};

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32Pcm(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export function InterviewArenaModule() {
  const { store, analysis, updateStore, interviewPreset, setInterviewPreset, setActiveModule } =
    useCareerStore();

  // Setup configuration
  const [companyId, setCompanyId] = useState(
    interviewPreset?.companyId ?? store.companies[0]?.id ?? ''
  );
  const [roleId, setRoleId] = useState(
    interviewPreset?.roleId ?? store.targetRoles[0]?.id ?? ''
  );
  const [jdId, setJdId] = useState(store.jobDescriptions[0]?.id ?? '');
  const [interviewType, setInterviewType] = useState<InterviewType>('Technical');
  const [difficulty, setDifficulty] =
    useState<InterviewSession['config']['difficulty']>('Standard');
  const [durationMin, setDurationMin] = useState(15);
  const [focus, setFocus] = useState(interviewPreset?.focus ?? '');
  const [coachingEnabled, setCoachingEnabled] = useState(store.settings.coachingDefaultOn);
  const [selectedMode, setSelectedMode] = useState<'live' | 'stt_tts' | 'text'>(
    store.settings.preferredVoiceMode
  );
  const [rubricWeights, setRubricWeights] = useState<RubricCriterion[]>(
    DEFAULT_RUBRIC_BY_TYPE.Technical
  );

  // Browser capability probes
  const [micSupported] = useState(() =>
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  );
  const [sttSupported] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    )
  );
  const [recorderSupported] = useState(
    () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined'
  );

  // Active stage state
  const [view, setView] = useState<'setup' | 'stage' | 'report'>('setup');
  const [activeMode, setActiveMode] = useState<'live' | 'stt_tts' | 'text'>(selectedMode);
  const [stageStatus, setStageStatus] = useState<StageStatus>('idle');
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionClosingPrompt, setSessionClosingPrompt] = useState(false);

  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentTopic, setCurrentTopic] = useState('Opening');
  const [currentSkillId, setCurrentSkillId] = useState('general');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [liveInputDraft, setLiveInputDraft] = useState('');
  const [liveOutputDraft, setLiveOutputDraft] = useState('');

  const [elapsedSec, setElapsedSec] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [transcribingClip, setTranscribingClip] = useState(false);
  const [cameraOn, setCameraOn] = useState(false); // Strictly OFF by default
  const [micLevels, setMicLevels] = useState<number[]>(new Array(16).fill(4));

  // Unscored gentle delivery coaching
  const [coachingEvents, setCoachingEvents] = useState<CoachingEvent[]>([]);
  const [activeToast, setActiveToast] = useState<CoachingEvent | null>(null);
  const lastCoachingShownAtRef = useRef<number>(0);
  const turnStartedAtRef = useRef<number>(Date.now());
  const firstSpeechInTurnAtRef = useRef<number | null>(null);

  // Report state
  const [evaluating, setEvaluating] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(
    store.interviewSessions[0]?.id ?? null
  );

  // Media & WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const liveHandshakeTimerRef = useRef<number | null>(null);
  const speechSafetyTimerRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number>(0);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sttCapturedRef = useRef<string>('');
  const currentTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicesLoadedRef = useRef<SpeechSynthesisVoice[]>([]);
  const cachedQuestionAudioRef = useRef<{ text: string; url: string } | null>(null);

  const activeModeRef = useRef(activeMode);
  activeModeRef.current = activeMode;
  const stageStatusRef = useRef(stageStatus);
  stageStatusRef.current = stageStatus;
  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;
  const currentQuestionRef = useRef(currentQuestion);
  currentQuestionRef.current = currentQuestion;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      voicesLoadedRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    if (interviewPreset) {
      if (interviewPreset.companyId) setCompanyId(interviewPreset.companyId);
      if (interviewPreset.roleId) setRoleId(interviewPreset.roleId);
      if (interviewPreset.focus) setFocus(interviewPreset.focus);
      setInterviewPreset(null);
    }
  }, [interviewPreset, setInterviewPreset]);

  const companyRoles = useMemo(
    () => store.targetRoles.filter((r) => !companyId || r.companyId === companyId),
    [store.targetRoles, companyId]
  );
  const roleJds = useMemo(
    () => store.jobDescriptions.filter((j) => !roleId || j.targetRoleId === roleId),
    [store.jobDescriptions, roleId]
  );

  useEffect(() => {
    if (companyRoles.length > 0 && !companyRoles.some((r) => r.id === roleId)) {
      setRoleId(companyRoles[0].id);
    }
  }, [companyRoles, roleId]);

  useEffect(() => {
    if (roleJds.length > 0 && !roleJds.some((j) => j.id === jdId)) {
      setJdId(roleJds[0].id);
    }
  }, [roleJds, jdId]);

  const handleTypeChange = (nextType: InterviewType) => {
    setInterviewType(nextType);
    setRubricWeights(DEFAULT_RUBRIC_BY_TYPE[nextType].map((c) => ({ ...c })));
  };

  const rubricSum = rubricWeights.reduce((acc, r) => acc + Number(r.weight || 0), 0);

  useEffect(() => {
    if (
      view !== 'stage' ||
      stageStatus === 'paused' ||
      stageStatus === 'error' ||
      stageStatus === 'preparing'
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [view, stageStatus]);

  const stopPlaybackBargeIn = useCallback(() => {
    if (speechSafetyTimerRef.current) {
      clearTimeout(speechSafetyTimerRef.current);
      speechSafetyTimerRef.current = null;
    }
    activeAudioSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeAudioSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextPlayTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    if (currentTtsAudioRef.current) {
      currentTtsAudioRef.current.pause();
      currentTtsAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stopActiveDictation = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setDictating(false);
  }, []);

  const teardownMedia = useCallback(() => {
    if (liveHandshakeTimerRef.current) {
      clearTimeout(liveHandshakeTimerRef.current);
      liveHandshakeTimerRef.current = null;
    }
    cancelAnimationFrame(meterFrameRef.current);
    stopPlaybackBargeIn();
    try {
      wsRef.current?.send(JSON.stringify({ type: 'stop' }));
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setDictating(false);
    setTranscribingClip(false);

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    inputAudioCtxRef.current?.close().catch(() => undefined);
    inputAudioCtxRef.current = null;

    outputAudioCtxRef.current?.close().catch(() => undefined);
    outputAudioCtxRef.current = null;

    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraOn(false);
    analyserRef.current = null;
  }, [stopPlaybackBargeIn]);

  useEffect(() => {
    return () => teardownMedia();
  }, [teardownMedia]);

  const evaluateCoachingSignal = (transcriptText: string) => {
    if (!coachingEnabled || stageStatusRef.current === 'paused') return;
    const now = Date.now();
    if (now - lastCoachingShownAtRef.current < 90_000) return;

    const answerDurationSec = Math.max(1, (now - turnStartedAtRef.current) / 1000);
    const pauseBeforeSpeechSec = firstSpeechInTurnAtRef.current
      ? (firstSpeechInTurnAtRef.current - turnStartedAtRef.current) / 1000
      : answerDurationSec > 6 && transcriptText.trim().length < 20
        ? answerDurationSec
        : 0;

    const analysisRes = analyzeSpeechFeatures(
      transcriptText,
      answerDurationSec,
      pauseBeforeSpeechSec
    );

    if (analysisRes.suggestion) {
      const ev: CoachingEvent = {
        id: `ce-${now}`,
        timestamp: new Date().toISOString(),
        feature: analysisRes.suggestion.feature,
        message: analysisRes.suggestion.message,
        metricDetail: `${analysisRes.suggestion.metricDetail} (unscored)`,
      };
      lastCoachingShownAtRef.current = now;
      setCoachingEvents((prev) => [...prev, ev]);
      setActiveToast(ev);
    }
  };

  const startMicLevelMeter = (stream: MediaStream, ctx: AudioContext) => {
    cancelAnimationFrame(meterFrameRef.current);
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const updateMeter = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      const bars: number[] = [];
      for (let i = 0; i < 16; i++) {
        const val = micMutedRef.current || stageStatusRef.current === 'paused' ? 0 : data[i] || 0;
        bars.push(Math.max(4, Math.round((val / 255) * 42)));
      }
      setMicLevels(bars);
      meterFrameRef.current = requestAnimationFrame(updateMeter);
    };
    meterFrameRef.current = requestAnimationFrame(updateMeter);
  };

  const playQuestionAudio = useCallback(
    async (textToSpeak: string) => {
      if (!textToSpeak.trim()) {
        setStageStatus('listening');
        return;
      }
      stopPlaybackBargeIn();
      setStageStatus('speaking');

      speechSafetyTimerRef.current = window.setTimeout(() => {
        if (stageStatusRef.current === 'speaking') {
          setStageStatus('listening');
        }
      }, 22_000);

      const finishSpeaking = () => {
        if (speechSafetyTimerRef.current) {
          clearTimeout(speechSafetyTimerRef.current);
          speechSafetyTimerRef.current = null;
        }
        if (stageStatusRef.current !== 'paused') {
          setStageStatus('listening');
        }
      };

      const speakWithBrowserFallback = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          finishSpeaking();
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(textToSpeak);
          const preferred =
            voicesLoadedRef.current.find((v) => /en/i.test(v.lang) && !/espeak/i.test(v.name)) ||
            voicesLoadedRef.current.find((v) => /en/i.test(v.lang));
          if (preferred) utter.voice = preferred;
          utter.rate = 1.0;
          utter.onend = finishSpeaking;
          utter.onerror = finishSpeaking;
          window.speechSynthesis.speak(utter);
        } catch {
          finishSpeaking();
        }
      };

      if (cachedQuestionAudioRef.current?.text === textToSpeak) {
        const audio = new Audio(cachedQuestionAudioRef.current.url);
        currentTtsAudioRef.current = audio;
        audio.onended = finishSpeaking;
        audio.onerror = speakWithBrowserFallback;
        audio.play().catch(speakWithBrowserFallback);
        return;
      }

      const ttsRes = await postJson<{ audioBase64: string; mimeType: string }>(
        '/api/ai/tts',
        { text: textToSpeak },
        20_000
      );

      if (ttsRes.ok && ttsRes.data.audioBase64) {
        const dataUrl = `data:${ttsRes.data.mimeType || 'audio/wav'};base64,${ttsRes.data.audioBase64}`;
        cachedQuestionAudioRef.current = { text: textToSpeak, url: dataUrl };
        const audio = new Audio(dataUrl);
        currentTtsAudioRef.current = audio;
        audio.onended = finishSpeaking;
        audio.onerror = speakWithBrowserFallback;
        audio.play().catch(speakWithBrowserFallback);
        return;
      }

      setModeNotice(
        'Server voice audio was unavailable; using browser speech playback and full question text.'
      );
      speakWithBrowserFallback();
    },
    [stopPlaybackBargeIn]
  );

  const buildSystemPrompt = () => {
    const co = store.companies.find((c) => c.id === companyId);
    const role = store.targetRoles.find((r) => r.id === roleId);
    const jd = store.jobDescriptions.find((j) => j.id === jdId);
    const topWeak = analysis.gaps
      .filter((g) => g.status !== 'strong')
      .slice(0, 6)
      .map((g) => `${g.skillLabel} (${g.status})`);

    return `You are a calm, rigorous RolexIQ interviewer conducting a ${difficulty} ${interviewType} mock interview (${durationMin} minutes) for ${role?.title || 'Target Role'} at ${co?.name || 'Target Company'}.
Focus area: ${focus || 'Balanced coverage of core JD requirements and weak/unevidenced skills'}.
Top candidate gaps to probe: ${topWeak.join(', ') || 'General engineering fundamentals'}.
JD Responsibilities: ${(jd?.responsibilities || []).slice(0, 5).join('; ')}.
Rules:
1. Ask ONE question at a time.
2. Follow up directly on what the candidate just said—probe vague answers, ask for concrete examples and trade-off justifications.
3. Never repeat a question. Never reveal numerical scores or rubric grades during the interview.
4. Keep turns crisp and conversational. Start with the question already shown to the candidate: "${currentQuestionRef.current}"`;
  };

  const fetchInterviewerTurn = async (
    existingTurns: InterviewTurn[],
    isFirstQuestion: boolean
  ): Promise<{
    action: 'ask' | 'follow_up' | 'close';
    topic: string;
    skillId: string;
    spokenText: string;
  } | null> => {
    const co = store.companies.find((c) => c.id === companyId);
    const role = store.targetRoles.find((r) => r.id === roleId);
    const jd = store.jobDescriptions.find((j) => j.id === jdId);

    setStageStatus(isFirstQuestion ? 'preparing' : 'thinking');
    setError(null);

    const res = await postJson<{
      action: 'ask' | 'follow_up' | 'close';
      topic: string;
      skillId: string;
      spokenText: string;
    }>('/api/ai/interviewer', {
      config: {
        type: interviewType,
        difficulty,
        durationMin,
        focus,
      },
      companyName: co?.name,
      roleTitle: role?.title,
      jd,
      topGaps: analysis.gaps.slice(0, 6),
      turns: existingTurns,
      elapsedMin: Math.round(elapsedSec / 60),
    });

    if (!res.ok) {
      setError(res.error);
      setStageStatus('error');
      return null;
    }

    setCurrentTopic(res.data.topic);
    setCurrentSkillId(res.data.skillId);
    setCurrentQuestion(res.data.spokenText);
    if (res.data.action === 'close') {
      setSessionClosingPrompt(true);
    }
    turnStartedAtRef.current = Date.now();
    firstSpeechInTurnAtRef.current = null;
    setStageStatus('ready');
    return res.data;
  };

  const attachLiveWebSocketWithFallback = async (firstQuestionText: string) => {
    if (!micSupported) {
      const next = sttSupported || recorderSupported ? 'stt_tts' : 'text';
      setModeNotice(
        `Microphone access is not supported in this browser. Continuing in ${next === 'stt_tts' ? 'Guided Voice' : 'Text'} mode.`
      );
      setActiveMode(next);
      if (next === 'stt_tts') {
        await playQuestionAudio(firstQuestionText);
      } else {
        setStageStatus('listening');
      }
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
    } catch {
      setModeNotice(
        'Microphone permission was denied or unavailable. Continuing cleanly in Text mode.'
      );
      setActiveMode('text');
      setStageStatus('listening');
      return;
    }

    const inputCtx = new AudioContext({ sampleRate: 16000 });
    const outputCtx = new AudioContext({ sampleRate: 24000 });
    inputAudioCtxRef.current = inputCtx;
    outputAudioCtxRef.current = outputCtx;
    nextPlayTimeRef.current = outputCtx.currentTime;
    startMicLevelMeter(stream, inputCtx);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
    wsRef.current = ws;

    let liveReady = false;
    const downgradeFromLive = async (reason: string) => {
      if (liveHandshakeTimerRef.current) {
        clearTimeout(liveHandshakeTimerRef.current);
        liveHandshakeTimerRef.current = null;
      }
      if (activeModeRef.current !== 'live') return;
      try {
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      const next = sttSupported || recorderSupported ? 'stt_tts' : 'text';
      setModeNotice(
        `${reason} Switched to ${next === 'stt_tts' ? 'Guided Voice' : 'Text'} mode with your question ready.`
      );
      setActiveMode(next);
      if (next === 'stt_tts') {
        await playQuestionAudio(firstQuestionText);
      } else {
        setStageStatus('listening');
      }
    };

    liveHandshakeTimerRef.current = window.setTimeout(() => {
      if (!liveReady) {
        downgradeFromLive('Live voice connection timed out.');
      }
    }, 7_000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'init',
          systemInstruction: buildSystemPrompt(),
          voiceName: 'Zephyr',
        })
      );
    };

    ws.onerror = () => {
      if (!liveReady) {
        downgradeFromLive('Live voice service could not connect.');
      }
    };

    ws.onclose = () => {
      if (!liveReady && activeModeRef.current === 'live') {
        downgradeFromLive('Live voice session closed before opening.');
      }
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data) as {
        type: string;
        data?: string;
        text?: string;
        message?: string;
      };

      if (msg.type === 'error') {
        await downgradeFromLive(msg.message || 'Gemini Live voice is unavailable right now.');
        return;
      }

      if (msg.type === 'ready') {
        liveReady = true;
        if (liveHandshakeTimerRef.current) {
          clearTimeout(liveHandshakeTimerRef.current);
          liveHandshakeTimerRef.current = null;
        }
        setStageStatus('listening');
        try {
          const workletCode = `
            class PcmSender extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0]?.[0];
                if (input && input.length > 0) {
                  const pcm = new Int16Array(input.length);
                  for (let i = 0; i < input.length; i++) {
                    const s = Math.max(-1, Math.min(1, input[i]));
                    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                  }
                  this.port.postMessage(pcm.buffer, [pcm.buffer]);
                }
                return true;
              }
            }
            registerProcessor('pcm-sender', PcmSender);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await inputCtx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          const source = inputCtx.createMediaStreamSource(stream);
          const node = new AudioWorkletNode(inputCtx, 'pcm-sender');
          node.port.onmessage = (e) => {
            if (
              micMutedRef.current ||
              stageStatusRef.current === 'paused' ||
              ws.readyState !== WebSocket.OPEN
            ) {
              return;
            }
            const pcm = new Int16Array(e.data as ArrayBuffer);
            ws.send(JSON.stringify({ type: 'audio', data: int16ToBase64(pcm) }));
          };
          source.connect(node);
          node.connect(inputCtx.destination);
        } catch {
          const source = inputCtx.createMediaStreamSource(stream);
          const proc = inputCtx.createScriptProcessor(4096, 1, 1);
          proc.onaudioprocess = (ev) => {
            if (
              micMutedRef.current ||
              stageStatusRef.current === 'paused' ||
              ws.readyState !== WebSocket.OPEN
            ) {
              return;
            }
            const f32 = ev.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) {
              const s = Math.max(-1, Math.min(1, f32[i]));
              pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ws.send(JSON.stringify({ type: 'audio', data: int16ToBase64(pcm) }));
          };
          source.connect(proc);
          proc.connect(inputCtx.destination);
        }
        return;
      }

      if (msg.type === 'audio' && msg.data && outputAudioCtxRef.current) {
        setStageStatus('speaking');
        const ctx = outputAudioCtxRef.current;
        const f32 = base64ToFloat32Pcm(msg.data);
        const buf = ctx.createBuffer(1, f32.length, 24000);
        buf.copyToChannel(new Float32Array(f32), 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
        src.start(startAt);
        nextPlayTimeRef.current = startAt + buf.duration;
        activeAudioSourcesRef.current.push(src);
        src.onended = () => {
          activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter((s) => s !== src);
        };
      }

      if (msg.type === 'interrupted') {
        stopPlaybackBargeIn();
        setStageStatus('listening');
      }

      if (msg.type === 'outputTranscript' && msg.text) {
        setLiveOutputDraft((prev) => `${prev} ${msg.text}`.trim());
        setCurrentQuestion((prev) => `${prev} ${msg.text}`.trim());
      }

      if (msg.type === 'inputTranscript' && msg.text) {
        if (!firstSpeechInTurnAtRef.current) {
          firstSpeechInTurnAtRef.current = Date.now();
        }
        setLiveInputDraft((prev) => {
          const next = `${prev} ${msg.text}`.trim();
          evaluateCoachingSignal(next);
          return next;
        });
      }

      if (msg.type === 'turnComplete') {
        setStageStatus('listening');
        setLiveOutputDraft((outQ) => {
          setLiveInputDraft((inA) => {
            if (inA.trim()) {
              setTurns((prev) => [
                ...prev,
                {
                  id: `turn-${Date.now()}`,
                  topic: focus || interviewType,
                  skillId: normalizeSkillId(focus || interviewType),
                  question: currentQuestionRef.current || outQ || 'Interview prompt',
                  transcript: inA.trim(),
                  startedAt: new Date(turnStartedAtRef.current).toISOString(),
                  endedAt: new Date().toISOString(),
                },
              ]);
              turnStartedAtRef.current = Date.now();
              firstSpeechInTurnAtRef.current = null;
            }
            return '';
          });
          if (outQ.trim()) {
            setCurrentQuestion(outQ.trim());
          }
          return '';
        });
      }
    };
  };

  const handleStartInterview = async () => {
    if (rubricSum !== 100) {
      setError(`Rubric weights must total 100 (currently ${rubricSum}).`);
      return;
    }

    teardownMedia();
    setError(null);
    setModeNotice(null);
    setSessionClosingPrompt(false);
    setTurns([]);
    setCoachingEvents([]);
    setActiveToast(null);
    setElapsedSec(0);
    setCurrentQuestion('');
    setDraftAnswer('');
    setLiveInputDraft('');
    setLiveOutputDraft('');
    setMicMuted(store.settings.micDefaultOff);
    setActiveMode(selectedMode);
    setView('stage');

    const firstTurn = await fetchInterviewerTurn([], true);
    if (!firstTurn) return;

    if (selectedMode === 'live') {
      await attachLiveWebSocketWithFallback(firstTurn.spokenText);
    } else if (selectedMode === 'stt_tts') {
      if (micSupported) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          const ctx = new AudioContext();
          inputAudioCtxRef.current = ctx;
          startMicLevelMeter(stream, ctx);
        } catch {
          // Audio playback still works cleanly even if mic permission denied
        }
      }
      await playQuestionAudio(firstTurn.spokenText);
    } else {
      setStageStatus('listening');
    }
  };

  const handleRetryCurrentStep = async () => {
    setError(null);
    const turn = await fetchInterviewerTurn(turnsRef.current, turnsRef.current.length === 0);
    if (!turn) return;
    if (activeMode === 'stt_tts') {
      await playQuestionAudio(turn.spokenText);
    } else {
      setStageStatus('listening');
    }
  };

  const handleTogglePause = () => {
    if (stageStatus === 'paused') {
      setStageStatus('listening');
      return;
    }
    stopPlaybackBargeIn();
    stopActiveDictation();
    setStageStatus('paused');
  };

  const handleStartSttListening = async () => {
    stopPlaybackBargeIn();
    if (dictating) {
      stopActiveDictation();
      return;
    }

    if (micMuted) {
      setMicMuted(false);
    }

    sttCapturedRef.current = '';

    // 1. Start browser SpeechRecognition for live interim captions when supported
    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (SpeechRecCtor) {
      const rec = new SpeechRecCtor() as {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = (ev) => {
        if (!firstSpeechInTurnAtRef.current) {
          firstSpeechInTurnAtRef.current = Date.now();
        }
        let combined = '';
        for (let i = 0; i < ev.results.length; i++) {
          combined += `${ev.results[i][0].transcript} `;
        }
        const trimmed = combined.trim();
        sttCapturedRef.current = trimmed;
        setDraftAnswer(trimmed);
        evaluateCoachingSignal(trimmed);
      };
      rec.onerror = () => {
        // MediaRecorder server transcription fallback handles audio cleanly
      };
      rec.onend = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
          setDictating(false);
        }
      };
      try {
        rec.start();
        recognitionRef.current = rec;
      } catch {
        // Continue with MediaRecorder capture
      }
    }

    // 2. Capture recorded clip via MediaRecorder -> /api/ai/transcribe (gemini-3.5-transcribe)
    if (micSupported && recorderSupported) {
      try {
        let stream = micStreamRef.current;
        if (!stream || stream.getAudioTracks().every((t) => t.readyState !== 'live')) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          if (!inputAudioCtxRef.current) {
            const ctx = new AudioContext();
            inputAudioCtxRef.current = ctx;
            startMicLevelMeter(stream, ctx);
          }
        }

        const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        recordedChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          recordedChunksRef.current = [];
          mediaRecorderRef.current = null;

          // If browser SpeechRecognition already captured a rich transcript, keep it;
          // otherwise call /api/ai/transcribe for reliable Gemini transcription.
          if (sttCapturedRef.current.trim().length >= 3 || chunks.length === 0) {
            return;
          }

          const mime = recorder.mimeType || preferredMime || 'audio/webm';
          const blob = new Blob(chunks, { type: mime });
          if (blob.size < 256) return;

          setTranscribingClip(true);
          try {
            const audioBase64 = await blobToBase64(blob);
            const tr = await postJson<{ transcript: string }>('/api/ai/transcribe', {
              audioBase64,
              mimeType: mime,
            });
            if (tr.ok && tr.data.transcript.trim()) {
              const transcriptText = tr.data.transcript.trim();
              setDraftAnswer((prev) =>
                prev.trim() ? `${prev.trim()} ${transcriptText}` : transcriptText
              );
              evaluateCoachingSignal(transcriptText);
            } else if (!tr.ok) {
              setModeNotice(
                `Voice clip transcription unavailable (${tr.error}). You can edit or type your answer below.`
              );
            }
          } catch {
            setModeNotice('Could not read recorded audio clip. Please type your response below.');
          } finally {
            setTranscribingClip(false);
          }
        };

        recorder.start(500);
        mediaRecorderRef.current = recorder;
        setDictating(true);
        setStageStatus('listening');
        return;
      } catch {
        if (!SpeechRecCtor) {
          setModeNotice(
            'Microphone access is unavailable in this browser. Please type your response below.'
          );
          return;
        }
      }
    }

    if (SpeechRecCtor) {
      setDictating(true);
      setStageStatus('listening');
    } else {
      setModeNotice(
        'Voice recording and speech-to-text are unavailable here. Please type your response below.'
      );
    }
  };

  const handleSubmitTurnAnswer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const answerText = (draftAnswer || liveInputDraft).trim();
    if (!answerText || stageStatus === 'thinking' || stageStatus === 'submitting') return;

    setStageStatus('submitting');
    stopPlaybackBargeIn();
    stopActiveDictation();

    evaluateCoachingSignal(answerText);

    const newTurn: InterviewTurn = {
      id: `turn-${Date.now()}`,
      topic: currentTopic,
      skillId: currentSkillId,
      question: currentQuestion || 'Interview prompt',
      transcript: answerText,
      startedAt: new Date(turnStartedAtRef.current).toISOString(),
      endedAt: new Date().toISOString(),
    };
    const nextTurns = [...turns, newTurn];
    setTurns(nextTurns);
    setDraftAnswer('');
    setLiveInputDraft('');

    if (activeMode === 'live' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: answerText }));
      setStageStatus('thinking');
    } else {
      const nextPrompt = await fetchInterviewerTurn(nextTurns, false);
      if (!nextPrompt) return;
      if (activeMode === 'stt_tts') {
        await playQuestionAudio(nextPrompt.spokenText);
      } else {
        setStageStatus('listening');
      }
    }
  };

  const handleToggleCamera = async () => {
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraStreamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setError('Camera permission denied or camera unavailable. Interview continues cleanly without video.');
      setCameraOn(false);
    }
  };

  const handleEndAndEvaluate = async () => {
    teardownMedia();

    const finalTurns = [...turns];
    if ((draftAnswer || liveInputDraft).trim() && currentQuestion) {
      finalTurns.push({
        id: `turn-${Date.now()}`,
        topic: currentTopic,
        skillId: currentSkillId,
        question: currentQuestion,
        transcript: (draftAnswer || liveInputDraft).trim(),
        startedAt: new Date(turnStartedAtRef.current).toISOString(),
        endedAt: new Date().toISOString(),
      });
    }

    if (finalTurns.length === 0) {
      setError('Submit at least one answer before generating an evaluation.');
      setView('setup');
      setStageStatus('idle');
      return;
    }

    setEvaluating(true);
    setStageStatus('evaluating');
    setError(null);

    const co = store.companies.find((c) => c.id === companyId);
    const role = store.targetRoles.find((r) => r.id === roleId);
    const sessionObj: InterviewSession = {
      id: `int-${Date.now()}`,
      config: {
        companyId,
        roleId,
        jdId,
        type: interviewType,
        difficulty,
        durationMin,
        focus,
        coachingEnabled,
        mode: activeMode,
        rubricWeights,
      },
      turns: finalTurns,
      coachingEvents,
      startedAt: new Date(Date.now() - elapsedSec * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      provenance: 'interview',
    };

    const prevScores = store.interviewSessions
      .filter((s) => s.report)
      .map((s) => ({ date: s.startedAt.slice(0, 10), score: s.report!.overallScore }));

    const res = await postJson<InterviewReport>(
      '/api/ai/evaluator',
      {
        session: sessionObj,
        companyName: co?.name,
        roleTitle: role?.title,
        rubricWeights,
        previousScores: prevScores,
      },
      60_000
    );
    setEvaluating(false);

    if (!res.ok) {
      setError(`${res.error} Your transcript was saved below so nothing was lost.`);
      await updateStore((prev) => ({
        ...prev,
        interviewSessions: [sessionObj, ...prev.interviewSessions],
      }));
      setViewingSessionId(sessionObj.id);
      setStageStatus('error');
      setView('report');
      return;
    }

    const completedSession: InterviewSession = {
      ...sessionObj,
      report: res.data,
    };

    const date = new Date().toISOString().slice(0, 10);
    const assessedRecords: EvidenceRecord[] = res.data.questionEvaluations.map((qe, idx) => ({
      id: `ev-int-${Date.now()}-${idx}`,
      skillId: normalizeSkillId(qe.skillId || qe.topic),
      skillLabel: qe.topic,
      level: 'assessed',
      sourceType: 'interview',
      sourceRef: `${co?.name || 'Mock'} ${interviewType} (${date})`,
      date,
      score: qe.score,
      note: qe.explanation,
      provenance: 'interview',
    }));

    await updateStore(
      (prev) => {
        const updatedRoadmap =
          prev.roadmap && res.data.weakTopics.length > 0
            ? {
                ...prev.roadmap,
                changes: [
                  {
                    id: `chg-int-${Date.now()}`,
                    date,
                    trigger: 'interview_weakness',
                    reason: `${interviewType} practice scored ${res.data.overallScore}/100; topics flagged for revision: ${res.data.weakTopics.join(', ')}.`,
                    added: res.data.topicsToRevise.slice(0, 2),
                    removed: [],
                    reprioritised: res.data.weakTopics,
                  },
                  ...prev.roadmap.changes,
                ],
                updatedAt: new Date().toISOString(),
              }
            : prev.roadmap;

        return {
          ...prev,
          interviewSessions: [completedSession, ...prev.interviewSessions],
          evidenceRecords: [...prev.evidenceRecords, ...assessedRecords],
          roadmap: updatedRoadmap,
        };
      },
      `Interview evaluated (${res.data.overallScore}/100)`
    );

    setViewingSessionId(completedSession.id);
    setStageStatus('completed');
    setView('report');
  };

  const viewingSession =
    store.interviewSessions.find((s) => s.id === viewingSessionId) ??
    store.interviewSessions[0] ??
    null;

  return (
    <div className="space-y-6">
      {/* Header & View Switcher */}
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div className="space-y-1 max-w-2xl">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37]">
            Live & Guided Interview Studio
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Practise real interviews
          </h2>
          <p className="text-sm text-[#A69A8C]">
            Answer role-grounded questions aloud or in writing, receive rubric-scored feedback on
            reasoning only, and update your readiness score.
          </p>
        </div>

        <div className="inline-flex items-center border border-[#382920] bg-[#12100F] p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              if (view === 'stage') teardownMedia();
              setStageStatus('idle');
              setView('setup');
            }}
            className={`px-3.5 py-1.5 font-medium transition-colors ${
              view === 'setup'
                ? 'bg-[#211A16] border border-[#B86D37]/60 text-[#EAE4DC]'
                : 'text-[#A69A8C] hover:text-[#EAE4DC]'
            }`}
          >
            Setup Session
          </button>
          <button
            type="button"
            onClick={() => setView('report')}
            disabled={store.interviewSessions.length === 0}
            className={`px-3.5 py-1.5 font-medium disabled:opacity-40 transition-colors ${
              view === 'report'
                ? 'bg-[#211A16] border border-[#B86D37]/60 text-[#EAE4DC]'
                : 'text-[#A69A8C] hover:text-[#EAE4DC]'
            }`}
          >
            Past Reports ({store.interviewSessions.length})
          </button>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-4 border-l-2 border-[#B86D37] bg-[#211A16] text-xs text-[#EAE4DC] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#B86D37]" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {view === 'stage' && (
              <>
                <button
                  type="button"
                  onClick={handleRetryCurrentStep}
                  className="arch-btn-primary px-3 py-1"
                >
                  <RefreshCw className="w-3 h-3 text-[#B86D37]" />
                  <span>Retry</span>
                </button>
                {activeMode !== 'text' && (
                  <button
                    type="button"
                    onClick={() => {
                      teardownMedia();
                      setActiveMode('text');
                      setError(null);
                      if (currentQuestion) {
                        setStageStatus('listening');
                      } else {
                        handleRetryCurrentStep();
                      }
                    }}
                    className="underline text-[#B86D37] hover:text-[#EAE4DC] font-medium"
                  >
                    Switch to Text Mode
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setError(null)}
              className="underline text-[#A69A8C] hover:text-[#EAE4DC]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {modeNotice && (
        <div
          role="status"
          className="p-3.5 border-l-2 border-[#B86D37] bg-[#1B1714] text-xs text-[#EAE4DC] flex items-center justify-between gap-3"
        >
          <span>{modeNotice}</span>
          <button
            type="button"
            onClick={() => setModeNotice(null)}
            className="underline shrink-0 text-[#B86D37]"
          >
            Dismiss
          </button>
        </div>
      )}

      {evaluating && (
        <div className="arch-panel p-10 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#B86D37]" />
          <div className="text-sm font-medium text-[#EAE4DC]">
            Scoring your interview answers against the 100-point rubric...
          </div>
          <p className="text-xs text-[#A69A8C] max-w-md">
            Checking technical reasoning, trade-offs, and clarity directly from your transcript.
          </p>
        </div>
      )}

      {/* SETUP VIEW */}
      {view === 'setup' && !evaluating && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 arch-panel p-6 sm:p-7 space-y-5">
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Configure Practice Session
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="int-co" className="block text-[#A69A8C] mb-1">
                  Target company
                </label>
                <select
                  id="int-co"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="arch-input px-3 py-2"
                >
                  <option value="">General Practice</option>
                  {store.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="int-role" className="block text-[#A69A8C] mb-1">
                  Target role
                </label>
                <select
                  id="int-role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="arch-input px-3 py-2"
                >
                  <option value="">General Role</option>
                  {companyRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="int-jd" className="block text-[#A69A8C] mb-1">
                  Job posting
                </label>
                <select
                  id="int-jd"
                  value={jdId}
                  onChange={(e) => setJdId(e.target.value)}
                  className="arch-input px-3 py-2"
                >
                  <option value="">None selected</option>
                  {roleJds.map((j) => (
                    <option key={j.id} value={j.id}>
                      Posting ({j.source.fetchedAt})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="int-type" className="block text-[#A69A8C] mb-1">
                  Interview format
                </label>
                <select
                  id="int-type"
                  value={interviewType}
                  onChange={(e) => handleTypeChange(e.target.value as InterviewType)}
                  className="arch-input px-3 py-2"
                >
                  {(
                    [
                      'Technical',
                      'HR',
                      'Behavioural',
                      'Problem-solving',
                      'System design',
                      'Communication/situational',
                      'Mixed company-specific',
                    ] as const
                  ).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="int-diff" className="block text-[#A69A8C] mb-1">
                  Difficulty
                </label>
                <select
                  id="int-diff"
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as InterviewSession['config']['difficulty'])
                  }
                  className="arch-input px-3 py-2"
                >
                  <option value="Foundational">Foundational</option>
                  <option value="Standard">Standard</option>
                  <option value="Senior">Senior</option>
                  <option value="Stretch">Stretch</option>
                </select>
              </div>
              <div>
                <label htmlFor="int-dur" className="block text-[#A69A8C] mb-1">
                  Duration (min)
                </label>
                <input
                  id="int-dur"
                  type="number"
                  min={5}
                  max={60}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="arch-input px-3 py-2 font-mono-tabular"
                />
              </div>
            </div>

            <div className="text-xs">
              <label htmlFor="int-focus" className="block text-[#A69A8C] mb-1">
                Focus topic or skill gap (optional)
              </label>
              <input
                id="int-focus"
                type="text"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. PostgreSQL query plans, React state trade-offs, ownership conflict"
                className="arch-input px-3.5 py-2"
              />
            </div>

            <div className="space-y-2 text-xs border-t border-[#382920] pt-4">
              <div className="text-[#EAE4DC] font-medium">How you would like to answer</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      id: 'live',
                      label: 'Live Voice',
                      sub: micSupported
                        ? 'Real-time audio conversation'
                        : 'Auto-switches if mic blocked',
                    },
                    {
                      id: 'stt_tts',
                      label: 'Guided Voice',
                      sub:
                        sttSupported || recorderSupported
                          ? 'Spoken question + voice recording'
                          : 'Spoken question + text reply',
                    },
                    {
                      id: 'text',
                      label: 'Text Interview',
                      sub: 'Calm written Q&A · reliable everywhere',
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMode(m.id)}
                    className={`p-3 text-left border transition-colors ${
                      selectedMode === m.id
                        ? 'bg-[#211A16] border-[#B86D37] text-[#EAE4DC]'
                        : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                    }`}
                  >
                    <div className="font-medium text-[#EAE4DC]">{m.label}</div>
                    <div className="text-[11px] mt-0.5 leading-snug">{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-[#EAE4DC]">
                <input
                  type="checkbox"
                  checked={coachingEnabled}
                  onChange={(e) => setCoachingEnabled(e.target.checked)}
                  className="accent-[#B86D37]"
                />
                <span>Show gentle pacing reminders (unscored)</span>
              </label>

              <button
                type="button"
                onClick={handleStartInterview}
                className="arch-btn-primary px-6 py-2.5"
              >
                Start Mock Interview
              </button>
            </div>
          </div>

          {/* Rubric Configuration */}
          <div className="lg:col-span-5 arch-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#382920] pb-3">
              <div>
                <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                  Scoring Rubric
                </h3>
                <p className="text-xs text-[#A69A8C]">
                  {interviewType} weights · must total 100
                </p>
              </div>
              <span
                className={`font-mono-tabular text-sm font-semibold ${
                  rubricSum === 100 ? 'text-[#B86D37]' : 'text-[#EAE4DC] underline'
                }`}
              >
                {rubricSum} / 100
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              {rubricWeights.map((c, idx) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`rub-${c.key}`} className="text-[#EAE4DC]">
                    {c.label}
                  </label>
                  <input
                    id={`rub-${c.key}`}
                    type="number"
                    min={0}
                    max={100}
                    value={c.weight}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value)));
                      setRubricWeights((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, weight: val } : item))
                      );
                    }}
                    className="arch-input w-20 px-2.5 py-1.5 text-right font-mono-tabular"
                  />
                </div>
              ))}
            </div>

            <div className="p-3.5 bg-[#12100F] border border-[#382920] text-[11px] text-[#A69A8C] leading-relaxed">
              Camera stays OFF by default. Scores measure technical reasoning, trade-offs, and
              clarity—never delivery pacing or pauses.
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE STAGE VIEW */}
      {view === 'stage' && !evaluating && (
        <div className="arch-panel-elevated p-6 sm:p-8 space-y-6">
          {/* Stage Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#382920] pb-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-[#EAE4DC]">
                {activeMode === 'live'
                  ? 'Live Voice'
                  : activeMode === 'stt_tts'
                    ? 'Guided Voice'
                    : 'Text Interview'}
              </span>
              <span aria-hidden="true" className="text-[#A69A8C]/60">
                ·
              </span>
              <span className="text-[#B86D37]">{STATUS_LABEL[stageStatus]}</span>
              <span aria-hidden="true" className="text-[#A69A8C]/60">
                ·
              </span>
              <span className="font-mono-tabular text-[#EAE4DC]">
                Question {turns.length + 1} · {Math.floor(elapsedSec / 60)}:
                {String(elapsedSec % 60).padStart(2, '0')} / {durationMin}:00
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeMode !== 'text' && (
                <button
                  type="button"
                  onClick={() => setMicMuted((m) => !m)}
                  className="arch-btn-secondary px-3 py-1.5"
                >
                  {micMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-[#A69A8C]" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-[#B86D37]" />
                  )}
                  <span>{micMuted ? 'Unmute' : 'Mute'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleTogglePause}
                className="arch-btn-secondary px-3 py-1.5"
              >
                {stageStatus === 'paused' ? (
                  <Play className="w-3.5 h-3.5 text-[#B86D37]" />
                ) : (
                  <Pause className="w-3.5 h-3.5 text-[#B86D37]" />
                )}
                <span>{stageStatus === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleCamera}
                className="arch-btn-secondary px-3 py-1.5"
              >
                {cameraOn ? (
                  <CameraOff className="w-3.5 h-3.5 text-[#B86D37]" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-[#A69A8C]" />
                )}
                <span>{cameraOn ? 'Hide Camera' : 'Self-View Camera'}</span>
              </button>

              <button
                type="button"
                onClick={handleEndAndEvaluate}
                className="arch-btn-primary px-3.5 py-1.5"
              >
                <Square className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>End & Score Session</span>
              </button>
            </div>
          </div>

          {/* Unscored Delivery Coaching Toast */}
          {activeToast && coachingEnabled && (
            <div
              role="status"
              className="p-3 bg-[#12100F] border-l-2 border-[#B86D37] flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <span className="text-[#B86D37]">Delivery note (unscored): </span>
                <span className="text-[#EAE4DC]">{activeToast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveToast(null)}
                aria-label="Dismiss coaching note"
                className="text-[#A69A8C] hover:text-[#EAE4DC]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {sessionClosingPrompt && (
            <div className="p-3.5 bg-[#12100F] border border-[#B86D37]/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#EAE4DC]">
                The interviewer has reached the closing prompt. Submit any final reflection or click{' '}
                <strong>End & Score Session</strong> for your full rubric report.
              </span>
              <button
                type="button"
                onClick={handleEndAndEvaluate}
                className="arch-btn-primary px-3.5 py-1.5"
              >
                View Evaluation
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Question & Answer Studio */}
            <div className="lg:col-span-8 space-y-5">
              <div className="bg-[#12100F] border border-[#382920] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 shrink-0 flex items-center justify-center border transition-all ${
                        stageStatus === 'speaking'
                          ? 'border-[#B86D37] bg-[#B86D37]/20'
                          : stageStatus === 'listening'
                            ? 'border-[#B86D37]/60 bg-[#211A16]'
                            : 'border-[#382920] bg-[#1B1714]'
                      }`}
                      aria-label={`Interviewer status: ${STATUS_LABEL[stageStatus]}`}
                    >
                      {stageStatus === 'preparing' || stageStatus === 'thinking' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-[#B86D37]" />
                      ) : (
                        <div
                          className={`w-3 h-3 rotate-45 ${
                            stageStatus === 'speaking'
                              ? 'bg-[#B86D37]'
                              : stageStatus === 'listening'
                                ? 'bg-[#EAE4DC]'
                                : 'bg-[#A69A8C]/60'
                          }`}
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-[#A69A8C]">
                        Topic: <span className="text-[#EAE4DC] font-medium">{currentTopic}</span>
                      </div>
                      <div className="flex items-end gap-1 h-7" aria-hidden="true">
                        {micLevels.map((h, i) => (
                          <div
                            key={i}
                            style={{ height: `${activeMode === 'text' ? 4 : Math.min(28, h)}px` }}
                            className="w-1 bg-[#B86D37] transition-all duration-75"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {currentQuestion && activeMode !== 'text' && (
                    <button
                      type="button"
                      onClick={() => playQuestionAudio(currentQuestion)}
                      className="arch-btn-secondary px-3 py-1.5"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-[#B86D37]" />
                      <span>Play question again</span>
                    </button>
                  )}
                </div>

                <div className="border-t border-[#382920] pt-4 space-y-2">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#B86D37]">
                    Current Question
                  </div>
                  <p className="font-editorial text-2xl sm:text-3xl font-light text-[#EAE4DC] leading-relaxed">
                    {currentQuestion ||
                      liveOutputDraft ||
                      (stageStatus === 'preparing'
                        ? 'Preparing your first question...'
                        : stageStatus === 'thinking'
                          ? 'Reviewing your answer and preparing the follow-up...'
                          : 'Waiting for question...')}
                  </p>
                </div>
              </div>

              {/* Response Box */}
              <form onSubmit={handleSubmitTurnAnswer} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="stage-answer" className="text-xs text-[#A69A8C]">
                    Your answer{' '}
                    {activeMode === 'live'
                      ? '(voice transcribed live, or edit below)'
                      : activeMode === 'stt_tts'
                        ? '(record voice clip or type calmly below)'
                        : '(explain reasoning, trade-offs, and examples)'}
                  </label>
                  <div className="flex items-center gap-2">
                    {transcribingClip && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[#B86D37]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Transcribing voice clip...
                      </span>
                    )}
                    {activeMode !== 'text' && (sttSupported || (micSupported && recorderSupported)) && (
                      <button
                        type="button"
                        onClick={handleStartSttListening}
                        disabled={stageStatus === 'paused' || transcribingClip}
                        className={`px-3 py-1.5 border text-xs inline-flex items-center gap-1.5 transition-colors ${
                          dictating
                            ? 'bg-[#B86D37] border-[#B86D37] text-[#12100F] font-medium'
                            : 'bg-[#12100F] border-[#382920] text-[#EAE4DC] hover:border-[#B86D37]'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>
                          {dictating
                            ? 'Stop & Transcribe'
                            : sttSupported
                              ? 'Dictate Answer'
                              : 'Record Voice Answer'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  id="stage-answer"
                  rows={4}
                  disabled={stageStatus === 'paused'}
                  value={activeMode === 'live' ? liveInputDraft || draftAnswer : draftAnswer}
                  onChange={(e) => {
                    if (stageStatus === 'speaking') stopPlaybackBargeIn();
                    setDraftAnswer(e.target.value);
                  }}
                  placeholder="Structure your answer clearly—cover what approach you would choose, why, and key trade-offs..."
                  className="arch-input px-4 py-3 text-sm"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-[#A69A8C]">
                    Filler words and pauses never lower your rubric score.
                  </span>
                  <button
                    type="submit"
                    disabled={
                      stageStatus === 'preparing' ||
                      stageStatus === 'thinking' ||
                      stageStatus === 'submitting' ||
                      stageStatus === 'paused' ||
                      !(draftAnswer || liveInputDraft).trim()
                    }
                    className="arch-btn-primary px-5 py-2"
                  >
                    {stageStatus === 'thinking' || stageStatus === 'submitting' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-[#B86D37]" />
                    )}
                    <span>
                      {stageStatus === 'thinking'
                        ? 'Preparing follow-up...'
                        : stageStatus === 'submitting'
                          ? 'Submitting...'
                          : 'Submit Answer'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Self-Preview (Opt-in Only) & Transcript */}
            <div className="lg:col-span-4 space-y-4">
              {cameraOn && (
                <div className="bg-[#12100F] border border-[#382920] p-3 space-y-2">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full aspect-video bg-black object-cover"
                  />
                  <p className="text-[11px] text-[#A69A8C] leading-snug">
                    Local preview only. Video stays inside your browser—never uploaded, recorded,
                    or scored.
                  </p>
                </div>
              )}

              <div className="bg-[#12100F] border border-[#382920] p-4 space-y-3">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#B86D37]">
                  Session Transcript
                </div>
                {turns.length === 0 ? (
                  <p className="text-xs text-[#A69A8C]">
                    Your completed answers will build here turn by turn.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto text-xs pr-1">
                    {turns.map((t, idx) => (
                      <div key={t.id} className="border-b border-[#382920] pb-2.5 space-y-1">
                        <div className="text-[#A69A8C] font-medium">
                          Q{idx + 1}: {t.question}
                        </div>
                        <div className="text-[#EAE4DC]">You: {t.transcript}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POST-SESSION EVALUATION REPORT */}
      {view === 'report' && !evaluating && (
        <div className="space-y-6">
          {store.interviewSessions.length === 0 ? (
            <div className="arch-panel p-8 text-sm text-[#A69A8C]">
              No completed interviews yet. Start a practice session to inspect rubric scoring and
              transcript feedback.
            </div>
          ) : (
            <>
              <div className="arch-panel p-4 flex flex-wrap items-center justify-between gap-3">
                <select
                  aria-label="Select interview report"
                  value={viewingSession?.id ?? ''}
                  onChange={(e) => setViewingSessionId(e.target.value)}
                  className="arch-input w-auto px-3 py-2 text-xs"
                >
                  {store.interviewSessions.map((s) => {
                    const co = store.companies.find((c) => c.id === s.config.companyId);
                    return (
                      <option key={s.id} value={s.id}>
                        {co?.name || 'General'} · {s.config.type} · {s.startedAt.slice(0, 10)} (
                        {s.report ? `${s.report.overallScore}/100` : 'Transcript saved'})
                      </option>
                    );
                  })}
                </select>

                {viewingSession && (
                  <button
                    type="button"
                    onClick={() =>
                      updateStore((prev) => ({
                        ...prev,
                        interviewSessions: prev.interviewSessions.filter(
                          (s) => s.id !== viewingSession.id
                        ),
                      }))
                    }
                    className="arch-btn-secondary px-3 py-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#B86D37]" />
                    <span>Delete Session</span>
                  </button>
                )}
              </div>

              {viewingSession?.report ? (
                <div className="space-y-6">
                  <div className="arch-panel p-6 flex flex-wrap items-center justify-between gap-6">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="text-xs text-[#A69A8C]">
                        {viewingSession.report.disclaimer}
                      </div>
                      <h3 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                        {viewingSession.report.practiceOutcomeLabel}
                      </h3>
                      <p className="text-xs text-[#A69A8C] leading-relaxed">
                        {viewingSession.report.readinessImpactNote}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-tabular text-4xl font-light text-[#B86D37]">
                        {viewingSession.report.overallScore}
                        <span className="text-lg text-[#A69A8C]"> / 100</span>
                      </div>
                      {viewingSession.report.weakTopics[0] && (
                        <button
                          type="button"
                          onClick={() => {
                            setFocus(viewingSession.report!.weakTopics[0]);
                            setView('setup');
                          }}
                          className="arch-btn-primary mt-3 px-4 py-2"
                        >
                          Practise “{viewingSession.report.weakTopics[0]}” again
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rubric Breakdown */}
                  <div className="arch-panel p-6 space-y-4">
                    <h4 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                      Rubric Breakdown (100 Points)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#382920] text-[#A69A8C] uppercase text-[10px] tracking-[0.12em]">
                            <th className="py-2 pr-3 font-medium">Criterion</th>
                            <th className="py-2 pr-3 font-medium text-right">Earned / Weight</th>
                            <th className="py-2 font-medium">Feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewingSession.report.criterionScores.map((c) => (
                            <tr key={c.key} className="border-b border-[#382920] last:border-b-0">
                              <td className="py-2.5 pr-3 font-medium text-[#EAE4DC]">{c.label}</td>
                              <td className="py-2.5 pr-3 text-right font-mono-tabular text-[#B86D37]">
                                {c.earned} / {c.weight}
                              </td>
                              <td className="py-2.5 text-[#A69A8C]">{c.rationale}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Per-Question Transcript Evidence */}
                  <div className="space-y-4">
                    <h4 className="font-editorial text-2xl font-light text-[#EAE4DC]">
                      Question-by-Question Review
                    </h4>
                    {viewingSession.report.questionEvaluations.map((qe, idx) => (
                      <div key={qe.turnId} className="arch-panel p-5 space-y-3 text-xs">
                        <div className="flex items-start justify-between gap-4 border-b border-[#382920] pb-3">
                          <div>
                            <div className="text-[#B86D37] font-mono-tabular text-[11px]">
                              Question {idx + 1} · {qe.topic}
                            </div>
                            <div className="text-sm font-medium text-[#EAE4DC] mt-0.5">
                              {qe.question}
                            </div>
                          </div>
                          <span className="font-mono-tabular text-base font-semibold text-[#B86D37] shrink-0">
                            {qe.score}/100
                          </span>
                        </div>
                        <blockquote className="p-3 bg-[#12100F] border border-[#382920] italic text-[#EAE4DC]">
                          From your answer: {qe.transcriptExcerpt}
                        </blockquote>
                        <p className="text-[#A69A8C] leading-relaxed">{qe.explanation}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <span className="text-[#B86D37] font-medium">Strengths: </span>
                            <span className="text-[#A69A8C]">
                              {qe.strongPoints.join('; ') || 'None noted'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#EAE4DC] font-medium">Missing points: </span>
                            <span className="text-[#A69A8C]">
                              {qe.missingElements.join('; ') || 'None'}
                            </span>
                          </div>
                        </div>
                        <div className="p-3.5 bg-[#211A16] border border-[#B86D37]/40 text-[#EAE4DC]">
                          <strong className="text-[#B86D37]">Example stronger answer:</strong>{' '}
                          {qe.sampleImprovedAnswer}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Delivery Observations (Explicitly Unscored) */}
                  <div className="arch-panel p-5 space-y-2 text-xs">
                    <h4 className="font-editorial text-xl font-light text-[#EAE4DC]">
                      Delivery observations (unscored)
                    </h4>
                    <p className="text-[#A69A8C]">
                      Pauses, filler words, restarts, and pace never reduce any score or readiness.
                    </p>
                    {viewingSession.report.deliveryObservations.length === 0 ? (
                      <p className="text-[#A69A8C]">No delivery reminders triggered.</p>
                    ) : (
                      <ul className="list-disc pl-4 space-y-1 text-[#EAE4DC]">
                        {viewingSession.report.deliveryObservations.map((obs, i) => (
                          <li key={i}>{obs}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveModule('roadmap')}
                      className="arch-btn-secondary px-4 py-2"
                    >
                      View Updated Roadmap
                    </button>
                  </div>
                </div>
              ) : viewingSession ? (
                <div className="arch-panel p-6 space-y-4 text-xs">
                  <div className="font-medium text-[#EAE4DC]">
                    Saved Transcript ({viewingSession.turns.length} answers)
                  </div>
                  {viewingSession.turns.map((t, i) => (
                    <div
                      key={t.id}
                      className="p-3 bg-[#12100F] border border-[#382920] space-y-1"
                    >
                      <div className="font-medium text-[#EAE4DC]">
                        Q{i + 1}: {t.question}
                      </div>
                      <div className="text-[#A69A8C]">{t.transcript}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
