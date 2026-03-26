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
};
