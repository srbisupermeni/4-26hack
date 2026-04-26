/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  BarChart3,
  MessageSquare,
  TrendingUp,
  Brain,
  ChevronRight,
  Play,
  Shield,
  Cpu,
  Globe,
  Menu,
  X,
  ArrowRight,
  Activity,
  Target,
  Send,
  Loader2,
  Volume2,
  VolumeX
} from 'lucide-react';
import { cn } from './lib/utils';
import { useGameSimulation } from './hooks/useGameSimulation';
import { useAICompanion } from './hooks/useAICompanion';
import { PetChatPanel } from './components/PetChatPanel';
import { PipelineBuilder } from './components/PipelineBuilder';
import { YouTubeLiveCompanionDemo } from './components/YouTubeLiveCompanionDemo';
import { requestPipelineReaction } from './lib/pipelineClient';

// --- Components ---

const ChatModal = ({ isOpen, onClose, activeSport }: { isOpen: boolean, onClose: () => void, activeSport: string }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const data = await requestPipelineReaction({
        triggerReason: 'user_message',
        userMessage,
        activeSport,
        persona: 'analyst',
        gameContext: {
          teams: `${activeSport} Demo`,
          score: 'Pre-game',
          clock: '00:00',
          lastPlay: 'Marketing chat opened from the hero section.',
          excitement: 0.4,
        },
        chatHistory: messages.map(msg => ({
          role: msg.role === 'model' ? 'ai' : 'user',
          content: msg.text,
        })),
      });

      if (!data.output?.text) throw new Error('Pipeline returned no text');

      setMessages(prev => [...prev, { role: 'model', text: data.output.text }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Whoops, I missed that play. What happened?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full h-full md:w-[90vw] md:h-[90vh] glass-dark md:rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-purple/20 flex items-center justify-center">
                  <Brain className="w-7 h-7 text-brand-purple" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Your AI Companion</h3>
                  <p className="text-xs text-brand-purple font-bold uppercase tracking-widest">Watching {activeSport} with you</p>
                </div>
              </div>
              <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="w-24 h-24 rounded-full bg-brand-purple/10 flex items-center justify-center animate-pulse">
                    <MessageSquare className="w-12 h-12 text-brand-purple" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold">Ready to watch together?</p>
                    <p className="text-sm max-w-xs mx-auto">Ask me about the game, players, or just share your reactions. I'm watching with you!</p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={cn(
                  "flex flex-col max-w-[70%]",
                  msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                )}>
                  <div className={cn(
                    "p-5 rounded-3xl text-base leading-relaxed shadow-xl",
                    msg.role === 'user' ? "bg-brand-purple text-white rounded-tr-none" : "bg-white/5 border border-white/10 text-white/90 rounded-tl-none"
                  )}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] mt-2 opacity-30 uppercase font-bold tracking-widest">
                    {msg.role === 'user' ? 'You' : 'Companion'}
                  </span>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-3 text-brand-purple text-sm font-bold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              )}
            </div>

            <div className="p-8 border-t border-white/5 bg-black/40">
              <div className="relative flex gap-4 max-w-4xl mx-auto">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={`"Did you see that play?" or "What's the prediction?"`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-5 px-8 text-lg focus:outline-none focus:border-brand-purple transition-colors shadow-inner"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="w-16 h-16 rounded-2xl bg-brand-purple flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-purple/20 disabled:opacity-50"
                >
                  <Send className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4",
      isScrolled ? "glass-dark py-3" : "bg-transparent"
    )}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-purple to-brand-blue rounded-lg flex items-center justify-center shadow-lg shadow-brand-purple/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tighter">VStandby <span className="text-brand-purple">Studio</span></span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {['Product', 'Features', 'How it Works', 'Vision'].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm font-medium text-white/70 hover:text-white transition-colors">
              {item}
            </a>
          ))}
          <button className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all">
            Join Waitlist
          </button>
        </div>

        <button className="md:hidden text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-full left-0 right-0 glass-dark p-6 flex flex-col gap-4 md:hidden border-t border-white/10"
          >
            {['Product', 'Features', 'How it Works', 'Vision'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-lg font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item}
              </a>
            ))}
            <button className="w-full py-3 rounded-xl bg-brand-purple text-white font-semibold">
              Join Waitlist
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const FeatureCard = ({ icon: Icon, title, description, delay = 0 }: { icon: any, title: string, description: string, delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay }}
    className="glass p-8 rounded-3xl hover:border-brand-purple/50 transition-all group relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="w-12 h-12 rounded-2xl bg-brand-purple/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
      <Icon className="w-6 h-6 text-brand-purple" />
    </div>
    <h3 className="text-xl font-bold mb-3">{title}</h3>
    <p className="text-white/60 leading-relaxed">{description}</p>
  </motion.div>
);

