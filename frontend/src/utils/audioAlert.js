/**
 * Continuous loud alarm for callback / follow-up reminders.
 * Prefers `/alarm.mp3` (looped HTML5 Audio); falls back to a pulsating
 * 1200Hz Web Audio chime. Call stopChime() to silence immediately.
 */

let audioCtx = null;
let unlockBound = false;

/** @type {HTMLAudioElement | null} */
let htmlAlarm = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pulseTimer = null;
/** @type {Array<{ stop: (when?: number) => void }>} */
let activeNodes = [];
let alarmGeneration = 0;
let alarmPlaying = false;

const ALARM_MP3 = '/alarm.mp3';
const PULSE_HZ = 1200;
const PULSE_EVERY_MS = 1500;

const getAudioContextCtor = () =>
  window.AudioContext || window.webkitAudioContext || null;

const ensureContext = () => {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
};

const resumeContext = async (ctx) => {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
};

const bindUnlockOnGesture = () => {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const unlock = async () => {
    try {
      const ctx = ensureContext();
      if (!ctx) return;
      await resumeContext(ctx);
    } catch {
      // visual alerts still work
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

/** Probe public `/alarm.mp3` — resolves null if missing / unloadable. */
function tryLoadAlarmMp3() {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') {
      resolve(null);
      return;
    }

    const audio = new Audio(ALARM_MP3);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 1.0;

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('canplaythrough', onOk);
      audio.removeEventListener('error', onErr);
      resolve(result);
    };
    const onOk = () => finish(audio);
    const onErr = () => finish(null);

    audio.addEventListener('canplaythrough', onOk, { once: true });
    audio.addEventListener('error', onErr, { once: true });

    // Force network check
    audio.load();

    // Safety if neither event fires
    window.setTimeout(() => {
      if (settled) return;
      if (audio.readyState >= 2) finish(audio);
      else finish(null);
    }, 2500);
  });
}

/**
 * One loud 1200Hz chime burst with simple delay “reverb” tail.
 */
function playPulseBurst(ctx) {
  const t0 = ctx.currentTime + 0.01;
  const duration = 0.55;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const delay = ctx.createDelay(0.4);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(PULSE_HZ, t0);

  // Loud attack, quick decay — urgent ring
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  delay.delayTime.value = 0.12;
  feedback.gain.value = 0.45;
  wet.gain.value = 0.35;

  osc.connect(gain);
  gain.connect(ctx.destination);

  // Feedback delay path for reverberating ring
  gain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + duration + 0.05);

  activeNodes.push(osc);
  osc.onended = () => {
    activeNodes = activeNodes.filter((n) => n !== osc);
  };
}

function startWebAudioPulseLoop(generation) {
  const ctx = ensureContext();
  if (!ctx) return;

  const tick = async () => {
    if (!alarmPlaying || generation !== alarmGeneration) return;
    try {
      await resumeContext(ctx);
      playPulseBurst(ctx);
    } catch {
      // ignore single-tick failures
    }
  };

  tick();
  pulseTimer = window.setInterval(tick, PULSE_EVERY_MS);
}

/**
 * Immediately silence any looping HTML5 or Web Audio alarm.
 */
export function stopChime() {
  alarmPlaying = false;
  alarmGeneration += 1;

  if (htmlAlarm) {
    try {
      htmlAlarm.pause();
      htmlAlarm.currentTime = 0;
      htmlAlarm.loop = false;
      htmlAlarm.src = '';
    } catch {
      // ignore
    }
    htmlAlarm = null;
  }

  if (pulseTimer != null) {
    window.clearInterval(pulseTimer);
    pulseTimer = null;
  }

  const ctx = audioCtx;
  const now = ctx?.currentTime ?? 0;
  for (const node of activeNodes) {
    try {
      node.stop(now);
    } catch {
      // already stopped
    }
  }
  activeNodes = [];
}

/**
 * Start a continuous looping alarm (MP3 if present, else Web Audio pulse).
 * Safe to call repeatedly — restarts cleanly.
 */
export async function startAlarmLoop() {
  stopChime();
  alarmPlaying = true;
  const generation = alarmGeneration;

  try {
    const mp3 = await tryLoadAlarmMp3();
    if (!alarmPlaying || generation !== alarmGeneration) return;

    if (mp3) {
      htmlAlarm = mp3;
      htmlAlarm.loop = true;
      htmlAlarm.volume = 1.0;
      await htmlAlarm.play();
      return;
    }

    const ctx = ensureContext();
    if (!ctx) return;
    await resumeContext(ctx);
    if (!alarmPlaying || generation !== alarmGeneration) return;
    startWebAudioPulseLoop(generation);
  } catch {
    // Audio blocked — visual popup still works
    alarmPlaying = false;
  }
}

/**
 * @deprecated Prefer startAlarmLoop for reminders. Kept for harness / short tests.
 * Starts the continuous alarm (pattern ignored — looping alert is the product behavior).
 * @param {'single' | 'double'} [_pattern]
 */
export async function playChime(_pattern = 'single') {
  return startAlarmLoop();
}

export default playChime;
