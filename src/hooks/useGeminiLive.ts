import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';

export type GeminiLiveState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface GeminiLiveCallbacks {
  onAudioOutput: (pcm24k: ArrayBuffer) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onStateChange: (state: GeminiLiveState) => void;
  onError?: (err: Error) => void;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

export function useGeminiLive(callbacks: GeminiLiveCallbacks) {
  const [state, setState] = useState<GeminiLiveState>('disconnected');
  const sessionRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  const personaRef = useRef<string>('analyst');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-broadcast queue: max 1 (newer replaces older), user messages always kept
  const pendingTextQueueRef = useRef<{ text: string; isUser: boolean }[]>([]);
  const stateRef = useRef<GeminiLiveState>('disconnected');

  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  const setStateAll = (s: GeminiLiveState) => {
    stateRef.current = s;
    setState(s);
    callbacksRef.current.onStateChange(s);
  };

  const flushQueue = (session: any) => {
    const queued = pendingTextQueueRef.current.splice(0);
    for (const item of queued) {
      try {
        session.sendClientContent({ turns: item.text, turnComplete: true });
      } catch (_) {}
    }
  };

  const connect = useCallback(async (persona = 'analyst') => {
    personaRef.current = persona;
    setStateAll('connecting');

    try {
      const res = await fetch(`/api/gemini-token?persona=${encodeURIComponent(persona)}`);
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const { token } = await res.json();

      const ai = new GoogleGenAI({ apiKey: token });

      const session = await (ai as any).live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: { responseModalities: ['AUDIO', 'TEXT'] },
        callbacks: {
          onopen: () => {
            setStateAll('connected');
            flushQueue(session);
          },
          onmessage: (message: any) => {
            const parts = message?.serverContent?.modelTurn?.parts ?? [];

            for (const part of parts) {
              // Audio chunk
              if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
                const buf = base64ToArrayBuffer(part.inlineData.data);
                callbacksRef.current.onAudioOutput(buf);
              }
              // Text transcript
              if (part.text) {
                const isFinal = message?.serverContent?.turnComplete ?? false;
                callbacksRef.current.onTranscript(part.text, isFinal);
              }
            }
          },
          onerror: (err: any) => {
            const error = err instanceof Error ? err : new Error(String(err));
            callbacksRef.current.onError?.(error);
            scheduleReconnect();
          },
          onclose: (evt: any) => {
            if (evt?.code !== 1000) scheduleReconnect();
            else setStateAll('disconnected');
          },
        },
      });

      sessionRef.current = session;

      // Refresh token 5 min before 30-min expiry
      if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current);
      tokenExpiryTimerRef.current = setTimeout(() => connect(personaRef.current), 25 * 60 * 1000);

    } catch (err) {
      console.error('[GeminiLive] connect failed:', err);
      setStateAll('disconnected');
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = () => {
    setStateAll('reconnecting');
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => connect(personaRef.current), 3000);
  };

  const disconnect = useCallback(() => {
    if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    try { sessionRef.current?.close?.(); } catch (_) {}
    sessionRef.current = null;
    setStateAll('disconnected');
  }, []);

  const sendText = useCallback((message: string, isUser = false) => {
    if (!sessionRef.current || stateRef.current !== 'connected') {
      if (!isUser) {
        // Auto-broadcast: keep only the latest
        pendingTextQueueRef.current = pendingTextQueueRef.current.filter(i => i.isUser);
      }
      pendingTextQueueRef.current.push({ text: message, isUser });
      return;
    }
    try {
      sessionRef.current.sendClientContent({ turns: message, turnComplete: true });
    } catch (err) {
      console.error('[GeminiLive] sendText failed:', err);
    }
  }, []);

  const sendAudioChunk = useCallback((pcm16: ArrayBuffer) => {
    if (!sessionRef.current || stateRef.current !== 'connected') return;
    try {
      sessionRef.current.sendRealtimeInput({
        audio: { data: bufferToBase64(pcm16), mimeType: 'audio/pcm;rate=16000' },
      });
    } catch (err) {
      console.error('[GeminiLive] sendAudioChunk failed:', err);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (!sessionRef.current) return;
    try {
      sessionRef.current.sendRealtimeInput({ audioStreamEnd: true });
    } catch (_) {}
  }, []);

  // Cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return { connect, disconnect, sendText, sendAudioChunk, stopAudio, state };
}
