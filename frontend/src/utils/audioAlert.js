/**
 * Continuous loud alarm for callback / follow-up reminders.
 * Prefers `/alarm.mp3` (looped HTML5 Audio); falls back to a pulsating
 * 1200Hz Web Audio chime. Call stopChime() to silence immediately.
 *
 * Audio unlock: first user gesture resumes AudioContext + primes HTMLAudio
 * so autoplay policies never block the reminder chime.
 */

let audioCtx = null;
let unlockBound = false;
let audioUnlocked = false;

/** @type {HTMLAudioElement | null} */
let htmlAlarm = null;
/** @type {HTMLAudioElement | null} */
let primedAudio = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pulseTimer = null;
/** @type {Array<{ stop: (when?: number) => void }>} */
let activeNodes = [];
let alarmGeneration = 0;
let alarmPlaying = false;

/** Prefer static file chimes (cross-platform). Web Audio oscillator is last resort. */
const ALARM_SOURCES = ['/alarm.mp3', '/alarm.wav'];
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

/** Tiny silent WAV — unlocks HTMLAudio without ever touching /alarm.* */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

/**
 * Unlock media playback after a user gesture (required by browsers).
 * Never plays the reminder alarm asset — clicks must stay silent.
 * Safe to call repeatedly (subsequent calls only resume AudioContext).
 */
export async function unlockAudioPlayback() {
  try {
    const ctx = ensureContext();
    if (ctx) await resumeContext(ctx);

    // Prime HTMLAudio once with a silent data-URI — never /alarm.mp3|/alarm.wav
    if (typeof Audio !== 'undefined' && !audioUnlocked) {
      if (!primedAudio) {
        primedAudio = new Audio(SILENT_WAV);
        primedAudio.preload = 'auto';
        primedAudio.volume = 0;
      }
      primedAudio.currentTime = 0;
      const playPromise = primedAudio.play();
      if (playPromise?.then) {
        await playPromise.catch(() => {});
      }
      primedAudio.pause();
      primedAudio.currentTime = 0;
    }

    audioUnlocked = true;
  } catch {
    // visual + OS notifications still work
  }
}

export const isAudioUnlocked = () => audioUnlocked;

const bindUnlockOnGesture = () => {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const onGesture = () => {
    // Resume only — unlockAudioPlayback itself never starts the alarm loop
    unlockAudioPlayback();
  };

  // Gestures unlock/resume Autoplay policy only; they must never startChime
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
  window.addEventListener('touchstart', onGesture, { passive: true });
};

/** Probe a single static alarm URL — resolves the element or null. */
function tryLoadAlarmSource(src) {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || !src) {
      resolve(null);
      return;
    }

    const audio = new Audio(src);
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
    audio.load();

    window.setTimeout(() => {
      if (settled) return;
      if (audio.readyState >= 2) finish(audio);
      else finish(null);
    }, 2500);
  });
}

/** Prefer `/alarm.mp3`, then `/alarm.wav` — never rely on oscillator first. */
async function tryLoadAlarmMp3() {
  for (const src of ALARM_SOURCES) {
    const audio = await tryLoadAlarmSource(src);
    if (audio) return audio;
  }
  return null;
}

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

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  delay.delayTime.value = 0.12;
  feedback.gain.value = 0.45;
  wet.gain.value = 0.35;

  osc.connect(gain);
  gain.connect(ctx.destination);

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

export function stopChime() {
  alarmPlaying = false;
  alarmGeneration += 1;

  const silence = (audio) => {
    if (!audio) return;
    try {
      audio.pause();
      audio.loop = false;
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  };

  silence(htmlAlarm);
  if (htmlAlarm && htmlAlarm !== primedAudio) {
    try {
      htmlAlarm.src = '';
    } catch {
      // ignore
    }
  }
  htmlAlarm = null;

  // Also silence the unlock-primed element so nothing keeps looping in background
  silence(primedAudio);

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

export async function startAlarmLoop() {
  stopChime();
  alarmPlaying = true;
  const generation = alarmGeneration;

  try {
    await unlockAudioPlayback();
    if (!alarmPlaying || generation !== alarmGeneration) return;

    const mp3 = await tryLoadAlarmMp3();
    if (!alarmPlaying || generation !== alarmGeneration) return;

    if (mp3) {
      htmlAlarm = mp3;
      htmlAlarm.loop = true;
      htmlAlarm.volume = 1.0;
      htmlAlarm.currentTime = 0;
      await htmlAlarm.play();
      return;
    }

    const ctx = ensureContext();
    if (!ctx) return;
    await resumeContext(ctx);
    if (!alarmPlaying || generation !== alarmGeneration) return;
    startWebAudioPulseLoop(generation);
  } catch {
    alarmPlaying = false;
  }
}

/**
 * @deprecated Prefer startAlarmLoop for reminders.
 * @param {'single' | 'double'} [_pattern]
 */
export async function playChime(_pattern = 'single') {
  return startAlarmLoop();
}

/**
 * Short crisp message-notification ping (does not touch the reminder alarm loop).
 */
export async function playMessageChime() {
  try {
    await unlockAudioPlayback();
    const ctx = ensureContext();
    if (!ctx) return;
    await resumeContext(ctx);

    const now = ctx.currentTime;
    const tones = [
      { freq: 880, start: 0, dur: 0.09 },
      { freq: 1320, start: 0.08, dur: 0.12 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + tone.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + tone.dur
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.02);
    }
  } catch {
    // Ignore — toast still shows
  }
}

export default playChime;
