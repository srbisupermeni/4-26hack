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
  Loader2
} from 'lucide-react';
import { cn } from './lib/utils';

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, activeSport })
      });
      const data = await res.json();

      if (!res.ok || !data.text) throw new Error(data.error);

      const text = data.text;
      setMessages(prev => [...prev, { role: 'model', text }]);
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
  const [messages, setMessages] = useState<{ id: number, text: string, type: 'ai' | 'system' | 'user' }[]>([
    { id: 1, text: "VStandby is ready. Let's watch some games!", type: 'system' }
  ]);
  const [isLive, setIsLive] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const triggerAIInsight = async (customText?: string) => {
    if (customText) {
      setMessages(prev => [...prev, { id: Date.now(), text: customText, type: 'ai' }]);
      return;
    }

    try {
      const res = await fetch("/api/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSport })
      });
      const data = await res.json();

      if (!res.ok || !data.text) {
        throw new Error(data.error || "Failed to generate");
      }

      const text = data.text;
      setMessages(prev => [...prev, { id: Date.now(), text, type: 'ai' }]);
    } catch (err) {
      const fallbackReactions = [
        "That was a wild play!",
        "I think the momentum is shifting now.",
        "Next play is definitely going to be aggressive.",
        "Can't believe they missed that shot!",
        "This game is getting intense!"
      ];
      const randomText = fallbackReactions[Math.floor(Math.random() * fallbackReactions.length)];
      setMessages(prev => [...prev, { id: Date.now(), text: randomText, type: 'ai' }]);
    }
  };

  const sendChatMessage = async (userMessage: string) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSport, userMessage })
      });
      const data = await res.json();

      if (!res.ok || !data.text) throw new Error(data.error);

      const text = data.text;
      setMessages(prev => [...prev, { id: Date.now(), text, type: 'ai' }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), text: "I missed that, could you repeat?", type: 'ai' }]);
    }
  };

  const toggleLive = () => {
    setIsLive(!isLive);
    if (!isLive) {
      setMessages(prev => [...prev, { id: Date.now(), text: `Syncing with ${activeSport} live stream...`, type: 'system' }]);
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), text: `We're live! Let's go.`, type: 'system' }]);
        triggerAIInsight();
      }, 1500);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-generate reactions when live
  // Removed automatic recurring spam. Only replies on prompt.
  useEffect(() => {
    if (!isLive) return;
  }, [isLive, activeSport]);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        activeSport={activeSport}
      />

      {/* Sport Selector */}
      <div className="flex justify-center gap-4">
        {(['NBA', 'CS2', 'LOL'] as const).map((sport) => (
          <button
            key={sport}
            onClick={() => {
              setActiveSport(sport);
              setMessages([{ id: Date.now(), text: `Switched to ${sport}. Ready when you are!`, type: 'system' }]);
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
            {activeSport === 'LOL' && isLive ? (
              <iframe
                src="https://www.youtube.com/embed/FGXvNc-PmNE?autoplay=1&mute=0&loop=1&playlist=FGXvNc-PmNE&controls=1&modestbranding=1"
                className="w-full h-[120%] object-cover"
                allow="autoplay; encrypted-media"
                title="LOL Game Feed"
              />
            ) : (
              <img
                src={`https://picsum.photos/seed/${activeSport.toLowerCase()}/1200/800?grayscale`}
                alt="Game Feed"
                className="w-full h-full object-cover opacity-50"
                referrerPolicy="no-referrer"
              />
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
                {isLive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="glass p-4 rounded-2xl border-brand-purple/50 max-w-md shadow-2xl shadow-brand-purple/20 pointer-events-auto"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-brand-purple" />
                      <span className="text-[10px] font-bold uppercase text-brand-purple">AI Reaction</span>
                    </div>
                    <p className="text-sm font-medium">{messages.filter(m => m.type === 'ai').slice(-1)[0]?.text}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Controls Overlay (Visible when not live) */}
          {!isLive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
              <button
                onClick={toggleLive}
                className="group flex flex-col items-center gap-4"
              >
                <div className="w-20 h-20 rounded-full bg-brand-purple flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl shadow-brand-purple/40">
                  <Play className="w-8 h-8 fill-current" />
                </div>
                <span className="text-xl font-bold tracking-tight">Start Watching Together</span>
              </button>
            </div>
          )}

          {/* Live Interaction Buttons */}
          {isLive && (
            <div className="absolute bottom-6 left-6 flex gap-2 z-20">
              <button
                onClick={toggleLive}
                className="glass px-4 py-2 rounded-xl text-[10px] font-bold uppercase text-red-400 hover:bg-red-500/10 transition-colors pointer-events-auto"
              >
                Stop Watching
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Chat Interface */}
        <div className="w-full md:w-1/3 flex flex-col bg-black/20">
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-purple/20 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-brand-purple" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-widest">Companion Chat</h4>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 scroll-smooth bg-black/10">
            {messages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex flex-col",
                msg.type === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "p-3 rounded-xl text-xs leading-relaxed max-w-[90%]",
                  msg.type === 'ai' ? "bg-brand-purple/10 border border-brand-purple/20 text-white" :
                    msg.type === 'system' ? "text-white/30 italic text-[10px]" : "bg-white/5 border border-white/10"
                )}>
                  {msg.type === 'ai' && <div className="text-[8px] font-bold text-brand-purple uppercase mb-1">Companion</div>}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/5">
            <div className="relative flex gap-2">
              <input
                type="text"
                placeholder="Talk to your companion..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs focus:outline-none focus:border-brand-purple transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    const text = e.currentTarget.value;
                    setMessages(prev => [...prev, { id: Date.now(), text, type: 'user' }]);
                    e.currentTarget.value = '';
                    setTimeout(() => {
                      sendChatMessage(text);
                    }, 500);
                  }
                }}
              />
              <button className="p-3 rounded-xl bg-brand-purple text-white hover:scale-105 transition-transform">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
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

export default function App() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [activeSport, setActiveSport] = useState('NBA');

  return (
    <div className="min-h-screen selection:bg-brand-purple/30">
      <Navbar />
      <ChatModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        activeSport={activeSport}
      />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-glow opacity-50 pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full glass text-xs font-bold tracking-widest uppercase text-brand-purple mb-6">
              The Future of Sports Watching
            </span>
            <h1 className="text-5xl md:text-8xl font-bold tracking-tighter mb-8 leading-[0.9] text-gradient">
              Your AI Companion <br /> For Every Game
            </h1>
            <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
              Watch games together with your AI. Get live reactions, insights, and predictions in real-time. <br className="hidden md:block" />
              Never watch alone again.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setIsDemoModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-brand-purple text-white font-bold hover:scale-105 transition-transform shadow-xl shadow-brand-purple/20"
              >
                Start Watching Together
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-full glass text-white font-bold hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                See How It Works
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="mt-20 relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-b from-brand-purple/20 to-transparent blur-3xl opacity-30" />
            <div className="relative glass-dark rounded-[2rem] p-4 border border-white/10 shadow-2xl animate-float">
              <img
                src="https://picsum.photos/seed/esports/1200/600?blur=2"
                alt="Overlay Mockup"
                className="w-full h-auto rounded-2xl opacity-40"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="glass p-6 rounded-3xl max-w-md text-left border-brand-purple/30">
                  <div className="flex items-center gap-3 mb-4">
                    <Activity className="w-5 h-5 text-brand-purple" />
                    <span className="text-xs font-bold uppercase tracking-widest">Live Overlay Active</span>
                  </div>
                  <p className="text-sm text-white/80 mb-4">"Analyzing Lakers vs Warriors. LeBron's efficiency in the paint is 12% higher than season average today."</p>
                  <div className="flex gap-2">
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">BUY SIGNAL</div>
                    <div className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-[10px] font-bold">PREDICTION: WIN</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-black/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Intelligence in Every Frame</h2>
            <p className="text-white/50 max-w-xl mx-auto">Our neural engine processes thousands of data points per second to give you the edge.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={MessageSquare}
              title="Live Reactions"
              description="Your AI friend reacts to every play, bad call, and miracle shot just like you do."
              delay={0.1}
            />
            <FeatureCard
              icon={Brain}
              title="Smart Predictions"
              description="Know what's coming next. From pick-and-rolls to site executes, your companion sees it all."
              delay={0.2}
            />
            <FeatureCard
              icon={Zap}
              title="Instant Insights"
              description="No heavy data, just the stuff that matters. Simple, conversational context for every moment."
              delay={0.3}
            />
            <FeatureCard
              icon={Globe}
              title="Watch Together"
              description="Connect your favorite stream and never watch a game alone again. It's like a watch party in your pocket."
              delay={0.4}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Game Momentum"
              description="Feel the shift in the game. Your AI tracks the 'vibe' and tells you when the tide is turning."
              delay={0.5}
            />
            <FeatureCard
              icon={Shield}
              title="Always By Your Side"
              description="A companion that learns your favorite teams and players to provide a personalized experience."
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="product" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-glow opacity-20 pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Experience the Overlay</h2>
            <p className="text-white/50 max-w-xl mx-auto">Interact with our simulated live feed to see VStandby in action.</p>
          </div>

          <InteractiveDemo />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">How It Works</h2>
            <p className="text-white/50 max-w-xl mx-auto">Three simple steps to never watch a game alone again.</p>
          </div>
          <HowItWorksInteractive />
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-24 px-6 bg-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-16 text-center tracking-tight">Built for Every Fan</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Sports Fans", icon: Globe },
              { label: "Fantasy Players", icon: Target },
              { label: "Esports Viewers", icon: Cpu },
              { label: "Sports Investors", icon: TrendingUp }
            ].map((item, idx) => (
              <div key={idx} className="glass p-8 rounded-3xl text-center hover:bg-white/10 transition-colors cursor-default">
                <item.icon className="w-8 h-8 mx-auto mb-4 text-brand-purple" />
                <span className="font-bold text-sm uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision Section */}
      <section id="vision" className="py-32 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tighter">The Future of Intelligence</h2>
            <p className="text-xl text-white/60 leading-relaxed mb-12">
              We are building the future of sports intelligence — where every fan has access to elite-level analysis in real time. Our mission is to democratize data and empower viewers with the same tools used by professional analysts.
            </p>
            <div className="w-20 h-1 bg-brand-purple mx-auto rounded-full" />
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto glass-dark rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden border border-white/10">
          <div className="absolute inset-0 bg-glow opacity-30 pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-7xl font-bold mb-8 tracking-tighter leading-none">Never Watch <br /> Blind Again</h2>
            <p className="text-lg text-white/50 mb-12 max-w-xl mx-auto">Join the waitlist for early access to the VStandby Studio private beta.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full sm:w-80 h-14 rounded-full bg-white/5 border border-white/10 px-6 focus:outline-none focus:border-brand-purple transition-colors"
              />
              <button className="w-full sm:w-auto h-14 px-10 rounded-full bg-white text-black font-bold hover:bg-white/90 transition-colors">
                Join Waitlist
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-purple" />
            <span className="text-lg font-bold tracking-tighter">VStandby <span className="text-brand-purple">Studio</span></span>
          </div>
          <div className="flex gap-8 text-sm text-white/40">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">Discord</a>
          </div>
          <p className="text-xs text-white/20">© 2026 VStandby Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
