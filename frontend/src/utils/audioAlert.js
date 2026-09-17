/**
 * Shared Web Audio chime for callback / follow-up alerts.
 * One AudioContext for the whole app — browsers cap concurrent contexts and
 * often require a user gesture before audio can play.
 */

let audioCtx = null;
let unlockBound = false;

const getAudioContextCtor = () =>
  window.AudioContext || window.webkitAudioContext || null;

const ensureContext = () => {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;

  if (!audioCtx) {
    audioCtx = new Ctor();
  }

  return audioCtx;
};

const resumeContext = async (ctx) => {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
};

/** Unlock / resume the shared context on the first real user gesture. */
const bindUnlockOnGesture = () => {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const unlock = async () => {
    try {
      const ctx = ensureContext();
      if (!ctx) return;
      await resumeContext(ctx);
    } catch {
      // Fail silently — visual alerts still work
    } finally {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    }
  };

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
};

bindUnlockOnGesture();

/**
 * Play a short sine beep (~880Hz, ~300ms) with a soft attack/decay envelope.
 * @param {'single' | 'double'} [pattern='single']
 *   - single: 5-minute pre-alert
 *   - double: exact scheduled-time alert (~200ms gap)
 */
export async function playChime(pattern = 'single') {
  try {
    const ctx = ensureContext();
    if (!ctx) return;

    await resumeContext(ctx);

    const beep = (when) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, when);

      // Soft attack / decay (~300ms total) — non-jarring
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.22, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(when);
      osc.stop(when + 0.32);
    };

    const t0 = ctx.currentTime + 0.01;
    beep(t0);

    if (pattern === 'double') {
      beep(t0 + 0.2);
    }
  } catch {
    // AudioContext unavailable or blocked — rely on visual popup only
  }
}

export default playChime;
