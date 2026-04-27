import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, Link, Loader2, Radio, Send, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import SpatialRealAvatar, { type SpatialRealAvatarHandle } from './SpatialRealAvatar';
import type { ModeConfig } from '../lib/mode';
import { getVoiceProfileForAvatarId } from '../config/avatarVoiceProfiles';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const DEFAULT_LIVE_URL = 'https://www.youtube.com/watch?v=NTHIqie0axY';
const USER_DELAY_SECONDS = 5;

const SUBTITLE_BUFFER_LIMIT = 8;

type SubtitleEntry = {
  id: string;
  text: string;
  at: string;
};

function extractYouTubeVideoId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.split('/').filter(Boolean)[0] || '';
    }
    if (url.pathname.startsWith('/live/')) {
      return url.pathname.split('/').filter(Boolean)[1] || '';
    }
    return url.searchParams.get('v') || '';
  } catch {
    return trimmed.length === 11 ? trimmed : '';
  }
}

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise<any>((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  });
}

interface Props {
  mode: ModeConfig;
}

export function YouTubeLiveCompanionDemo({ mode }: Props) {
  const theme = mode.theme;
  const isDarkChannel = mode.id === 'sports';
  const voiceProfile = useMemo(
    () => mode.voiceProfile ?? (mode.avatarId ? getVoiceProfileForAvatarId(mode.avatarId) : undefined),
    [mode.voiceProfile, mode.avatarId],
  );
  const speechRecognitionLang = useMemo(() => {
    if (mode.id === 'british_drama') return 'en-GB';
    return 'en-US';
  }, [mode.id]);
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_URL);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [connectEpoch, setConnectEpoch] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string>('Not synced yet');
  const [subtitleBuffer, setSubtitleBuffer] = useState<SubtitleEntry[]>([]);
  const [subtitleStreamStatus, setSubtitleStreamStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [highlightStatus, setHighlightStatus] = useState<'idle' | 'queued' | 'speaking'>('idle');
  const [lastHighlightText, setLastHighlightText] = useState<string>('');
  const userPlayerRef = useRef<any>(null);
  const modelPlayerRef = useRef<any>(null);
  const avatarRef = useRef<SpatialRealAvatarHandle | null>(null);
  const subtitleBufferRef = useRef<SubtitleEntry[]>([]);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    subtitleBufferRef.current = subtitleBuffer;
  }, [subtitleBuffer]);

  const appendSubtitleEntry = (text: string, at: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubtitleBuffer((prev) => {
      const next: SubtitleEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: trimmed,
        at,
      };
      return [next, ...prev].slice(0, SUBTITLE_BUFFER_LIMIT);
    });
  };

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/ws/subtitles`;
      setSubtitleStreamStatus('connecting');
      socket = new WebSocket(url);

      socket.onopen = () => setSubtitleStreamStatus('open');
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data?.text) return;
          appendSubtitleEntry(String(data.text), data.timestamp || new Date().toLocaleTimeString());
        } catch {
          // ignore non-JSON frames
        }
      };
      socket.onclose = () => {
        if (cancelled) return;
        setSubtitleStreamStatus('closed');
        reconnectTimer = window.setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/ws/highlights`;
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type !== 'highlight_reaction') return;
          const text: string = String(data.text || '').trim();
          if (!text) return;
          const deliverAfterMs: number = Math.max(0, Number(data.deliverAfterMs) || 0);

          // Schedule the avatar to speak when the user's delayed feed reaches
          // the highlight moment. Replace any previously queued highlight so
          // back-to-back hits don't pile up.
          if (highlightTimerRef.current !== null) {
            window.clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = null;
          }

          setLastHighlightText(text);
          setHighlightStatus('queued');
          highlightTimerRef.current = window.setTimeout(async () => {
            highlightTimerRef.current = null;
            if (!mode.avatarEnabled) {
              setHighlightStatus('idle');
              return;
            }
            try {
              setHighlightStatus('speaking');
              await avatarRef.current?.initAudio?.();
              avatarRef.current?.stopSpeaking?.();
              await avatarRef.current?.speak?.(text);
            } catch (err) {
              console.error('Highlight avatar speak failed:', err);
            } finally {
              setHighlightStatus('idle');
            }
          }, deliverAfterMs);
        } catch {
          // ignore non-JSON / malformed frames
        }
      };
      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = window.setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      socket?.close();
    };
  }, [mode.avatarEnabled]);
  const userMountId = useMemo(() => `youtube-user-${Math.random().toString(36).slice(2)}`, []);
  const modelMountId = useMemo(() => `youtube-model-${Math.random().toString(36).slice(2)}`, []);

  const startLiveFromUrl = useCallback((rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    const nextVideoId = extractYouTubeVideoId(trimmedUrl);
    if (!nextVideoId) {
      setStatus('error');
      return;
    }
    setActiveVideoId(nextVideoId);
    setConnectEpoch((value) => value + 1);

    fetch('/api/subtitles/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: trimmedUrl,
        persona: mode.persona,
        sport: mode.sport,
      }),
    }).catch((error) => {
      console.warn('Failed to start live subtitle worker:', error);
    });
  }, [mode.persona, mode.sport]);

  const autoConnectedRef = useRef(false);
  useEffect(() => {
    if (!DEFAULT_LIVE_URL.trim() || autoConnectedRef.current) return;
    autoConnectedRef.current = true;
    startLiveFromUrl(DEFAULT_LIVE_URL);
  }, [startLiveFromUrl]);


  useEffect(() => {
    if (!activeVideoId) return;

    let cancelled = false;

    const getLiveEdge = (player: any) => {
      const duration = player.getDuration?.();
      const currentTime = player.getCurrentTime?.();
      if (typeof duration === 'number' && duration > 0) return duration;
      if (typeof currentTime === 'number' && currentTime > 0) return currentTime;
      return 0;
    };

    const seekToInitialDelay = () => {
      const userPlayer = userPlayerRef.current;
      const modelPlayer = modelPlayerRef.current;
      if (!userPlayer || !modelPlayer) return;

      try {
        const liveEdge = getLiveEdge(modelPlayer);
        const userTime = userPlayer.getCurrentTime?.();
        if (!liveEdge || typeof userTime !== 'number') return;

        const delayedTime = Math.max(0, liveEdge - USER_DELAY_SECONDS);
        userPlayer.seekTo(delayedTime, true);
        setLastSync(`Set ~${USER_DELAY_SECONDS}s delay`);
      } catch {
        setLastSync('This stream may not support DVR seek');
      }
    };

    setStatus('loading');

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled) return;

      userPlayerRef.current?.destroy?.();
      modelPlayerRef.current?.destroy?.();

      modelPlayerRef.current = new YT.Player(modelMountId, {
        videoId: activeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          mute: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            event.target.mute();
            event.target.playVideo();
          },
        },
      });

      userPlayerRef.current = new YT.Player(userMountId, {
        videoId: activeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          mute: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            event.target.mute();
            event.target.playVideo();
            window.setTimeout(seekToInitialDelay, 1500);
            setStatus('ready');
          },
          onError: () => setStatus('error'),
        },
      });
    });

    return () => {
      cancelled = true;
      userPlayerRef.current?.destroy?.();
      modelPlayerRef.current?.destroy?.();
      userPlayerRef.current = null;
      modelPlayerRef.current = null;
    };
  }, [activeVideoId, connectEpoch, modelMountId, userMountId]);

  const connectLive = () => {
    startLiveFromUrl(liveUrl);
  };

  const handleUserSpeech = async (transcript: string) => {
    const userMessage = transcript.trim();
    const t = {
      emptyTranscript: "I didn't quite catch that—could you say it again?",
      noReply: 'I could not generate a reply. Please try again.',
      network: 'The service is unavailable. Check the backend and OpenAI configuration, then try again.',
    };

    if (!userMessage) {
      if (mode.avatarEnabled) {
        try {
          await avatarRef.current?.initAudio?.();
          await avatarRef.current?.speak?.(t.emptyTranscript);
        } catch (_) {}
      }
      return;
    }

    const subtitleSnapshot = subtitleBufferRef.current.map((entry) => entry.text);

    const speakSafe = async (text: string) => {
      if (!mode.avatarEnabled) return;
      try {
        await avatarRef.current?.initAudio?.();
        await avatarRef.current?.speak?.(text);
      } catch (speakError) {
        console.error('Avatar speak failed:', speakError);
      }
    };

    try {
      const response = await fetch('/api/pipeline/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggerReason: 'user_message',
          userMessage,
          activeSport: mode.sport,
          persona: mode.persona,
          gameContext: {
            teams: activeVideoId ? `YouTube Live (${activeVideoId})` : 'YouTube Live',
            score: 'live',
            clock: new Date().toLocaleTimeString(),
            lastPlay: subtitleSnapshot[0] ?? 'No subtitles captured yet',
            excitement: 0.7,
            isReplay: false,
          },
          chatHistory: subtitleSnapshot.slice(0, 5).map((text) => ({
            role: 'user',
            content: `[subtitle] ${text}`,
          })),
          frames: [],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const agentReply = (data?.output?.text || '').trim();
      if (!agentReply) {
        await speakSafe(t.noReply);
        return;
      }

      await speakSafe(agentReply);
    } catch (error) {
      console.error('Pipeline call failed:', error);
      await speakSafe(t.network);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-5">
      <div className={cn("rounded-[2rem] p-4 md:p-5", theme.cardClass)}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1 relative">
            <Link className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4", theme.accent)} />
            <input
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder={theme.inputPlaceholder}
              className={cn(
                "w-full h-14 rounded-2xl pl-11 pr-4 text-sm border focus:outline-none transition-colors",
                theme.inputClass
              )}
            />
          </div>
          <button
            onClick={connectLive}
            className={cn(
              "h-14 px-6 rounded-2xl font-bold transition-transform flex items-center justify-center gap-2",
              theme.primaryButtonClass
            )}
          >
            <Send className="w-4 h-4" />
            {theme.connectButtonLabel}
          </button>
        </div>

        <div className={cn("mt-4 flex flex-wrap gap-3 text-xs", theme.textMuted)}>
          <div className={cn("rounded-full px-3 py-1.5 flex items-center gap-2", theme.pillClass)}>
            <Radio className={cn("w-3 h-3", theme.accent)} />
            {theme.liveBadgeLabel}
          </div>
          <div className={cn("rounded-full px-3 py-1.5 flex items-center gap-2", theme.pillClass)}>
            <Activity className={cn("w-3 h-3", theme.accent)} />
            {theme.delayBadgeLabel} {USER_DELAY_SECONDS}s
          </div>
          <div className={cn(
            "rounded-full px-3 py-1.5 flex items-center gap-2",
            theme.pillClass,
            status === 'error' && "text-red-500",
            status === 'ready' && (isDarkChannel ? "text-emerald-400" : "text-emerald-700"),
          )}>
            {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === 'ready' ? lastSync : status === 'error' ? 'Invalid URL or embed blocked' : 'Waiting to connect'}
          </div>
          {highlightStatus !== 'idle' && (
            <div
              className={cn(
                'rounded-full px-3 py-1.5 flex items-center gap-2',
                theme.pillActiveClass,
                'animate-pulse'
              )}
              title={lastHighlightText}
            >
              <Sparkles className={cn('w-3 h-3', theme.accent)} />
              {highlightStatus === 'queued'
                ? 'Highlight queued—avatar will speak when you see the play'
                : 'Avatar is calling the highlight'}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 min-h-[620px]">
        <div className={cn("rounded-[2.5rem] overflow-hidden shadow-xl", theme.cardClass)}>
          <div className={cn("h-12 px-5 border-b flex items-center justify-between", theme.borderColor)}>
            <div>
              <p className={cn("text-[10px] font-bold uppercase tracking-widest", theme.accent)}>{theme.videoLabel}</p>
              <p className={cn("text-xs", theme.textMuted)}>{theme.videoCardSubtitle}</p>
            </div>
            <span className={cn("text-[10px] font-bold uppercase tracking-widest", theme.textMuted)}>Delay {USER_DELAY_SECONDS}s</span>
          </div>
          <div className="relative aspect-video bg-black">
            {activeVideoId ? (
              <div id={userMountId} className="absolute inset-0 w-full h-full" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center p-8 bg-black/80">
                <div>
                  <Radio className="w-10 h-10 text-white/25 mx-auto mb-4" />
                  <p className="text-sm text-white/55">{theme.videoEmptyHint}</p>
                </div>
              </div>
            )}
          </div>
          <div
            className={cn(
              'border-t px-5 py-3 flex items-start gap-3',
              theme.borderColor,
              isDarkChannel
                ? 'bg-black/70'
                : mode.id === 'british_drama'
                ? 'bg-[#1a0e0a]'
                : 'bg-[#0f172a]'
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              <span
                className={cn(
                  'inline-flex w-2.5 h-2.5 rounded-full',
                  subtitleStreamStatus === 'open'
                    ? 'bg-emerald-400 animate-pulse'
                    : subtitleStreamStatus === 'closed'
                    ? 'bg-red-400'
                    : 'bg-white/40 animate-pulse'
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/55">
                Live subtitle ·{' '}
                {subtitleStreamStatus === 'open' ? 'Connected' : subtitleStreamStatus === 'closed' ? 'Disconnected' : 'Connecting'}
              </p>
              <p className="mt-1 text-base md:text-lg font-medium text-white truncate">
                {subtitleBuffer[0]?.text ?? 'No subtitles yet—waiting for /api/subtitles…'}
              </p>
              {subtitleBuffer[0] && (
                <p className="mt-0.5 text-[10px] text-white/45">{subtitleBuffer[0].at}</p>
              )}
            </div>
          </div>
        </div>

        <div className={cn("rounded-[2.5rem] overflow-hidden flex flex-col", theme.cardClass)}>
          <div className={cn("h-12 px-5 border-b flex items-center justify-between", theme.borderColor)}>
            <div>
              <p className={cn("text-[10px] font-bold uppercase tracking-widest", theme.accent)}>{theme.avatarLabel}</p>
              <p className={cn("text-xs", theme.textMuted)}>{theme.avatarCardSubtitle}</p>
            </div>
            {mode.avatarEnabled ? (
              <Sparkles className={cn("w-5 h-5", theme.accent)} />
            ) : (
              <Bot className={cn("w-5 h-5", theme.accent)} />
            )}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            {mode.avatarEnabled ? (
              <SpatialRealAvatar
                key={mode.avatarId}
                ref={avatarRef}
                avatarId={mode.avatarId}
                voiceProfile={voiceProfile}
                speechRecognitionLang={speechRecognitionLang}
                avatarWidth={300}
                avatarHeight={400}
                onUserSpeech={handleUserSpeech}
                micHintLabel="Tap to talk to the avatar"
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className={cn("w-28 h-28 rounded-full flex items-center justify-center", theme.surfaceMuted)}>
                  <Bot className={cn("w-12 h-12", theme.accent)} />
                </div>
                <div className="space-y-2 max-w-xs">
                  <h3 className={cn("text-xl font-bold", theme.textPrimary)}>{theme.avatarPlaceholderHeading}</h3>
                  <p className={cn("text-sm leading-relaxed", theme.textMuted)}>
                    {theme.avatarPlaceholderBody}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sr-only" aria-hidden="true">
        <div id={modelMountId} />
      </div>
    </div>
  );
}
