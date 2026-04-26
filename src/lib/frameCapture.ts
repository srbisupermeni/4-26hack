/**
 * Frame capture + cheap scene-change detection for the Vision Companion.
 *
 * We sample frames from a <video> element into a compact JPEG data URL so the
 * backend can forward them to a multimodal model. We also compute a tiny
 * 16x16 grayscale "fingerprint" so the client can cheaply tell when the
 * picture has changed a lot (a candidate "something happened" trigger)
 * without paying for a model call.
 */

export interface CapturedFrame {
  /** JPEG data URL, downsampled for token efficiency. */
  dataUrl: string;
  /** video.currentTime at capture (seconds). -1 for live sources. */
  videoTime: number;
  /** Wall clock timestamp (ms since epoch). */
  capturedAt: number;
  /** 16x16 grayscale fingerprint for cheap diffs. Length = 256. */
  fingerprint: Uint8ClampedArray;
}

const FINGERPRINT_SIZE = 16;

/**
 * Capture a single frame from a playing <video>.
 * Returns null if the video isn't ready / has no dimensions yet.
 */
export function captureFrame(
  video: HTMLVideoElement | null,
  maxDim = 512,
  jpegQuality = 0.55,
): CapturedFrame | null {
  if (!video) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  // Downsample preserving aspect ratio.
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch (err) {
    // Tainted canvas (cross-origin video) — we can't read it back.
    console.warn('[frameCapture] drawImage failed, likely CORS-tainted:', err);
    return null;
  }

  const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
  const fingerprint = computeFingerprint(canvas, ctx);

  return {
    dataUrl,
    videoTime: Number.isFinite(video.currentTime) ? video.currentTime : -1,
    capturedAt: Date.now(),
    fingerprint,
  };
}

/**
 * Build a 16x16 grayscale thumbnail of the canvas content as a perceptual
 * fingerprint. Cheap: we just redraw into a tiny canvas and read pixels.
 */
function computeFingerprint(
  src: HTMLCanvasElement,
  _srcCtx: CanvasRenderingContext2D,
): Uint8ClampedArray {
  const tiny = document.createElement('canvas');
  tiny.width = FINGERPRINT_SIZE;
  tiny.height = FINGERPRINT_SIZE;
  const tctx = tiny.getContext('2d');
  if (!tctx) return new Uint8ClampedArray(FINGERPRINT_SIZE * FINGERPRINT_SIZE);

  tctx.drawImage(src, 0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE);
  const { data } = tctx.getImageData(0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE);

  // RGBA -> grayscale (luma).
  const gray = new Uint8ClampedArray(FINGERPRINT_SIZE * FINGERPRINT_SIZE);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

/**
 * Mean absolute difference between two fingerprints, normalized 0..1.
 * Returns 0 if either is empty or mismatched size.
 *
 * Rough thresholds:
 *   < 0.04 → near-identical (static shot / paused)
 *   0.04 .. 0.10 → normal motion
 *   > 0.12 → likely scene change, camera cut, or big visual event
 */
export function fingerprintDiff(
  a: CapturedFrame | null | undefined,
  b: CapturedFrame | null | undefined,
): number {
  if (!a || !b) return 0;
  if (a.fingerprint.length !== b.fingerprint.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.fingerprint.length; i++) {
    sum += Math.abs(a.fingerprint[i] - b.fingerprint[i]);
  }
  return sum / (a.fingerprint.length * 255);
}
