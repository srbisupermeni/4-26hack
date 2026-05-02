import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, Clapperboard, Eye, Film, Link, Loader2, Radio, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import SpatialRealAvatar, { type SpatialRealAvatarHandle } from './SpatialRealAvatar';
import { useAICompanion } from '../hooks/useAICompanion';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const DEFAULT_LIVE_URL = '';
const USER_DELAY_SECONDS = 5;

type PlaybackKind = 'live' | 'vod';

type VodExtractPayload = {
  sessionId: string;
  count: number;
  files: string[];
  exportBaseUrl: string;
  emptyHint?: string | null;
  config?: {
    maxDurationSeconds?: number | null;
    motionThreshold?: number;
    startSeconds?: number;
    videoDurationSeconds?: number | null;
    lastNSeconds?: number | null;
  };
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

export function YouTubeLiveCompanionDemo() {
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind>('live');
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_URL);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string>('尚未同步');
  const userPlayerRef = useRef<any>(null);
  const modelPlayerRef = useRef<any>(null);
  const userMountId = useMemo(() => `youtube-user-${Math.random().toString(36).slice(2)}`, []);
  const modelMountId = useMemo(() => `youtube-model-${Math.random().toString(36).slice(2)}`, []);

  // Live motion frame extraction state
  const [motionFrames, setMotionFrames] = useState<any[]>([]);
  const [motionStatus, setMotionStatus] = useState<{
    active: boolean;
    frameCount: number;
    error?: string;
    maxBufferFrames?: number;
    exportBaseUrl?: string | null;
    sessionId?: string | null;
    captureMode?: string | null;
    sampleIntervalSeconds?: number | null;
  }>({
    active: false,
    frameCount: 0,
  });
  /** 直播：内存里保留最近 N 张合格帧（滑动窗口，默认 120） */
  const [liveMaxBufferFrames, setLiveMaxBufferFrames] = useState(120);
  /** 直播：是否额外把每张帧写入服务器 motion_exports/live_<id>/ */
  const [livePersistToDisk, setLivePersistToDisk] = useState(false);
  /** 直播抽帧：定时 2s 截图 vs 运动检测（切换后会重新请求 /api/live-motion/start） */
  const [liveCaptureMode, setLiveCaptureMode] = useState<'interval2s' | 'motion'>('interval2s');
  const liveOptsRef = useRef({ max: 120, persist: false, captureMode: 'interval2s' as 'interval2s' | 'motion' });
  liveOptsRef.current = {
    max: liveMaxBufferFrames,
    persist: livePersistToDisk,
    captureMode: liveCaptureMode,
  };

  const spatialRealRef = useRef<SpatialRealAvatarHandle>(null);

  const gameContext = useMemo(() => ({
    teams: 'YouTube',
    score: '',
    clock: '',
    lastPlay: activeVideoId ? `Watching video: ${activeVideoId}` : 'Watching YouTube',
    excitement: 0.5,
  }), [activeVideoId]);

  const { sendMessage } = useAICompanion(gameContext, 'YouTube', undefined, spatialRealRef);

  const liveFrameSrc = (frame: { dataUrl?: string; fileName?: string }) => {
    const base = motionStatus.exportBaseUrl;
    if (base && frame.fileName) {
      return `${base}${encodeURIComponent(frame.fileName)}`;
    }
    return frame.dataUrl || '';
  };

  const [vodExtracting, setVodExtracting] = useState(false);
  const [vodExtractError, setVodExtractError] = useState<string | null>(null);
  const [vodExtractResult, setVodExtractResult] = useState<VodExtractPayload | null>(null);
  /** 勾选后请求整段解码（传 `max_duration_seconds: null`）；默认仅前 5 分钟 */
  const [vodExtractFullVideo, setVodExtractFullVideo] = useState(false);
  /** 勾选后抽「最后 5 分钟」（传 `last_n_seconds: 300`，仍要先完整下载） */
  const [vodExtractLast5Min, setVodExtractLast5Min] = useState(false);

  const setPlaybackKindAndReset = (kind: PlaybackKind) => {
    if (kind === playbackKind) return;
    setPlaybackKind(kind);
    setActiveVideoId('');
    setMotionFrames([]);
    setMotionStatus({ active: false, frameCount: 0 });
    setLiveMaxBufferFrames(120);
    setLivePersistToDisk(false);
    setVodExtractResult(null);
    setVodExtractError(null);
    setVodExtractFullVideo(false);
    setVodExtractLast5Min(false);
    setStatus('idle');
    setLastSync('尚未同步');
    fetch('/api/live-motion/stop', { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    if (!activeVideoId) return;

    let cancelled = false;

    // 录播：单播放器，不做 live edge 延迟同步
    if (playbackKind === 'vod') {
      setStatus('loading');
      loadYouTubeIframeApi().then((YT) => {
        if (cancelled) return;
        userPlayerRef.current?.destroy?.();
        modelPlayerRef.current?.destroy?.();
        modelPlayerRef.current = null;

        userPlayerRef.current = new YT.Player(userMountId, {
          videoId: activeVideoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            mute: 0,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              setStatus('ready');
              setLastSync('录播模式');
            },
            onError: () => setStatus('error'),
          },
        });
      });

      return () => {
        cancelled = true;
        userPlayerRef.current?.destroy?.();
        userPlayerRef.current = null;
      };
    }

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
  }, [activeVideoId, playbackKind, modelMountId, userMountId]);

  // 直播：后台流式运动帧 + 轮询（录播不走这条）
  useEffect(() => {
    if (!activeVideoId || playbackKind !== 'live') return;

    let cancelled = false;
    const youtubeUrl = `https://www.youtube.com/watch?v=${activeVideoId}`;

    const { max, persist, captureMode } = liveOptsRef.current;
    const buf = Math.min(500, Math.max(10, max));
    fetch('/api/live-motion/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: youtubeUrl,
        max_buffer_frames: buf,
        persist_frames: persist,
        motion_threshold: 0.6,
        cooldown_seconds: 0.8,
        compare_stride: 12,
        ...(captureMode === 'interval2s'
          ? { sample_interval_seconds: 2 }
          : { sample_interval_seconds: null }),
      }),
    }).catch((err) => console.error('Failed to start motion extraction:', err));

    const pollId = window.setInterval(async () => {
      try {
        const res = await fetch('/api/live-motion/frames');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMotionFrames(data.frames || []);
          setMotionStatus(data.status || {});
        }
      } catch {
        // Network error, will retry next poll
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      fetch('/api/live-motion/stop', { method: 'POST' }).catch(() => {});
      setMotionFrames([]);
      setMotionStatus({ active: false, frameCount: 0 });
    };
  }, [activeVideoId, playbackKind, liveCaptureMode]);

  const resolveYoutubeWatchUrl = () => {
    const trimmed = liveUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (activeVideoId) return `https://www.youtube.com/watch?v=${activeVideoId}`;
    return '';
  };

  const runVodMotionExtract = async () => {
    const url = resolveYoutubeWatchUrl();
    if (!url) {
      setVodExtractError('请先填写有效的 YouTube 链接');
      return;
    }
    setVodExtracting(true);
    setVodExtractError(null);
    setVodExtractResult(null);
    try {
      const res = await fetch('/api/vision/motion-frames-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          ...(vodExtractLast5Min ? { last_n_seconds: 300 } : {}),
          ...(!vodExtractLast5Min && vodExtractFullVideo ? { max_duration_seconds: null } : {}),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      }
      const data = JSON.parse(text) as VodExtractPayload;
      setVodExtractResult(data);
      if (data.count === 0 && data.emptyHint) {
        setVodExtractError(data.emptyHint);
      }
    } catch (e) {
      setVodExtractError(e instanceof Error ? e.message : '提取失败');
    } finally {
      setVodExtracting(false);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-white/35">播放模式</span>
          <div className="inline-flex rounded-2xl p-1 bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setPlaybackKindAndReset('live')}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors',
                playbackKind === 'live'
                  ? 'bg-brand-purple text-white'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              <Radio className="w-4 h-4" />
              直播
            </button>
            <button
              type="button"
              onClick={() => setPlaybackKindAndReset('vod')}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors',
                playbackKind === 'vod'
                  ? 'bg-brand-purple text-white'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              <Film className="w-4 h-4" />
              录播
            </button>
          </div>
        </div>

        {playbackKind === 'live' && (
          <div className="flex flex-col gap-2 mb-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-white/35 shrink-0">后台抽帧</span>
              <div className="inline-flex rounded-xl p-0.5 bg-white/5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setLiveCaptureMode('interval2s')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                    liveCaptureMode === 'interval2s'
                      ? 'bg-brand-purple text-white'
                      : 'text-white/50 hover:text-white/80',
                  )}
                >
                  每 2 秒截图
                </button>
                <button
                  type="button"
                  onClick={() => setLiveCaptureMode('motion')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                    liveCaptureMode === 'motion'
                      ? 'bg-brand-purple text-white'
                      : 'text-white/50 hover:text-white/80',
                  )}
                >
                  运动检测
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-white/50">
              <label className="flex items-center gap-2">
                内存保留最近
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={liveMaxBufferFrames}
                  onChange={(e) => setLiveMaxBufferFrames(Math.min(500, Math.max(10, Number(e.target.value) || 120)))}
                  className="w-16 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white"
                />
                张合格图（滚动更新）
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-white/20 bg-white/5"
                  checked={livePersistToDisk}
                  onChange={(e) => setLivePersistToDisk(e.target.checked)}
                />
                同步保存每张到服务器
              </label>
              <span className="text-white/35">接通前调好；轮询 1s 拉最新列表</span>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1 relative">
            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-purple" />
            <input
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder={
                playbackKind === 'live'
                  ? '粘贴 YouTube 直播链接，例如 https://www.youtube.com/watch?v=...'
                  : '粘贴 YouTube 点播/回放链接，例如 https://www.youtube.com/watch?v=...'
              }
              className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 pl-11 pr-4 text-sm focus:outline-none focus:border-brand-purple"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={connectLive}
              className="h-14 px-6 rounded-2xl bg-brand-purple text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {playbackKind === 'live' ? '接入直播' : '开始播放'}
            </button>
            {playbackKind === 'vod' && (
              <button
                type="button"
                disabled={vodExtracting}
                onClick={runVodMotionExtract}
                className={cn(
                  'h-14 px-5 rounded-2xl font-bold flex items-center justify-center gap-2 border transition-transform',
                  vodExtracting
                    ? 'border-white/10 text-white/35 cursor-not-allowed'
                    : 'border-brand-purple/50 text-brand-purple hover:bg-brand-purple/10 hover:scale-[1.02] active:scale-[0.98]',
                )}
              >
                {vodExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                {vodExtractLast5Min
                  ? '提取运动帧（最后5分钟）'
                  : vodExtractFullVideo
                    ? '整段提取运动帧'
                    : '提取运动帧（前5分钟）'}
              </button>
            )}
          </div>
        </div>

        {playbackKind === 'vod' && (
          <div className="mt-3 flex flex-col gap-2 text-xs text-white/50">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-white/5"
                checked={vodExtractLast5Min}
                onChange={(e) => {
                  const v = e.target.checked;
                  setVodExtractLast5Min(v);
                  if (v) setVodExtractFullVideo(false);
                }}
              />
              仅最后 5 分钟（下载仍为整段视频后.seek 抽帧）
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-white/5"
                disabled={vodExtractLast5Min}
                checked={vodExtractFullVideo}
                onChange={(e) => {
                  const v = e.target.checked;
                  setVodExtractFullVideo(v);
                  if (v) setVodExtractLast5Min(false);
                }}
              />
              整段视频解码提取（与「最后5分钟」二选一）
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/45">
          {playbackKind === 'live' ? (
            <>
              <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
                <Radio className="w-3 h-3 text-brand-purple" />
                模型端：同源 live edge
              </div>
              <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
                <Activity className="w-3 h-3 text-brand-purple" />
                用户端：同源延迟 {USER_DELAY_SECONDS}s
              </div>
            </>
          ) : (
            <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
              <Clapperboard className="w-3 h-3 text-brand-purple" />
              默认只解码前 5 分钟抽帧；可选勾选整段。略缩图见下方（仅录播）
            </div>
          )}
          <div className={cn(
            "glass rounded-full px-3 py-1.5 flex items-center gap-2",
            status === 'error' && "text-red-400",
            status === 'ready' && "text-emerald-400"
          )}>
            {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === 'ready' ? lastSync : status === 'error' ? (playbackKind === 'live' ? '链接无效或直播不可嵌入' : '链接无效或视频不可嵌入') : '等待接入'}
          </div>
          {motionStatus.error && (
            <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2 text-red-400">
              <span className="text-xs">提取错误: {motionStatus.error.slice(0, 60)}</span>
            </div>
          )}
          {playbackKind === 'live' && (
            <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
              <Eye className="w-3 h-3 text-brand-purple" />
              <span className="text-xs">
                {motionStatus.active
                  ? motionStatus.captureMode === 'interval'
                    ? `定时截屏（每 ${motionStatus.sampleIntervalSeconds ?? 2}s）· 缓冲 ${motionFrames.length}/${motionStatus.maxBufferFrames ?? liveMaxBufferFrames}`
                    : `运动帧提取中 · 缓冲 ${motionFrames.length}/${motionStatus.maxBufferFrames ?? liveMaxBufferFrames}`
                  : '后台截屏未启动'}
              </span>
            </div>
          )}
        </div>

        {vodExtractError && (
          <div className="mt-3 text-xs text-red-400 px-1">{vodExtractError}</div>
        )}

        {playbackKind === 'live' && motionFrames.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-2 mr-2 shrink-0">
              <div className={cn(
                "w-2 h-2 rounded-full",
                motionStatus.active ? "bg-brand-purple animate-pulse" : "bg-white/20"
              )} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                Live Edge 帧
              </span>
            </div>
            {motionFrames.map((frame) => (
              <div key={frame.index} className="shrink-0 w-28 h-16 rounded-lg overflow-hidden border border-white/10 relative">
                <img
                  src={liveFrameSrc(frame)}
                  alt={`Frame ${frame.index}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 text-[8px] text-white/60 text-center">
                  {frame.motionRatio?.toFixed(0)}% motion
                </div>
              </div>
            ))}
          </div>
        )}

        {playbackKind === 'vod' && vodExtractResult && vodExtractResult.files.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-2 mr-2 shrink-0">
              <Film className="w-3 h-3 text-brand-purple" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                录播提取 {vodExtractResult.count} 张
                {vodExtractResult.config?.lastNSeconds != null && ' · 最后一段'}
                {typeof vodExtractResult.config?.maxDurationSeconds === 'number' &&
                  !vodExtractResult.config?.lastNSeconds &&
                  ` · 限前 ${Math.round(vodExtractResult.config.maxDurationSeconds / 60)} 分钟`}
                {vodExtractResult.config?.maxDurationSeconds === null &&
                  !vodExtractResult.config?.lastNSeconds &&
                  ' · 整段解码'}
              </span>
            </div>
            {vodExtractResult.files.map((name) => (
              <div key={name} className="shrink-0 w-28 h-16 rounded-lg overflow-hidden border border-white/10 relative">
                <img
                  src={`${vodExtractResult.exportBaseUrl}${encodeURIComponent(name)}`}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 min-h-[620px]">
        <div className="glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden bg-black shadow-2xl">
          <div className="h-12 px-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">用户看到的比赛</p>
              <p className="text-xs text-white/35">
                {playbackKind === 'live' ? 'YouTube Live DVR 延迟播放' : 'YouTube 点播 / 回放'}
              </p>
            </div>
            {playbackKind === 'live' ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Delay {USER_DELAY_SECONDS}s</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">VOD</span>
            )}
          </div>
          <div className="relative aspect-video bg-black">
            {activeVideoId ? (
              <>
                <div id={userMountId} className="absolute inset-0 w-full h-full" />
                {playbackKind === 'live' && motionFrames.length > 0 && (
                  <div className="absolute top-3 right-3 w-36 h-[84px] rounded-xl overflow-hidden border-2 border-brand-purple/50 shadow-lg shadow-brand-purple/20 z-10">
                    <img
                      src={liveFrameSrc(motionFrames[motionFrames.length - 1])}
                      alt="Live Edge"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1.5 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[8px] font-bold text-white uppercase">Live Edge</span>
                    </div>
                  </div>
                )}
                {playbackKind === 'vod' && vodExtractResult && vodExtractResult.files.length > 0 && (
                  <div className="absolute top-3 right-3 w-36 h-[84px] rounded-xl overflow-hidden border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20 z-10">
                    <img
                      src={`${vodExtractResult.exportBaseUrl}${encodeURIComponent(vodExtractResult.files[vodExtractResult.files.length - 1])}`}
                      alt="最近提取帧"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1.5 flex items-center gap-1">
                      <Film className="w-3 h-3 text-emerald-400" />
                      <span className="text-[8px] font-bold text-emerald-300 uppercase">录播抽帧</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center p-8">
                <div>
                  {playbackKind === 'live' ? (
                    <Radio className="w-10 h-10 text-white/20 mx-auto mb-4" />
                  ) : (
                    <Film className="w-10 h-10 text-white/20 mx-auto mb-4" />
                  )}
                  <p className="text-sm text-white/35">
                    {playbackKind === 'live'
                      ? '粘贴 YouTube 直播链接后开始播放'
                      : '选择录播后粘贴链接，再点开始播放'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden bg-black flex flex-col">
          <div className="h-12 px-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">数字人陪伴</p>
              <p className="text-xs text-white/35">SpatialReal 数字人</p>
            </div>
            <Bot className="w-5 h-5 text-brand-purple" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <SpatialRealAvatar
              ref={spatialRealRef}
              onUserMessage={(text) => sendMessage(text)}
              avatarWidth={300}
              avatarHeight={400}
            />
          </div>
        </div>
      </div>

      {playbackKind === 'live' && (
        <div className="sr-only" aria-hidden="true">
          <div id={modelMountId} />
        </div>
      )}
    </div>
  );
}
