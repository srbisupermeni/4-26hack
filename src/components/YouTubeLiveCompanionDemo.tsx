import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, Bot, Link, Loader2, Radio, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AVATAR_SELECTOR_OPTIONS,
  DEFAULT_SPATIALREAL_AVATAR_ID,
  getVoiceProfileForAvatarId,
} from '../config/avatarVoiceProfiles';
import type { ConversationTurn } from '../lib/conversationPipeline';
import SpatialRealAvatar from './SpatialRealAvatar';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const DEFAULT_LIVE_URL = '';
const USER_DELAY_SECONDS = 5;

type SubtitleDebugRow = {
  id: string;
  subtitle: string;
  agentReply: string;
  at: string;
  status: 'ok' | 'error';
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
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_URL);
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_SPATIALREAL_AVATAR_ID);
  const currentVoice = useMemo(() => getVoiceProfileForAvatarId(avatarId), [avatarId]);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string>('尚未同步');
  const [subtitleInput, setSubtitleInput] = useState('');
  const [isSendingSubtitle, setIsSendingSubtitle] = useState(false);
  const [subtitleDebugRows, setSubtitleDebugRows] = useState<SubtitleDebugRow[]>([]);
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

  const sendSubtitleToAgent = async () => {
    const subtitle = subtitleInput.trim();
    if (!subtitle || isSendingSubtitle) return;

    setIsSendingSubtitle(true);
    try {
      const response = await fetch('/api/pipeline/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggerReason: 'subtitle_event',
          userMessage: subtitle,
          activeSport: 'NBA',
          persona: 'analyst',
          gameContext: {
            teams: activeVideoId ? `YouTube Live (${activeVideoId})` : 'YouTube Live',
            score: 'live',
            clock: new Date().toLocaleTimeString(),
            lastPlay: subtitle,
            excitement: 0.7,
            isReplay: false,
          },
          chatHistory: [],
          frames: [],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const agentReply = data?.output?.text || '(No output text)';
      setSubtitleDebugRows((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          subtitle,
          agentReply,
          at: new Date().toLocaleTimeString(),
          status: 'ok' as const,
        },
        ...prev,
      ].slice(0, 20));
      setSubtitleInput('');
    } catch (error) {
      setSubtitleDebugRows((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          subtitle,
          agentReply: `Error: ${error instanceof Error ? error.message : String(error)}`,
          at: new Date().toLocaleTimeString(),
          status: 'error' as const,
        },
        ...prev,
      ].slice(0, 20));
    } finally {
      setIsSendingSubtitle(false);
    }
  };

  /** TODO: connect STT (Speech-to-Text) using `audioBuffer` when mic PCM is wired. */
  function handleUserSpeech(audioBuffer: ArrayBuffer | null, transcript?: string) {
    void audioBuffer;
    const fakeText = transcript?.trim() || 'User speech placeholder';
    setConversation((prev) => {
      const next: ConversationTurn[] = [
        ...prev,
        { role: 'user', text: fakeText, timestamp: Date.now() },
      ];
      // TODO: future pipeline — import { generateAIResponse } from '../lib/conversationPipeline'
      // const reply = await generateAIResponse(next);
      // then feed `reply` into the avatar speak path (needs ref / imperative API from parent).
      return next;
    });
  }

  function handleAssistantResponse(text: string) {
    const t = text.trim() || 'Assistant response placeholder';
    setConversation((prev) => [...prev, { role: 'assistant', text: t, timestamp: Date.now() }]);
  }

  useEffect(() => {
    console.log('Conversation:', conversation);
  }, [conversation]);

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
          <div className="min-h-12 px-5 py-2.5 border-b border-white/10 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">数字人陪伴</p>
              <p className="text-xs text-white/35">SpatialReal 数字人</p>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-medium text-white/40 shrink-0">Avatar</span>
                <select
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                  aria-label="Choose avatar"
                  className={cn(
                    'h-8 min-w-0 flex-1 max-w-[220px] rounded-xl px-3 text-xs',
                    'bg-white/[0.03] backdrop-blur-xl border border-white/10',
                    'text-white/80 hover:text-white',
                    'outline-none focus-visible:border-white/25 cursor-pointer',
                    'appearance-none bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat',
                    'pr-8',
                  )}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.45)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  }}
                >
                  {AVATAR_SELECTOR_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-neutral-900 text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-white/35 leading-snug">
                Voice: {currentVoice.label}
              </p>
            </div>
            <Bot className="w-5 h-5 text-brand-purple shrink-0 mt-0.5" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={avatarId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="flex flex-col items-center w-full"
              >
                <SpatialRealAvatar
                  avatarId={avatarId}
                  voiceProfile={currentVoice}
                  avatarWidth={300}
                  avatarHeight={400}
                  onUserSpeechCaptured={(p) => handleUserSpeech(p.audioBuffer, p.transcript)}
                  onAssistantUtterance={(p) => handleAssistantResponse(p.text)}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="px-4 py-3 border-t border-white/10 w-full text-left shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Conversation</p>
            <div className="space-y-1.5 text-xs text-white/35">
              {conversation.slice(-3).map((turn, i) => (
                <p key={`${turn.timestamp}-${i}`} className="leading-snug line-clamp-2">
                  <span className="text-white/45">{turn.role === 'user' ? 'User' : 'AI'}:</span>{' '}
                  {turn.text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sr-only" aria-hidden="true">
        <div id={modelMountId} />
      </div>

      <div className="glass-dark rounded-[2rem] border border-white/10 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">Temporary Debug Panel</p>
            <p className="text-xs text-white/45">Test whether subtitle events reach the agent and inspect replies.</p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-white/35">/api/pipeline/react</span>
        </div>

        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            value={subtitleInput}
            onChange={(event) => setSubtitleInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void sendSubtitleToAgent();
            }}
            placeholder="Paste one subtitle line here, then send to agent..."
            className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm focus:outline-none focus:border-brand-purple"
          />
          <button
            onClick={() => void sendSubtitleToAgent()}
            disabled={isSendingSubtitle || !subtitleInput.trim()}
            className="h-11 px-4 rounded-xl bg-brand-purple text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSendingSubtitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send subtitle event
          </button>
        </div>

        <div className="mt-3 max-h-72 overflow-auto space-y-2">
          {subtitleDebugRows.length === 0 ? (
            <p className="text-xs text-white/35">No test events yet. Send one subtitle line to verify the agent reaction path.</p>
          ) : subtitleDebugRows.map((row) => (
            <div
              key={row.id}
              className={cn(
                'rounded-xl border p-3 text-xs',
                row.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
              )}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45 mb-1">
                <span>{row.status === 'ok' ? 'Agent reply' : 'Agent error'}</span>
                <span>{row.at}</span>
              </div>
              <p className="text-white/80"><span className="text-white/45">Subtitle:</span> {row.subtitle}</p>
              <p className="mt-1 text-white"><span className="text-white/45">Response:</span> {row.agentReply}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
