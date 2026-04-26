import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Activity, Clock } from 'lucide-react';
import { GameContext } from '../hooks/useGameSimulation';
import { cn } from '../lib/utils';

interface LiveContextProps {
  gameState: GameContext;
}

export default function LiveContextPanel({ gameState }: LiveContextProps) {
  const isHighExcitement = gameState.excitement > 0.8;
  const isReplay = gameState.excitement > 0.9;

  return (
    <div className="glass p-6 rounded-3xl flex flex-col justify-center h-full relative overflow-hidden group">
      {/* Background glow for high excitement */}
      <AnimatePresence>
        {isHighExcitement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-purple z-0 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col h-full justify-between gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-blue" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">Context Match</span>
          </div>

          <AnimatePresence>
            {isReplay && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="px-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
              >
                <Clock className="w-3 h-3 text-yellow-500" />
                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Replay</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          key={gameState.lastPlay}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex items-center min-h-[3rem]"
        >
          <p className="text-base font-medium text-white/90 leading-relaxed border-l-2 border-brand-purple pl-4 py-1">
            "{gameState.lastPlay}"
          </p>
        </motion.div>

        <div className="space-y-2 mt-4">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/50">
            <span>Excitement Level</span>
            <span className={cn(
              isHighExcitement ? "text-brand-purple" : "text-white/70"
            )}>
              {Math.floor(gameState.excitement * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${gameState.excitement * 100}%` }}
              transition={{ type: 'spring', stiffness: 50 }}
              className={cn(
                "h-full rounded-full transition-colors duration-500",
                isHighExcitement ? "bg-gradient-to-r from-brand-blue to-brand-purple" : "bg-white/30"
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
