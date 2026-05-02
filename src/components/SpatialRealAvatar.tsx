import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import {
  AvatarSDK,
  AvatarManager,
  AvatarView,
  ConversationState,
  Environment,
  DrivingServiceMode,
} from '@spatialwalk/avatarkit';

const AVATAR_ID = '2fc89f70-5060-4963-a2d7-4da4cab73c54';
const APP_ID = (import.meta as any).env.VITE_SPATIALREAL_APP_ID as string;

// ── Resample PCM16 from 24kHz to 16kHz (Gemini Live → SpatialReal) ───────────
async function resamplePcm16(pcm24k: ArrayBuffer, fromRate = 24000, toRate = 16000): Promise<ArrayBuffer> {
  const samples = pcm24k.byteLength / 2;
  const srcBuf = new OfflineAudioContext(1, samples, fromRate).createBuffer(1, samples, fromRate);
  const ch = srcBuf.getChannelData(0);
  const view = new DataView(pcm24k);
  for (let i = 0; i < samples; i++) ch[i] = view.getInt16(i * 2, true) / 32768;

  const targetSamples = Math.ceil(samples * toRate / fromRate);
  const offCtx = new OfflineAudioContext(1, targetSamples, toRate);
  const src = offCtx.createBufferSource();
  src.buffer = srcBuf;
  src.connect(offCtx.destination);
  src.start();
  const rendered = await offCtx.startRendering();

  const out = new ArrayBuffer(rendered.length * 2);
  const outView = new DataView(out);
  const outCh = rendered.getChannelData(0);
  for (let i = 0; i < outCh.length; i++) {
    const s = Math.max(-1, Math.min(1, outCh[i]));
    outView.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SpatialRealAvatarHandle {
  sendAudio: (pcm16: ArrayBuffer) => void;
  initAudio: () => Promise<void>;
  stopSpeaking: () => void;
  receiveAudioFromLive: (pcm24k: ArrayBuffer) => void;
}

interface Props {
  onSpeakingChange?: (speaking: boolean) => void;
  onUserMessage?: (text: string) => void; // called when user speaks via mic
  className?: string;
  avatarWidth?: number;
  avatarHeight?: number;
}

type MicState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Component ─────────────────────────────────────────────────────────────────
const SpatialRealAvatar = forwardRef<SpatialRealAvatarHandle, Props>(
  ({ onSpeakingChange, onUserMessage, className, avatarWidth = 260, avatarHeight = 320 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<AvatarView | null>(null);
    const audioInitRef = useRef(false);
    const connectedRef = useRef(false);

    const [sdkStatus, setSdkStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [micState, setMicState] = useState<MicState>('idle');
    const [lastHeard, setLastHeard] = useState('');
    const [srError, setSrError] = useState('');

    // ── SDK init ──────────────────────────────────────────────────────────────
    useEffect(() => {
      let cancelled = false;

      (async () => {
        try {
          const res = await fetch('/api/session-token');
          if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
          const { sessionToken } = await res.json();
          if (cancelled) return;

          if (!AvatarSDK.isInitialized) {
            await AvatarSDK.initialize(APP_ID, {
              environment: Environment.intl,
              drivingServiceMode: DrivingServiceMode.sdk,
            });
          }
          AvatarSDK.setSessionToken(sessionToken);

          const avatar = await AvatarManager.shared.load(AVATAR_ID);
          if (cancelled || !containerRef.current) return;

          const view = new AvatarView(avatar, containerRef.current);
          viewRef.current = view;

          view.controller.onConversationState = (state) => {
            const speaking = state === ConversationState.playing;
            onSpeakingChange?.(speaking);
            if (!speaking) setMicState((s) => s === 'speaking' ? 'idle' : s);
          };
          view.controller.onError = (err) => console.error('AvatarController:', err);

          if (!cancelled) setSdkStatus('ready');

          try {
            await view.controller.start();
            connectedRef.current = true;
          } catch (connErr) {
            console.warn('SpatialReal WebSocket 连接失败，降级为纯音频模式:', connErr);
            connectedRef.current = false;
          }
        } catch (e) {
          if (!cancelled) {
            console.error('SpatialReal 初始化失败:', e);
            setSdkStatus('error');
          }
        }
      })();

      return () => {
        cancelled = true;
        viewRef.current?.controller.close();
        viewRef.current?.dispose();
        viewRef.current = null;
      };
    }, []);

    // ── Mic: browser SpeechRecognition → parent onUserMessage ────────────────
    const recognitionRef = useRef<any>(null);

    const handleMicClick = async () => {
      if (micState === 'speaking') {
        viewRef.current?.controller.interrupt();
        viewRef.current?.controller.clear();
        setMicState('idle');
        return;
      }
      if (micState === 'listening') {
        recognitionRef.current?.stop();
        return;
      }

      if (!audioInitRef.current && viewRef.current) {
        try {
          await viewRef.current.controller.initializeAudioContext();
          audioInitRef.current = true;
        } catch (_) {}
      }

      setSrError('');

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setSrError('该浏览器不支持语音识别');
        return;
      }

      const recognition = new SR();
      recognition.lang = 'zh-CN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => setMicState('listening');

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript.trim();
        if (text) {
          setLastHeard(text);
          setMicState('thinking');
          onUserMessage?.(text);
        }
      };

      recognition.onerror = (event: any) => {
        const msg = event.error === 'not-allowed'
          ? '麦克风权限被拒绝，请在浏览器设置中允许'
          : `语音识别错误: ${event.error}`;
        setSrError(msg);
        setMicState('idle');
      };

      recognition.onend = () => {
        if (micState === 'listening') setMicState('idle');
      };

      recognition.start();
    };

    // ── Expose handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio: (pcm16: ArrayBuffer) => viewRef.current?.controller.send(pcm16, true),
      initAudio: async () => {
        if (viewRef.current) await viewRef.current.controller.initializeAudioContext();
      },
      stopSpeaking: () => {
        viewRef.current?.controller.interrupt();
        viewRef.current?.controller.clear();
      },
      receiveAudioFromLive: async (pcm24k: ArrayBuffer) => {
        setMicState('speaking');
        if (connectedRef.current && viewRef.current) {
          try {
            const pcm16k = await resamplePcm16(pcm24k);
            viewRef.current.controller.send(pcm16k, false);
          } catch (e) {
            console.error('SpatialReal resample error:', e);
          }
        }
        // Main audio playback is handled by useAICompanion's WebAudio path
      },
    }));

    // ── UI ────────────────────────────────────────────────────────────────────
    const micLabel =
      micState === 'listening' ? 'Listening...' :
      micState === 'thinking'  ? 'Thinking...' :
      micState === 'speaking'  ? 'Tap to stop' :
      sdkStatus === 'ready'    ? 'Tap to speak' : '';

    const micColor =
      micState === 'listening' ? '#ef4444' :
      micState === 'speaking'  ? '#a855f7' :
      '#6366f1';

    const isDisabled = micState === 'thinking';

    return (
      <div className={`flex flex-col items-center ${className ?? ''}`}>
        <div className="relative" style={{ width: avatarWidth, height: avatarHeight }}>
          <div ref={containerRef} style={{ width: avatarWidth, height: avatarHeight }} />
          {sdkStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
              Loading avatar...
            </div>
          )}
          {sdkStatus === 'error' && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="text-red-400/60 text-[10px]">连接失败，音频模式运行中</span>
            </div>
          )}
        </div>

        {lastHeard && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-white/10 text-xs text-white/80 text-center leading-relaxed" style={{ width: avatarWidth }}>
            <span className="text-white/50">You: {lastHeard}</span>
          </div>
        )}

        <div className="mt-3 flex flex-col items-center gap-1">
          {srError && (
            <div className="mb-1 px-3 py-1 rounded-lg bg-red-500/20 text-red-400 text-[10px] text-center max-w-[220px]">
              {srError}
            </div>
          )}
          <button
            onClick={handleMicClick}
            disabled={isDisabled}
            style={{
              background: isDisabled ? '#374151' : micColor,
              boxShadow: micState === 'listening' ? `0 0 0 8px ${micColor}33` : 'none',
              transition: 'all 0.2s',
            }}
            className="w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-40 hover:brightness-125 active:scale-90"
          >
            {micState === 'listening' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>
          {micLabel && <span className="text-[11px] text-white/50">{micLabel}</span>}
        </div>
      </div>
    );
  }
);

SpatialRealAvatar.displayName = 'SpatialRealAvatar';
export default SpatialRealAvatar;
