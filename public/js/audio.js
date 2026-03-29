/**
 * GameAudio — Web Audio API sound effects.
 * Generates simple tones programmatically — no external audio files needed.
 */

import { Storage } from './storage.js';

let audioCtx = null;

/** Lazily create AudioContext on first user interaction. */
function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Play a tone at a given frequency/duration using an oscillator. */
function playTone(freq, duration, type = 'sine', gainVal = 0.15, startDelay = 0) {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration);
  } catch {
    // AudioContext may be blocked by browser autoplay policy — silently ignore
  }
}

function isSoundEnabled() {
  return Storage.getSettings().sound;
}

export const GameAudio = {
  /** Pleasant rising tone — two quick ascending notes. */
  playCorrect() {
    if (!isSoundEnabled()) return;
    playTone(523.25, 0.12, 'sine', 0.15, 0);     // C5
    playTone(659.25, 0.18, 'sine', 0.15, 0.1);    // E5
  },

  /** Low buzz / descending tone. */
  playWrong() {
    if (!isSoundEnabled()) return;
    playTone(311.13, 0.15, 'sawtooth', 0.08, 0);   // Eb4
    playTone(233.08, 0.25, 'sawtooth', 0.08, 0.12); // Bb3
  },

  /** Soft tick for timer countdown. */
  playTick() {
    if (!isSoundEnabled()) return;
    playTone(880, 0.05, 'sine', 0.08, 0);
  },

  /** Short ascending arpeggio for match start. */
  playMatchStart() {
    if (!isSoundEnabled()) return;
    playTone(523.25, 0.1, 'sine', 0.12, 0);     // C5
    playTone(659.25, 0.1, 'sine', 0.12, 0.1);   // E5
    playTone(783.99, 0.1, 'sine', 0.12, 0.2);   // G5
    playTone(1046.5, 0.2, 'sine', 0.12, 0.3);   // C6
  },

  /** Celebratory chime for achievements. */
  playAchievement() {
    if (!isSoundEnabled()) return;
    playTone(783.99, 0.12, 'sine', 0.12, 0);     // G5
    playTone(987.77, 0.12, 'sine', 0.12, 0.1);   // B5
    playTone(1174.66, 0.12, 'sine', 0.12, 0.2);  // D6
    playTone(1567.98, 0.3, 'triangle', 0.1, 0.3); // G6
  },

  /** Short notification tone — opponent answered. */
  playOpponentAnswered() {
    if (!isSoundEnabled()) return;
    playTone(698.46, 0.08, 'sine', 0.1, 0);      // F5
    playTone(880, 0.1, 'sine', 0.1, 0.06);        // A5
  },

  /** Subtle tick for countdown timer. */
  playCountdownTick() {
    if (!isSoundEnabled()) return;
    playTone(1200, 0.03, 'sine', 0.06, 0);
  },

  /** Ascending fanfare — win celebration. */
  playWinFanfare() {
    if (!isSoundEnabled()) return;
    playTone(523.25, 0.12, 'sine', 0.12, 0);      // C5
    playTone(659.25, 0.12, 'sine', 0.12, 0.1);    // E5
    playTone(783.99, 0.12, 'sine', 0.12, 0.2);    // G5
    playTone(1046.5, 0.15, 'sine', 0.14, 0.3);    // C6
    playTone(1318.5, 0.2, 'triangle', 0.12, 0.4); // E6
    playTone(1567.98, 0.35, 'sine', 0.1, 0.5);    // G6
  },

  /** Descending tone — loss sound. */
  playLossSound() {
    if (!isSoundEnabled()) return;
    playTone(440, 0.15, 'sawtooth', 0.08, 0);     // A4
    playTone(349.23, 0.15, 'sawtooth', 0.07, 0.12); // F4
    playTone(261.63, 0.25, 'sawtooth', 0.06, 0.24); // C4
  },
};
