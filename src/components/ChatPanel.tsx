import React, { useState, useRef, useEffect } from 'react';
import { Send, Brain, Loader2 } from 'lucide-react';
import { ChatMessage } from '../hooks/useAICompanion';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isTyping: boolean;
}

export default function ChatPanel({ messages, onSendMessage, isTyping }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="glass p-6 rounded-3xl flex flex-col h-full overflow-hidden border border-white/10 shadow-xl pointer-events-auto">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
        <div className="w-8 h-8 rounded-xl bg-brand-purple/20 flex items-center justify-center">
          <Brain className="w-4 h-4 text-brand-purple" />
        </div>
        <div>
          <h3 className="text-sm font-bold tracking-tight">AI Companion</h3>
          <p className="text-[10px] text-white/50 uppercase tracking-widest">Watching with you</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-brand-purple text-white rounded-tr-sm" 
                  : "bg-white/5 border border-white/10 text-white/90 rounded-tl-sm"
              )}>
                {msg.content}
              </div>
              <span className="text-[9px] mt-1 opacity-40 uppercase font-bold tracking-widest">
                {msg.role === 'user' ? 'You' : 'Companion'}
              </span>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mr-auto flex items-start max-w-[85%]"
            >
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 rounded-tl-sm flex items-center gap-2">
                <Loader2 className="w-3 h-3 text-brand-purple animate-spin" />
                <span className="text-xs text-white/50">Typing...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 relative">
        <div className="relative flex gap-2 w-full">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about the game..."
            className="flex-1 bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-brand-purple transition-colors shadow-inner w-full text-white/90 placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
            className="absolute right-1 top-1 bottom-1 w-10 rounded-lg bg-brand-purple/20 text-brand-purple hover:bg-brand-purple hover:text-white flex items-center justify-center transition-all disabled:opacity-50 disabled:hover:bg-brand-purple/20 disabled:hover:text-brand-purple"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
