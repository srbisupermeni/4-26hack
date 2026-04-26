import React, {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * Chibi lightbulb NBA-fan mascot avatar.
 *
 * Character design (requested by product):
 * - Overall silhouette is "lightbulb": a big round head on a narrower tapered body.
 * - Big round cream-colored head, expressive eyes.
 * - Small NBA orange headband across the forehead (team flair).
 * - Blue NBA jersey body (#1D428A) with white collar + jersey number.
 *
 * Behavior (Phase 1 + Phase 2 premium features, all pure SVG / Tailwind):
 *   1. Mouth opens/closes driven by the live AnalyserNode RMS — lip-sync to TTS.
 *   2. Eyes blink on a slow random cadence (~3–6s) when idle.
 *   3. Eyes track the user's mouse so the mascot "looks at" the viewer.
 *   4. `excitement` prop (0..1) boosts eye sparkle, cheek blush, and bounce
 *      so the mascot visibly gets hyped during big plays.
 *   5. Small floating basketball particles drift up when speaking.
 *   6. Optional `variant='3d'` lazy-loads a Three.js / VRM avatar for users
 *      who want the premium look. Falls back to 2D if the 3D module fails.
 *
 * Public API is backwards compatible: `{ isSpeaking, analyser, className, variant }`
 * still works. `variant='mascot'` is aliased to `'2d'` for old callers.
 */

// Lazy-load the premium 3D avatar. We go through an indirection (variable path
// + /* @vite-ignore */) so Vite does NOT try to bundle AIAvatar3D.tsx at build
// time — it depends on @react-three/fiber, @react-three/drei, and
// @pixiv/three-vrm, which aren't in package.json yet. When someone flips
// variant='3d' we attempt the import at runtime; if the module or its deps
// don't resolve, the .catch falls back to a no-op component and the 2D orb
// keeps rendering.
const AIAvatar3D = lazy(async () => {
  try {
    const path = './AIAvatar3D';
    const mod = (await import(/* @vite-ignore */ path)) as {
      default: React.ComponentType<{
        isSpeaking: boolean;
        analyser: AnalyserNode | null;
        excitement?: number;
        persona?: string;
      }>;
    };
    return mod;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { default: (() => null) as React.ComponentType<any> };
  }
});

export type AvatarVariant = '2d' | '3d' | 'image' | 'mascot';

interface AIAvatarOrbProps {
  isSpeaking: boolean;
  analyser: AnalyserNode | null;
  className?: string;
  /** Visual style. 'mascot' is a legacy alias for '2d'. */
  variant?: AvatarVariant;
  /** 0..1 — excitement level from game state; drives expression intensity. */
  excitement?: number;
  /** Persona key ('analyst' | 'trash_talker' | 'emotional') — subtle color tint. */
  persona?: string;
}

export function AIAvatarOrb({
  isSpeaking,
  analyser,
  className,
  variant = '2d',
  excitement = 0,
  persona = 'analyst',
}: AIAvatarOrbProps) {
  // Normalize the deprecated 'mascot' value.
  const resolvedVariant: AvatarVariant =
    variant === 'mascot' ? '2d' : variant;

  // 0..1 amplitude driving the mouth opening size.
  const [mouthAmp, setMouthAmp] = useState(0);
  // Blink state: brief closed-eye frames on a random cadence.
  const [isBlinking, setIsBlinking] = useState(false);
  // Normalized mouse position relative to the avatar center, each axis in [-1, 1].
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const rafRef = useRef<number | null>(null);
  const smoothedAmpRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // Analyser → mouth amplitude loop.
  // Reads time-domain data, computes RMS, smooths it, pushes to state ~30fps.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!analyser || !isSpeaking) {
      setMouthAmp(0);
      smoothedAmpRef.current = 0;
      return;
    }

    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const target = Math.min(1, rms * 3.2);
      smoothedAmpRef.current =
        smoothedAmpRef.current * 0.55 + target * 0.45;
      setMouthAmp(smoothedAmpRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [analyser, isSpeaking]);

  // ---------------------------------------------------------------------------
  // Random blink cadence.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 3000;
      setTimeout(() => {
        if (cancelled) return;
        setIsBlinking(true);
        setTimeout(() => {
          if (cancelled) return;
          setIsBlinking(false);
          scheduleBlink();
        }, 120);
      }, delay);
    };
    scheduleBlink();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Mouse tracking — offset pupils toward the cursor.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (resolvedVariant !== '2d') return;
    const handler = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      // Clamp to a soft circle of radius 320px so the eyes never snap too far.
      const r = 320;
      const nx = Math.max(-1, Math.min(1, dx / r));
      const ny = Math.max(-1, Math.min(1, dy / r));
      setGaze({ x: nx, y: ny });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [resolvedVariant]);

  // Mouth geometry: at rest a small smile, when speaking an ellipse that opens.
  const mouthOpen = isSpeaking ? mouthAmp : 0;
  const mouthHeight = 1.2 + mouthOpen * 6;

  // Persona → subtle accent color for the headband + glow. Jersey stays NBA blue.
  const accentColor =
    persona === 'trash_talker'
      ? '#FF2D55' // aggressive red
      : persona === 'emotional'
        ? '#FFB400' // warm gold
        : '#FF6B1A'; // NBA orange (analyst / default)

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col items-center justify-center',
        className,
      )}
    >
      {/* Outer accent glow (keyed to persona) */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1, 1.3, 1] : 1,
          opacity: isSpeaking ? [0.45, 0.8, 0.45] : 0.14,
        }}
        transition={{
          duration: 1.4,
          repeat: isSpeaking ? Infinity : 0,
          ease: 'easeInOut',
        }}
        style={{ backgroundColor: accentColor }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-28 rounded-full blur-2xl z-0 pointer-events-none opacity-40"
      />

      {/* NBA-blue glow behind the body */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1.15, 0.95, 1.15] : 1,
          opacity: isSpeaking ? 0.4 : 0,
        }}
        transition={{
          duration: 1.4,
          repeat: isSpeaking ? Infinity : 0,
          ease: 'easeInOut',
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-32 bg-[#1D428A] rounded-full blur-3xl z-0 pointer-events-none"
      />

      {/* Floating basketball particles (speaking only) */}
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none z-20">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, x: 0 }}
              animate={{
                opacity: [0, 1, 0],
                y: [-4, -44, -80],
                x: [0, i === 0 ? -18 : i === 1 ? 6 : 22, i === 0 ? -28 : i === 1 ? 10 : 32],
                rotate: [0, 360],
              }}
              transition={{
                duration: 2.2,
                delay: i * 0.55,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 w-3 h-3"
            >
              <svg viewBox="0 0 10 10" className="w-full h-full">
                <circle cx="5" cy="5" r="4.6" fill="#FF6B1A" />
                <path
                  d="M0.5 5 Q 5 5.5 9.5 5 M 5 0.5 Q 5.5 5 5 9.5"
                  stroke="#1a0600"
                  strokeWidth="0.5"
                  fill="none"
                />
              </svg>
            </motion.div>
          ))}
        </div>
      )}

      {/* Mascot shell — lightbulb silhouette container (taller than wide). */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1, 1.06, 1] : 1,
          boxShadow: isSpeaking
            ? [
                `0 0 20px ${accentColor}55`,
                `0 0 42px ${accentColor}cc`,
                `0 0 20px ${accentColor}55`,
              ]
            : `0 0 0 ${accentColor}00`,
        }}
        transition={{
          duration: 0.9,
          repeat: isSpeaking ? Infinity : 0,
          ease: 'easeInOut',
        }}
        style={{ borderColor: `${accentColor}66` }}
        className="relative w-24 h-28 rounded-[44%] flex items-center justify-center overflow-hidden z-10 bg-gradient-to-b from-[#1a0f08] to-[#0a1428] border"
      >
        {resolvedVariant === 'image' ? (
          <img
            src="/avatar.png"
            alt="AI Avatar"
            className={cn(
              'w-full h-full object-cover absolute inset-0 transition-all duration-300',
              isSpeaking ? 'opacity-100 scale-105' : 'opacity-80 scale-100',
            )}
          />
        ) : resolvedVariant === '3d' ? (
          <Suspense
            fallback={
              <ChibiLightbulb
                mouthOpen={mouthOpen}
                mouthHeight={mouthHeight}
                isBlinking={isBlinking}
                isSpeaking={isSpeaking}
                gazeX={gaze.x}
                gazeY={gaze.y}
                excitement={excitement}
                accentColor={accentColor}
              />
            }
          >
            <AIAvatar3D
              isSpeaking={isSpeaking}
              analyser={analyser}
              excitement={excitement}
              persona={persona}
            />
          </Suspense>
        ) : (
          <ChibiLightbulb
            mouthOpen={mouthOpen}
            mouthHeight={mouthHeight}
            isBlinking={isBlinking}
            isSpeaking={isSpeaking}
            gazeX={gaze.x}
            gazeY={gaze.y}
            excitement={excitement}
            accentColor={accentColor}
          />
        )}
      </motion.div>

      <div
        className={cn(
          'mt-3 text-[8px] font-bold tracking-widest uppercase transition-opacity duration-300',
          isSpeaking ? 'opacity-100 animate-pulse' : 'opacity-0',
        )}
        style={{ color: accentColor }}
      >
        Courtside Companion
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chibi lightbulb NBA-fan mascot (inline SVG).
// -----------------------------------------------------------------------------

