import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, Link, Loader2, Radio, Send, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import SpatialRealAvatar from './SpatialRealAvatar';
import type { ModeConfig } from '../lib/mode';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const DEFAULT_LIVE_URL = '';
const USER_DELAY_SECONDS = 5;

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
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_URL);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string>('尚未同步');
  const userPlayerRef = useRef<any>(null);
  const modelPlayerRef = useRef<any>(null);
  const userMountId = useMemo(() => `youtube-user-${Math.random().toString(36).slice(2)}`, []);
  const modelMountId = useMemo(() => `youtube-model-${Math.random().toString(36).slice(2)}`, []);

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

    const syncUserDelay = (force = false) => {
      const userPlayer = userPlayerRef.current;
      const modelPlayer = modelPlayerRef.current;
      if (!userPlayer || !modelPlayer) return;

      try {
        const liveEdge = getLiveEdge(modelPlayer);
        const userTime = userPlayer.getCurrentTime?.();
        if (!liveEdge || typeof userTime !== 'number') return;

        const delayedTime = Math.max(0, liveEdge - USER_DELAY_SECONDS);
        if (force) {
          userPlayer.seekTo(delayedTime, true);
        }

        const effectiveDelay = Math.max(0, Math.round(liveEdge - userTime));
        setLastSync(force ? `启动时已设置约 ${USER_DELAY_SECONDS}s 延迟` : `当前约延迟 ${effectiveDelay}s`);
      } catch {
        setLastSync('该直播源可能不支持 DVR seek');
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
            window.setTimeout(() => syncUserDelay(true), 1500);
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
  }, [activeVideoId, modelMountId, userMountId]);

  const connectLive = () => {
    const nextVideoId = extractYouTubeVideoId(liveUrl);
    if (!nextVideoId) {
      setStatus('error');
      return;
    }
    setActiveVideoId(nextVideoId);
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
            status === 'ready' && (mode.id === 'sports' ? "text-emerald-400" : "text-emerald-700"),
          )}>
            {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === 'ready' ? lastSync : status === 'error' ? '链接无效或直播不可嵌入' : '等待接入'}
          </div>
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
                avatarId={mode.avatarId}
                avatarWidth={300}
                avatarHeight={400}
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
