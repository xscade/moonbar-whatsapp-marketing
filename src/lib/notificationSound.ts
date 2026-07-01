const STORAGE_KEY = "moonbar:notif-sound-enabled";

let soundUrl: string | null = null;
let unlocked = false;
let lastPlayedAt = 0;
const MIN_PLAY_INTERVAL_MS = 1200;

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createNotificationWavBlob() {
  const sampleRate = 44100;
  const durationSec = 0.38;
  const numSamples = Math.floor(sampleRate * durationSec);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const tones = [
    { frequency: 880, start: 0, length: 0.12 },
    { frequency: 1174.66, start: 0.13, length: 0.18 }
  ];

  for (let index = 0; index < numSamples; index += 1) {
    const time = index / sampleRate;
    let sample = 0;

    for (const tone of tones) {
      if (time < tone.start || time > tone.start + tone.length) continue;
      const elapsed = time - tone.start;
      const attack = Math.min(1, elapsed / 0.015);
      const release = Math.min(1, (tone.length - elapsed) / 0.05);
      const envelope = attack * release;
      sample +=
        Math.sin(2 * Math.PI * tone.frequency * elapsed) * envelope * 0.35;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function getSoundUrl() {
  if (typeof window === "undefined") return null;
  if (!soundUrl) {
    soundUrl = URL.createObjectURL(createNotificationWavBlob());
  }
  return soundUrl;
}

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

export async function ensureNotificationAudioReady() {
  const url = getSoundUrl();
  if (!url || unlocked) return;

  const audio = new Audio(url);
  audio.preload = "auto";

  try {
    audio.volume = 0.001;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    unlocked = true;
  } catch {
    // Browser still requires a direct user gesture.
  }
}

export async function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_PLAY_INTERVAL_MS) return;

  const url = getSoundUrl();
  if (!url) return;

  const audio = new Audio(url);
  audio.preload = "auto";

  try {
    await audio.play();
    lastPlayedAt = now;
  } catch {
    // Ignore autoplay restrictions until the tab has been unlocked.
  }
}
