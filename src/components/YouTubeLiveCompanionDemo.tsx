import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, Link, Loader2, Radio, Send } from 'lucide-react';
import { cn } from '../lib/utils';

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

export function YouTubeLiveCompanionDemo() {
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
      <div className="glass-dark rounded-[2rem] border border-white/10 p-4 md:p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1 relative">
            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-purple" />
            <input
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder="粘贴 YouTube Live 链接，例如 https://www.youtube.com/watch?v=..."
              className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 pl-11 pr-4 text-sm focus:outline-none focus:border-brand-purple"
            />
          </div>
          <button
            onClick={connectLive}
            className="h-14 px-6 rounded-2xl bg-brand-purple text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            接入直播
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/45">
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
            <Radio className="w-3 h-3 text-brand-purple" />
            模型端：同源 live edge
          </div>
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
            <Activity className="w-3 h-3 text-brand-purple" />
            用户端：同源延迟 {USER_DELAY_SECONDS}s
          </div>
          <div className={cn(
            "glass rounded-full px-3 py-1.5 flex items-center gap-2",
            status === 'error' && "text-red-400",
            status === 'ready' && "text-emerald-400"
          )}>
            {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === 'ready' ? lastSync : status === 'error' ? '链接无效或直播不可嵌入' : '等待接入'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 min-h-[620px]">
        <div className="glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden bg-black shadow-2xl">
          <div className="h-12 px-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">用户看到的比赛</p>
              <p className="text-xs text-white/35">YouTube Live DVR 延迟播放</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Delay {USER_DELAY_SECONDS}s</span>
          </div>
          <div className="relative aspect-video bg-black">
            {activeVideoId ? (
              <div id={userMountId} className="absolute inset-0 w-full h-full" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center p-8">
                <div>
                  <Radio className="w-10 h-10 text-white/20 mx-auto mb-4" />
                  <p className="text-sm text-white/35">粘贴 YouTube Live 链接后开始播放</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden bg-black flex flex-col">
          <div className="h-12 px-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">数字人陪伴</p>
              <p className="text-xs text-white/35">先占位，后续接语音/表情/动作</p>
            </div>
            <Bot className="w-5 h-5 text-brand-purple" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-28 h-28 rounded-full border border-brand-purple/30 bg-brand-purple/10 flex items-center justify-center mb-6">
              <Bot className="w-12 h-12 text-brand-purple" />
            </div>
            <h3 className="text-2xl font-bold mb-3">数字人准备中</h3>
            <p className="text-sm text-white/45 leading-relaxed max-w-xs">
              这里会播放数字人的实时反应。当前先保留黑屏占位，后续接入预生成话术、TTS 和数字人渲染服务。
            </p>
          </div>
        </div>
      </div>

      <div className="sr-only" aria-hidden="true">
        <div id={modelMountId} />
      </div>
    </div>
  );
}
