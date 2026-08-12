import { KitElement } from './practice-stats';

let previewContext: AudioContext | undefined;
const DRUM_PITCH: Partial<Record<KitElement, number>> = {
  kick: 76,
  snare: 190,
  tom1: 154,
  tom2: 126,
  tom3: 98,
};

function contextForPreview(): AudioContext | undefined {
  try {
    previewContext ??= new AudioContext({ latencyHint: 'interactive' });

    if (previewContext.state === 'suspended') {
      void previewContext.resume();
    }

    return previewContext;
  } catch {
    return undefined;
  }
}

function playDrum(context: AudioContext, element: KitElement): void {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const pitch = DRUM_PITCH[element] ?? 120;

  oscillator.type = element === 'snare' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(pitch * 1.35, now);
  oscillator.frequency.exponentialRampToValueAtTime(pitch, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.17, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}

function playCymbal(context: AudioContext): void {
  const now = context.currentTime;
  const duration = 0.18;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const highPass = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  highPass.type = 'highpass';
  highPass.frequency.setValueAtTime(4200, now);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(highPass).connect(gain).connect(context.destination);
  source.start(now);
  source.stop(now + duration);
}

/** Pointer-only preview. Physical MIDI already sounds through the real kit. */
export function playKitPreview(element: KitElement): void {
  const context = contextForPreview();

  if (!context) {
    return;
  }

  try {
    if (element === 'crash' || element === 'ride' || element === 'hihat') {
      playCymbal(context);

      return;
    }

    playDrum(context, element);
  } catch {
    // Visual feedback still works on browsers without the optional WebAudio
    // nodes used by the lightweight preview.
  }
}