const InteractiveDemo = () => {
  const [activeSport, setActiveSport] = useState<'NBA' | 'CS2' | 'LOL'>('NBA');
  const { gameContext, mode, playback, loadHistoricalGame, loadLiveGame } = useGameSimulation(activeSport);
  // videoRef + local video URL must exist before useAICompanion so the hook
  // can wire its real-time perception loop to the playing <video> element.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const {
    messages,
    sendMessage,
    isTyping,
    isVoiceEnabled,
    setIsVoiceEnabled,
    isSpeaking,
    analyser,
    persona,
    setPersona,
    askGameSummary,
    stopSpeaking,
    analyzeVideo,
    syncVision,
    hasVisionData,
    loadDemoVisionMemory,
    isVisionLive,
  } = useAICompanion(gameContext, activeSport, {
    videoRef,
    // MVP: real-time vision only kicks in for user-uploaded videos (same-origin,
    // readable by canvas). Screen-share / HLS sources are added in later phases.
    enabled: !!localVideoUrl,
  });
  const [isLive, setIsLive] = useState(false);
  const [historicalGames, setHistoricalGames] = useState<any[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);

  useEffect(() => {
    fetch('/api/games/historical')
      .then(r => r.json())
      .then(d => {
        if (d.games) setHistoricalGames(d.games);
      })
      .catch(e => console.error("Games fetch error:", e))
      .finally(() => setIsLoadingGames(false));
  }, []);
  const [demoInput, setDemoInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Sync vision comments with video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      syncVision(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [syncVision]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create local preview
    const url = URL.createObjectURL(file);
    setLocalVideoUrl(url);
    setIsLive(true); // Switch to "Live" mode to show the video player

    setIsScanning(true);
    await analyzeVideo(file);
    setIsScanning(false);
  };

  const triggerAIInsight = async (customText?: string) => {
    // Left empty for now, or could manually trigger an AI prompt
  };

  const sendChatMessage = (text: string) => {
    sendMessage(text);
  };

  const toggleLive = () => {
    setIsLive(!isLive);
  };

  // Auto-generate reactions when live
  // Removed automatic recurring spam. Only replies on prompt.
  useEffect(() => {
    if (!isLive) return;
  }, [isLive, activeSport]);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
      {/* Sport Selector */}
      <div className="flex justify-center gap-4">
        {(['NBA', 'CS2', 'LOL'] as const).map((sport) => (
          <button
            key={sport}
            onClick={() => {
              setActiveSport(sport);
            }}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-bold transition-all border",
              activeSport === sport
                ? "bg-white text-black border-white"
                : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
            )}
          >
            {sport}
          </button>
        ))}
      </div>

      <div className="glass-dark rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl flex flex-col md:flex-row h-[600px]">
        {/* Left Panel: Live Feed */}
        <div className="w-full md:w-2/3 relative bg-black/40 border-r border-white/5">
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            {(isLive && gameContext.videoUrl) || localVideoUrl ? (
              <video
                ref={videoRef}
                key={localVideoUrl || gameContext.videoUrl}
                src={localVideoUrl || gameContext.videoUrl || undefined}
                className="w-full h-full object-cover"
                autoPlay
                controls={!!localVideoUrl}
                loop={!localVideoUrl}
                muted={!localVideoUrl}
                playsInline
              />
            ) : (
               <iframe
                width="100%"
                height="100%"
                src={activeSport === 'LOL' 
                  ? "https://www.youtube.com/embed/FGXvNc-PmNE?autoplay=1&mute=1&loop=1&playlist=FGXvNc-PmNE"
                  : "https://www.youtube.com/embed/g3w9bhGTlww?autoplay=1&mute=1"}
                title={activeSport === 'LOL' ? "LOL Demo Video" : "NBA Demo Video"}
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{ border: 0 }}
              ></iframe>
            )}
            {activeSport !== 'LOL' && <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />}
          </div>

          {/* Overlay UI */}
          <div className="absolute inset-0 p-8 flex flex-col justify-between pointer-events-none">
            <div className="flex justify-between items-start">
              <div className="glass px-4 py-2 rounded-xl flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", isLive ? "bg-red-500 animate-pulse" : "bg-white/20")} />
                <span className="text-[10px] font-bold tracking-widest uppercase">{isLive ? "Watching Together" : "Ready to Watch"}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <AnimatePresence mode="wait">
                {isLive && activeSport !== 'LOL' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="glass p-4 rounded-2xl border-brand-purple/50 max-w-md shadow-2xl shadow-brand-purple/20 pointer-events-auto"
                  >
                    <div className="flex items-center gap-2 mb-2">
                       <Zap className="w-4 h-4 text-brand-purple" />
                       <span className="text-[10px] font-bold uppercase text-brand-purple">Game Context Active</span>
                     </div>
                     <div className="flex flex-col gap-1 text-sm font-medium">
                       <span>Teams: {gameContext.teams}</span>
                       <span>Score: {gameContext.score}</span>
                       <span>Clock: {gameContext.clock}</span>
                       <span className="mt-2 text-white/70 text-xs italic">"{gameContext.lastPlay}"</span>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Controls Overlay (Visible when not live/historical) */}
          {!isLive && mode !== 'historical' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-8">
               {activeSport === 'NBA' && (
                 <>
                   <h3 className="text-2xl font-bold mb-8">Classic Game Simulator</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
                      {isLoadingGames ? (
                        <div className="col-span-2 flex flex-col items-center gap-2 text-white/40 italic">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          Loading classic games...
                        </div>
                      ) : historicalGames.length > 0 ? (
                        historicalGames.map(game => (
                          <button
                            key={game.id}
                            onClick={() => {
                              setIsLive(true);
                              loadHistoricalGame(game.id, game);
                            }}
                            className="glass p-6 text-left rounded-2xl border-white/10 hover:border-brand-purple/50 transition-colors group"
                          >
                            <div className="text-brand-purple text-xs font-bold mb-2">{game.date}</div>
                            <h4 className="text-xl font-bold mb-2 group-hover:text-brand-purple transition-colors">{game.title}</h4>
                            <p className="text-sm text-white/50">{game.desc}</p>
                          </button>
                        ))
                      ) : (
                        <div className="col-span-2 text-center text-white/30">
                          No classic games found. Is the backend running?
                        </div>
                      )}
                   </div>
                   <div className="mt-8 flex items-center gap-4">
                     <div className="h-px bg-white/20 w-12" />
                     <span className="text-xs font-bold text-white/40 uppercase tracking-widest">OR</span>
                     <div className="h-px bg-white/20 w-12" />
                   </div>
                 </>
               )}
               <button
                onClick={() => {
                   setIsLive(true);
                   loadLiveGame();
                }}
                className="mt-8 group flex items-center gap-3 glass px-6 py-3 rounded-full hover:bg-white/10 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold tracking-tight">Connect to Live Broadcast</span>
              </button>
            </div>
          )}

          {/* Vision Scan Button */}
          <div className="absolute top-6 right-6 z-30 flex flex-col gap-2 pointer-events-none">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="video/*" 
              onChange={handleFileSelect}
            />
            {activeSport !== 'LOL' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className={cn(
                  "glass px-4 py-2 rounded-xl pointer-events-auto flex items-center gap-2 transition-all hover:scale-105 active:scale-95",
                  isScanning ? "border-brand-purple animate-pulse cursor-wait" : "border-white/10 hover:border-brand-purple/50"
                )}
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 text-brand-purple animate-spin" />
                ) : (
                  <Cpu className="w-4 h-4 text-brand-purple" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest text-white">
                  {isScanning ? "AI is Watching..." : "Scan Video with Vision"}
                </span>
              </button>
            )}

            {!hasVisionData && !isLive && (
              <button
                onClick={loadDemoVisionMemory}
                className="glass px-4 py-2 rounded-xl pointer-events-auto flex items-center gap-2 border-brand-purple/30 hover:border-brand-purple transition-all text-brand-purple group"
              >
                <Brain className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Load Demo Memory
                </span>
              </button>
            )}
            
            {hasVisionData && (
              <div className="glass px-3 py-1.5 rounded-lg border-emerald-500/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-bold uppercase text-emerald-500">Vision Analysis Synced</span>
              </div>
            )}

            {isVisionLive && (
              <div className="glass px-3 py-1.5 rounded-lg border-brand-purple/40 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-500 pointer-events-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-pulse" />
                <span className="text-[9px] font-bold uppercase text-brand-purple">AI Watching Live</span>
              </div>
            )}
          </div>

          {/* Live Interaction Buttons */}
          {isLive && (
            <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-4 z-20 pointer-events-none">
              
              {/* Historical Playback Controls */}
              {mode === 'historical' && playback.timeline && (
                 <div className="glass p-4 rounded-2xl pointer-events-auto border-brand-purple/30 flex flex-col gap-3 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-bold text-brand-purple uppercase tracking-widest">Historical Replay Active</span>
                       <div className="flex gap-2">
                           {[1, 2, 5, 10].map(speed => (
                               <button 
                                 key={speed} 
                                 onClick={() => playback.setPlaybackSpeed(speed)}
                                 className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", playback.playbackSpeed === speed ? "bg-brand-purple text-white border-brand-purple" : "bg-black/20 text-white/50 border-white/10 hover:bg-white/10")}
                               >
                                 {speed}x
                               </button>
                           ))}
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                       <button onClick={() => playback.setIsPlaying(!playback.isPlaying)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-brand-purple/30 transition-colors">
                          <Play className={cn("w-3 h-3 fill-current", playback.isPlaying ? "animate-pulse text-brand-purple" : "text-white")} />
                       </button>
                       <input 
                         type="range" 
                         min="0" 
                         max={(playback.timeline.length || 1) - 1} 
                         value={playback.currentIndex}
                         onChange={(e) => playback.scrubTo(parseInt(e.target.value))}
                         className="flex-1 accent-brand-purple"
                       />
                       <span className="text-[10px] font-mono text-white/50">
                         EVENT {playback.currentIndex + 1}/{playback.timeline.length}
                       </span>
                    </div>

                    <button 
                       onClick={() => askGameSummary(playback.meta, playback.timeline)}
                       className="mt-1 w-full py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      Ask AI For Final Summary
                    </button>
                 </div>
              )}

              <div className="flex gap-2 pointer-events-auto items-end">
                <button
                  onClick={() => setIsLive(false)}
                  className="glass px-4 py-2 rounded-xl text-[10px] font-bold uppercase text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Stop Watching
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Pet Chat Interface */}
        <PetChatPanel
          messages={messages}
          isTyping={isTyping}
          isSpeaking={isSpeaking}
          isVoiceEnabled={isVoiceEnabled}
          setIsVoiceEnabled={setIsVoiceEnabled}
          stopSpeaking={stopSpeaking}
          persona={persona}
          setPersona={setPersona}
          inputValue={demoInput}
          onInputChange={setDemoInput}
          onSend={(text) => { sendChatMessage(text); setDemoInput(''); }}
          analyser={analyser}
          excitement={gameContext?.excitement ?? 0}
        />
      </div>
    </div>
  );
};

