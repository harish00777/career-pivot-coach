import type { IncomingMessage } from 'node:http';
import { Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { LIVE_MODEL } from './config';
import { getGeminiAlphaClient, getGeminiClient } from './gemini';

interface LiveSessionHandle {
  sendRealtimeInput: (input: {
    audio?: { data: string; mimeType: string };
    text?: string;
  }) => void;
  close: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export function attachLiveWebSocketRelay(server: {
  on: (event: 'upgrade', cb: (req: IncomingMessage, socket: unknown, head: Buffer) => void) => void;
}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname !== '/api/live') {
      return;
    }
    wss.handleUpgrade(request, socket as never, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: LiveSessionHandle | null = null;
    let isClosing = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const connectLive = async (
      useAlpha: boolean,
      msg: { systemInstruction?: string; voiceName?: string }
    ): Promise<LiveSessionHandle> => {
      const ai = useAlpha ? getGeminiAlphaClient() : getGeminiClient();
      const systemText =
        msg.systemInstruction ||
        'You are a professional technical interviewer. Ask one question at a time and never reveal scores during the interview.';

      let settled = false;
      return withTimeout(
        new Promise<LiveSessionHandle>((resolve, reject) => {
          ai.live
            .connect({
              model: LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: msg.voiceName || 'Zephyr' },
                  },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: systemText,
              },
              callbacks: {
                onopen: () => {
                  // Handled when ai.live.connect promise resolves
                },
                onmessage: (message) => {
                  const content = message.serverContent;
                  if (content?.inputTranscription?.text) {
                    sendJson({
                      type: 'inputTranscript',
                      text: content.inputTranscription.text,
                    });
                  }
                  if (content?.outputTranscription?.text) {
                    sendJson({
                      type: 'outputTranscript',
                      text: content.outputTranscription.text,
                    });
                  }
                  for (const part of content?.modelTurn?.parts ?? []) {
                    if (part.inlineData?.data) {
                      sendJson({ type: 'audio', data: part.inlineData.data });
                    }
                  }
                  if (content?.interrupted) {
                    sendJson({ type: 'interrupted' });
                  }
                  if (content?.turnComplete) {
                    sendJson({ type: 'turnComplete' });
                  }
                },
                onerror: (err: unknown) => {
                  const errMsg =
                    err instanceof Error ? err.message : 'Gemini Live session encountered an error.';
                  if (!settled) {
                    settled = true;
                    reject(new Error(errMsg));
                    return;
                  }
                  sendJson({
                    type: 'error',
                    code: 'LIVE_STREAM_ERROR',
                    message: errMsg,
                  });
                },
                onclose: () => {
                  if (!settled) {
                    settled = true;
                    reject(new Error('Gemini Live connection closed before handshake completed.'));
                    return;
                  }
                  if (!isClosing) {
                    sendJson({ type: 'closed' });
                  }
                },
              },
            })
            .then((session) => {
              if (!settled) {
                settled = true;
                resolve(session as unknown as LiveSessionHandle);
              } else {
                try {
                  session.close();
                } catch {
                  // ignore
                }
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
        }),
        9_000,
        `Timed out connecting to Gemini Live (${LIVE_MODEL}).`
      );
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: 'init' | 'audio' | 'text' | 'stop';
          systemInstruction?: string;
          voiceName?: string;
          data?: string;
          text?: string;
        };

        if (msg.type === 'init') {
          if (liveSession) {
            return;
          }
          try {
            getGeminiClient();
          } catch (err) {
            sendJson({
              type: 'error',
              code: 'MISSING_KEY',
              message: err instanceof Error ? err.message : 'AI key is not configured.',
            });
            return;
          }

          try {
            let session: LiveSessionHandle;
            try {
              session = await connectLive(false, msg);
            } catch (firstErr) {
              // Retry once against v1alpha in case Live model endpoint requires it
              const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
              if (firstMsg.includes('404') || firstMsg.includes('not found')) {
                session = await connectLive(true, msg);
              } else {
                throw firstErr;
              }
            }
            if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
              session.close();
              return;
            }
            liveSession = session;
            sendJson({ type: 'ready', model: LIVE_MODEL });
          } catch (err) {
            sendJson({
              type: 'error',
              code: 'LIVE_CONNECT_FAILED',
              message:
                err instanceof Error
                  ? `Live voice stream (${LIVE_MODEL}) is unavailable right now (${err.message}).`
                  : 'Live voice stream is unavailable right now.',
            });
          }
          return;
        }

        if (msg.type === 'audio' && msg.data && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && liveSession) {
          liveSession.sendRealtimeInput({ text: msg.text });
          return;
        }

        if (msg.type === 'stop') {
          isClosing = true;
          liveSession?.close();
          liveSession = null;
        }
      } catch (err) {
        sendJson({
          type: 'error',
          code: 'BAD_MESSAGE',
          message: err instanceof Error ? err.message : 'Invalid WebSocket payload',
        });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
      liveSession = null;
    });
  });
}
