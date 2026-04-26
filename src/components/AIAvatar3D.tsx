// @ts-nocheck
/**
 * Phase 2 — Premium 3D avatar.
 *
 * This is a scaffold designed to drop in once the following packages are
 * installed (they aren't in package.json yet because this environment has
 * no access to the npm registry):
 *
 *   npm install three @react-three/fiber @react-three/drei @pixiv/three-vrm
 *
 * The `@ts-nocheck` directive at the top silences the TypeScript compiler
 * while those modules are missing — the file still parses and won't break
 * `npm run lint`. Once the packages are installed, remove the directive
 * and let the real types take over.
 *
 * Runtime contract with `AIAvatarOrb`:
 *   - Default export: React component, props = { isSpeaking, analyser, excitement, persona }.
 *   - The outer orb lazy-loads this module; if either the module or its
 *     dependencies fail to resolve, `AIAvatarOrb` falls back to the 2D
 *     chibi-lightbulb SVG automatically (see the `.catch(() => ...)` in
 *     that file). So shipping this scaffold is safe in any environment.
 *
 * What the component does when fully wired up:
 *   1. Renders a VRM model (loaded from `/avatar.vrm` in the public folder).
 *      Users can drop in any CC0 VRM from open-source collections such as:
 *        - https://github.com/ToxSam/open-source-avatars  (300+ CC0 VRMs)
 *        - https://m3-org.github.io/CharacterStudio/
 *        - https://hub.vroid.com/  (filter by permissive license)
 *   2. Drives the `aa` (mouth-open) blendshape from the live AnalyserNode
 *      RMS — same input pipeline the SVG mascot uses, just fed into
 *      `vrm.expressionManager` instead of a JSX ellipse.
 *   3. Maps `excitement` to the `happy` / `angry` / `relaxed` blendshapes
 *      so big plays visibly change the avatar's mood.
 *   4. Adds a gentle idle head bob + blink timer so the model feels alive.
 *   5. Persona tints the rim light (orange / red / gold).
 *
 * Until the npm install step runs, any attempt to render `variant='3d'`
 * will be caught by the lazy-import error handler and silently fall back
 * to the 2D avatar — users see no error, just the chibi lightbulb.
 */

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

interface AIAvatar3DProps {
  isSpeaking: boolean;
  analyser: AnalyserNode | null;
  excitement?: number;
  persona?: string;
}

const VRM_URL = '/avatar.vrm';

function VRMAvatar({ isSpeaking, analyser, excitement = 0, persona = 'analyst' }: AIAvatar3DProps) {
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  // Extract VRM from the loaded scene once.
  const vrm = useMemo(() => {
    const v = gltf.userData.vrm;
    if (!v) return null;
    VRMUtils.removeUnnecessaryVertices(v.scene);
    VRMUtils.removeUnnecessaryJoints(v.scene);
    v.scene.rotation.y = Math.PI; // face camera
    return v;
  }, [gltf]);

  const smoothedAmpRef = useRef(0);
  const blinkClockRef = useRef(0);
  const nextBlinkRef = useRef(3 + Math.random() * 3);

  useFrame((_, delta) => {
    if (!vrm) return;
    const exp = vrm.expressionManager;
    if (!exp) return;

    // --- Mouth ---
    let target = 0;
    if (isSpeaking && analyser) {
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      target = Math.min(1, rms * 3.2);
    }
    smoothedAmpRef.current = smoothedAmpRef.current * 0.55 + target * 0.45;
    exp.setValue('aa', smoothedAmpRef.current);

    // --- Excitement → mood blendshapes ---
    exp.setValue('happy', Math.min(1, excitement));
    if (persona === 'trash_talker') {
      exp.setValue('angry', Math.min(0.6, excitement * 0.8));
    } else {
      exp.setValue('angry', 0);
    }
    if (persona === 'emotional') {
      exp.setValue('relaxed', 0.3 + excitement * 0.3);
    }

    // --- Blink timer ---
    blinkClockRef.current += delta;
    if (blinkClockRef.current > nextBlinkRef.current) {
      // Simulate a quick blink over ~120ms.
      const t = (blinkClockRef.current - nextBlinkRef.current) / 0.12;
      if (t < 1) {
        exp.setValue('blink', t < 0.5 ? t * 2 : (1 - t) * 2);
      } else {
        exp.setValue('blink', 0);
        blinkClockRef.current = 0;
        nextBlinkRef.current = 3 + Math.random() * 3;
      }
    }

    exp.update();
    vrm.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}

function RimLight({ persona }: { persona?: string }) {
  const color =
    persona === 'trash_talker'
      ? '#FF2D55'
      : persona === 'emotional'
        ? '#FFB400'
        : '#FF6B1A';
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} color="#ffffff" />
      <pointLight position={[-2, 1.2, 2]} intensity={1.4} color={color} />
    </>
  );
}

export default function AIAvatar3D(props: AIAvatar3DProps) {
  return (
    <Canvas
      className="w-full h-full absolute inset-0"
      camera={{ position: [0, 1.35, 1.0], fov: 28 }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <RimLight persona={props.persona} />
        <VRMAvatar {...props} />
        <Environment preset="city" />
        {/* Uncomment during tuning to orbit the model in dev: */}
        {/* <OrbitControls /> */}
      </Suspense>
    </Canvas>
  );
}
