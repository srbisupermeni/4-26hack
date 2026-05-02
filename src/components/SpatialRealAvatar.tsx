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

// ── Placeholder responses ─────────────────────────────────────────────────────
// Replace this array with your agent's output when ready.
const TEMPLATES = [
  "Hark! What a splendid question! All the court is a stage, and the players merely athletes in Fortune's grand game!",
  "By my troth, thou speakest words most worthy! To score, or not to score — that is the question facing our noble warriors!",
  "What light through yonder basket breaks? It is the ball, and glory is the sun! Thou hast asked most well, my friend!",
  "Methinks thy inquiry strikes me as profound. Even I, the Bard of Avon, am moved by such sport and passion!",
  "Forsooth! The course of games never did run smooth, yet here we stand, witness to great valor upon the court!",
  "By the stars above, what a magnificent thought! The field of play is where heroes are forged and legends born!",
  "I heard thee clearly! In mine own age we had no such games of bouncing spheres, yet the passion of competition runs eternal!",
  "Most intriguing! As I once penned — the quality of mercy is not strained, and neither is a well-placed three-point shot!",
];

// ── PCM16 converter ───────────────────────────────────────────────────────────
export async function convertMp3ToPcm16(mp3Buffer: ArrayBuffer, sampleRate = 16000): Promise<ArrayBuffer> {
  const ctx = new AudioContext({ sampleRate });
  const decoded = await ctx.decodeAudioData(mp3Buffer.slice(0));
  const length = decoded.length;
  const pcm = new ArrayBuffer(length * 2);
  const view = new DataView(pcm);

  let mono: Float32Array;
  if (decoded.numberOfChannels === 1) {
    mono = decoded.getChannelData(0);
  } else {
    mono = new Float32Array(length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += data[i];
    }
    for (let i = 0; i < length; i++) mono[i] /= decoded.numberOfChannels;
  }

  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  await ctx.close();
  return pcm;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SpatialRealAvatarHandle {
  sendAudio: (pcm16: ArrayBuffer) => void;
  initAudio: () => Promise<void>;
  stopSpeaking: () => void;
}

interface Props {
  onSpeakingChange?: (speaking: boolean) => void;
  className?: string;
  avatarWidth?: number;
  avatarHeight?: number;
}

type MicState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Component ─────────────────────────────────────────────────────────────────
const SpatialRealAvatar = forwardRef<SpatialRealAvatarHandle, Props>(
  ({ onSpeakingChange, className, avatarWidth = 260, avatarHeight = 320 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<AvatarView | null>(null);
    const recognitionRef = useRef<any>(null);
    const audioInitRef = useRef(false);
    const connectedRef = useRef(false); // true = full lip-sync; false = audio-only fallback

    const [sdkStatus, setSdkStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [micState, setMicState] = useState<MicState>('idle');
    const [lastHeard, setLastHeard] = useState('');
    const [lastSpoken, setLastSpoken] = useState('');
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

          // 模型已加载 → 麦克风可用（即使 WebSocket 连接失败也能用音频回退）
          if (!cancelled) setSdkStatus('ready');

          // 单独处理 WebSocket 连接，失败不影响整体
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

    // ── Speak a text string via TTS ───────────────────────────────────────────
    // 有 WebSocket 连接：PCM16 → avatar（嘴型同步）
    // 无连接（降级）：HTML Audio 播放（静态形象 + 声音）
    const speakText = async (text: string) => {
      setMicState('thinking');
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('TTS failed');
        const mp3Buffer = await res.arrayBuffer();

        if (connectedRef.current && viewRef.current) {
          // 全功能：嘴型同步
          const pcm16 = await convertMp3ToPcm16(mp3Buffer);
          viewRef.current.controller.send(pcm16, true);
        } else {
          // 降级：HTML Audio 播放
          const blob = new Blob([mp3Buffer], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => {
            setMicState('idle');
            URL.revokeObjectURL(url);
          };
          audio.play();
        }

        setLastSpoken(text);
        setMicState('speaking');
      } catch (e) {
        console.error('speakText error:', e);
        setMicState('idle');
      }
    };

    // ── MediaRecorder-based STT (Whisper via backend, works on HTTP) ─────────
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const stopRecording = () => {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    };

    const transcribeAndRespond = async (audioBlob: Blob) => {
      setMicState('thinking');
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        const res = await fetch('/api/stt', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`STT failed: ${res.status}`);
        const { text } = await res.json();
        if (!text?.trim()) {
          setSrError('未检测到语音，请重试');
          setMicState('idle');
          return;
        }
        setLastHeard(text);
        const response = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
        await speakText(response);
      } catch (e: any) {
        setSrError(e?.message ?? '转写失败，请重试');
        setMicState('idle');
      }
    };

    // ── Mic button handler ────────────────────────────────────────────────────
    const handleMicClick = async () => {
      // Stop if already listening
      if (micState === 'listening') {
        stopRecording();
        return;
      }
      // Stop if avatar is speaking
      if (micState === 'speaking') {
        viewRef.current?.controller.interrupt();
        viewRef.current?.controller.clear();
        setMicState('idle');
        return;
      }

      // Init AudioContext on first user gesture (browser requirement)
      if (!audioInitRef.current && viewRef.current) {
        try {
          await viewRef.current.controller.initializeAudioContext();
          audioInitRef.current = true;
        } catch (_) {}
      }

      setSrError('');

      // Use MediaRecorder → Whisper (works on HTTP/Safari/all browsers)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          transcribeAndRespond(blob);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setMicState('listening');

        // Auto-stop after 10s
        setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') stopRecording();
        }, 10000);
      } catch (e: any) {
        const msg = e?.name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器设置中允许'
          : `麦克风错误: ${e?.message ?? e}`;
        setSrError(msg);
        setMicState('idle');
      }
    };

    // ── Expose handle for parent (useAICompanion path) ────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio: (pcm16: ArrayBuffer) => viewRef.current?.controller.send(pcm16, true),
      initAudio: async () => {
        if (viewRef.current) await viewRef.current.controller.initializeAudioContext();
      },
      stopSpeaking: () => {
        viewRef.current?.controller.interrupt();
        viewRef.current?.controller.clear();
      },
    }));

    // ── Mic button appearance ─────────────────────────────────────────────────
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
        {/* 3D avatar canvas */}
        <div className="relative" style={{ width: avatarWidth, height: avatarHeight }}>
          <div ref={containerRef} style={{ width: avatarWidth, height: avatarHeight }} />
          {sdkStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
              Loading Shakespeare...
            </div>
          )}
          {sdkStatus === 'error' && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="text-red-400/60 text-[10px]">连接失败，音频模式运行中</span>
            </div>
          )}
        </div>

        {/* Speech bubble — last heard / last spoken */}
        {(lastHeard || lastSpoken) && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-white/10 text-xs text-white/80 text-center leading-relaxed" style={{ width: avatarWidth }}>
            {micState !== 'idle' && micState !== 'thinking' && lastHeard
              ? <span className="text-white/50">You: {lastHeard}</span>
              : <span>{lastSpoken}</span>
            }
          </div>
        )}

        {/* Mic button */}
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
              // Stop icon
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              // Mic icon
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>
          {micLabel && (
            <span className="text-[11px] text-white/50">{micLabel}</span>
          )}
        </div>
      </div>
    );
  }
);

SpatialRealAvatar.displayName = 'SpatialRealAvatar';
export default SpatialRealAvatar;