const HowItWorksInteractive = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "Connect Your Stream",
      desc: "Simply link your favorite sports or esports live stream. Our AI companion syncs instantly to watch with you.",
      icon: Globe,
      demo: (
        <div className="flex flex-col items-center gap-6">
          <div className="flex gap-4">
            {['Twitch', 'YouTube', 'ESPN', 'Steam'].map(p => (
              <div key={p} className="w-16 h-16 rounded-2xl glass flex items-center justify-center hover:border-brand-purple transition-all cursor-pointer">
                <span className="text-[10px] font-bold">{p}</span>
              </div>
            ))}
          </div>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-brand-purple to-transparent" />
          <div className="text-xs text-white/40">Select a platform to begin sync</div>
        </div>
      )
    },
    {
      title: "Meet Your Companion",
      desc: "Your AI friend isn't just a bot—it's a smart watcher that understands the game's context, players, and history.",
      icon: Brain,
      demo: (
        <div className="relative w-full h-40 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border border-brand-purple/30 animate-ping" />
            <div className="w-24 h-24 rounded-full border border-brand-purple/50 animate-pulse" />
          </div>
          <Brain className="w-12 h-12 text-brand-purple relative z-10" />
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-10">
            <div className="text-[8px] uppercase tracking-widest text-white/30">Watching Together</div>
            <div className="text-[8px] uppercase tracking-widest text-white/30">Latency: Minimal</div>
          </div>
        </div>
      )
    },
    {
      title: "Watch & React",
      desc: "Get live reactions, ask questions, and see predictions. It's like having your smartest friend on the couch with you.",
      icon: MessageSquare,
      demo: (
        <div className="glass p-6 rounded-2xl border-brand-purple/50 animate-float">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-brand-purple" />
            <span className="text-[10px] font-bold text-brand-purple uppercase">Live Reaction</span>
          </div>
          <p className="text-sm font-bold">"Incredible shot! That momentum shift is huge for the home team."</p>
          <div className="mt-4 flex gap-2">
            <div className="h-1 flex-1 bg-brand-purple rounded-full" />
            <div className="h-1 flex-1 bg-white/10 rounded-full" />
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
      <div className="space-y-8">
        {steps.map((step, idx) => (
          <div
            key={idx}
            onClick={() => setActiveStep(idx)}
            className={cn(
              "p-6 rounded-[2rem] transition-all cursor-pointer border",
              activeStep === idx
                ? "glass border-brand-purple/50 bg-brand-purple/5"
                : "border-transparent hover:bg-white/5"
            )}
          >
            <div className="flex gap-6">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                activeStep === idx ? "bg-brand-purple text-white" : "bg-white/5 text-white/40"
              )}>
                <step.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative h-[400px] glass-dark rounded-[3rem] border border-white/10 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-glow opacity-20" />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="w-full max-w-xs"
          >
            {steps[activeStep].demo}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

const WorkerFlowPage = () => (
  <div className="min-h-screen selection:bg-brand-purple/30 px-6 py-8">
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="glass-dark rounded-[2rem] border border-white/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">内部工作人员页面</p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mt-2">模型流程编辑器</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/50 leading-relaxed">
            用来给团队配置输入端大模型、结构化上下文、输出端大模型和数字人服务的内部流程图。
            这个页面和面向客户的 VStandby Studio 首页是分开的。
          </p>
        </div>
        <a
          href="/"
          className="self-start md:self-center glass px-5 py-3 rounded-full text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          返回客户页
        </a>
      </header>

      <PipelineBuilder />
    </div>
  </div>
);

export default function App() {
  const isWorkerFlow =
    typeof window !== 'undefined' &&
    ['/BETA2026_workflow', '/worker-flow', '/flow-builder', '/internal-flow'].includes(window.location.pathname);

  if (isWorkerFlow) {
    return <WorkerFlowPage />;
  }

  return (
    <main className="min-h-screen bg-white px-4 py-4 selection:bg-brand-purple/30">
      <YouTubeLiveCompanionDemo />
    </main>
  );
}