interface ChibiLightbulbProps {
  mouthOpen: number;     // 0..1 current amplitude
  mouthHeight: number;   // precomputed ellipse ry in a 112-viewbox
  isBlinking: boolean;
  isSpeaking: boolean;
  /** -1..1 mouse gaze offsets */
  gazeX: number;
  gazeY: number;
  /** 0..1 excitement from game state */
  excitement: number;
  /** Hex accent color (headband + cheeks when excited) */
  accentColor: string;
}

function ChibiLightbulb({
  mouthOpen,
  mouthHeight,
  isBlinking,
  isSpeaking,
  gazeX,
  gazeY,
  excitement,
  accentColor,
}: ChibiLightbulbProps) {
  // Pupil offsets (SVG units in a 96×112 viewBox). Max ±1.6 feels natural.
  const pupilDx = gazeX * 1.6;
  const pupilDy = gazeY * 1.2;

  // Excitement scales eye size and cheek opacity.
  const eyeScale = 1 + excitement * 0.12;
  const sparkleOpacity = 0.6 + excitement * 0.4;
  const cheekOpacity = 0.0 + excitement * 0.7;

  // Bounce gets more pronounced with excitement.
  const bounceAmount = isSpeaking ? 1.5 + excitement * 1.8 : 0.5;

  return (
    <motion.svg
      viewBox="0 0 96 112"
      className="w-full h-full absolute inset-0"
      animate={{
        rotate: isSpeaking ? [-2, 2, -2] : [-1, 1, -1],
        y: isSpeaking ? [0, -bounceAmount, 0] : [0, -0.5, 0],
      }}
      transition={{
        duration: isSpeaking ? Math.max(0.35, 0.65 - excitement * 0.25) : 3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <defs>
        {/* Skin tone — soft cream with subtle warm shading */}
        <radialGradient id="skin" cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFE6C9" />
          <stop offset="70%" stopColor="#F7CDA1" />
          <stop offset="100%" stopColor="#C98B5A" />
        </radialGradient>
        {/* NBA blue jersey with subtle vertical shading */}
        <linearGradient id="jersey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2B5BB5" />
          <stop offset="55%" stopColor="#1D428A" />
          <stop offset="100%" stopColor="#0E2757" />
        </linearGradient>
        {/* Head highlight */}
        <radialGradient id="headShine" cx="36%" cy="26%" r="22%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ---------- BODY (jersey, drawn first so head sits on top) ---------- */}
      {/* Jersey trapezoidal torso — tapered lightbulb bottom. */}
      <path
        d="
          M 30 70
          Q 28 66 30 64
          L 66 64
          Q 68 66 66 70
          L 74 104
          Q 74 108 70 108
          L 26 108
          Q 22 108 22 104
          Z
        "
        fill="url(#jersey)"
      />

      {/* Jersey collar (white V) */}
      <path
        d="M 38 64 L 48 74 L 58 64 Z"
        fill="#ffffff"
      />

      {/* Jersey number "23" — subtle, white */}
      <text
        x="48"
        y="94"
        textAnchor="middle"
        fontFamily="Impact, 'Arial Black', sans-serif"
        fontSize="14"
        fill="#ffffff"
        opacity="0.9"
      >
        23
      </text>

      {/* Tiny arms/shoulder nubs so the body reads as a person */}
      <ellipse cx="22" cy="74" rx="6" ry="5" fill="url(#skin)" />
      <ellipse cx="74" cy="74" rx="6" ry="5" fill="url(#skin)" />

      {/* ---------- HEAD ---------- */}
      {/* Big round head (cream skin) */}
      <circle cx="48" cy="40" r="30" fill="url(#skin)" />

      {/* Head specular highlight */}
      <circle cx="40" cy="30" r="12" fill="url(#headShine)" />

      {/* NBA headband */}
      <path
        d="
          M 20 32
          Q 48 22 76 32
          L 76 40
          Q 48 30 20 40
          Z
        "
        fill={accentColor}
      />
      {/* Headband logo dot */}
      <circle cx="48" cy="34" r="1.8" fill="#ffffff" />

      {/* Cheeks (visible when excited) */}
      <ellipse
        cx="32"
        cy="52"
        rx="4"
        ry="2.4"
        fill="#FF6B8A"
        opacity={cheekOpacity}
      />
      <ellipse
        cx="64"
        cy="52"
        rx="4"
        ry="2.4"
        fill="#FF6B8A"
        opacity={cheekOpacity}
      />

      {/* ---------- EYES ---------- */}
      {/* Eye whites (blink collapses ry). */}
      <ellipse
        cx="38"
        cy="46"
        rx={4.8 * eyeScale}
        ry={isBlinking ? 0.5 : 5.0 * eyeScale}
        fill="#ffffff"
        stroke="#1a1a1a"
        strokeWidth="0.8"
      />
      <ellipse
        cx="58"
        cy="46"
        rx={4.8 * eyeScale}
        ry={isBlinking ? 0.5 : 5.0 * eyeScale}
        fill="#ffffff"
        stroke="#1a1a1a"
        strokeWidth="0.8"
      />

      {/* Pupils follow cursor. Hidden while blinking. */}
      {!isBlinking && (
        <>
          <circle
            cx={38 + pupilDx}
            cy={46 + pupilDy}
            r={2.2 + excitement * 0.5}
            fill="#0a0a0a"
          />
          <circle
            cx={58 + pupilDx}
            cy={46 + pupilDy}
            r={2.2 + excitement * 0.5}
            fill="#0a0a0a"
          />
          {/* Sparkle highlights — brighten with excitement */}
          <circle
            cx={38.8 + pupilDx}
            cy={45.2 + pupilDy}
            r="0.75"
            fill="#ffffff"
            opacity={sparkleOpacity}
          />
          <circle
            cx={58.8 + pupilDx}
            cy={45.2 + pupilDy}
            r="0.75"
            fill="#ffffff"
            opacity={sparkleOpacity}
          />
        </>
      )}

      {/* Eyebrows — tilt up slightly with excitement */}
      <path
        d={`M 33 ${40 - excitement * 1.5} Q 38 ${38 - excitement * 1.8} 43 ${40 - excitement * 1.5}`}
        stroke="#3a2010"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M 53 ${40 - excitement * 1.5} Q 58 ${38 - excitement * 1.8} 63 ${40 - excitement * 1.5}`}
        stroke="#3a2010"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* ---------- MOUTH ---------- */}
      {isSpeaking ? (
        <g>
          <ellipse
            cx="48"
            cy="58"
            rx={3.6 + mouthOpen * 2.6}
            ry={mouthHeight}
            fill="#2a0a00"
          />
          {mouthOpen > 0.45 && (
            <ellipse
              cx="48"
              cy={58 + mouthHeight * 0.35}
              rx={2.2 + mouthOpen * 1.3}
              ry={Math.max(0.6, mouthHeight * 0.35)}
              fill="#c94830"
            />
          )}
        </g>
      ) : (
        <path
          d={
            excitement > 0.5
              ? 'M 42 56 Q 48 63 54 56' // wider smile when hyped
              : 'M 43 57 Q 48 60 53 57'
          }
          stroke="#2a0a00"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </motion.svg>
  );
}
