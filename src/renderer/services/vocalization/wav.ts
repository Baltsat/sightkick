import type { PcmSample } from './types';

function textAt(view: DataView, offset: number, length: number) {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index)),
  ).join('');
}

export function encodePcm16Wav(sample: PcmSample): Uint8Array {
  const bytes = new Uint8Array(44 + sample.data.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    [...value].forEach((character, index) => {
      view.setUint8(offset + index, character.charCodeAt(0));
    });
  };

  writeText(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sample.sampleRate, true);
  view.setUint32(28, sample.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sample.data.length * 2, true);

  sample.data.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value));
    const integer = clamped < 0 ? clamped * 32768 : clamped * 32767;

    view.setInt16(44 + index * 2, Math.round(integer), true);
  });

  return bytes;
}

export function decodeWav(bytes: Uint8Array<ArrayBufferLike>): PcmSample {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (textAt(view, 0, 4) !== 'RIFF' || textAt(view, 8, 4) !== 'WAVE') {
    throw new Error('recording is not a RIFF/WAVE file');
  }

  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const id = textAt(view, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(length, view.byteLength - body);
    }

    offset = body + length + (length % 2);
  }

  if (!dataOffset || !dataLength || !sampleRate || !channels) {
    throw new Error('recording has no decodable PCM data');
  }

  if (!((format === 1 && bits === 16) || (format === 3 && bits === 32))) {
    throw new Error(`unsupported WAV encoding: format ${format}, ${bits}-bit`);
  }

  const bytesPerSample = bits / 8;
  const frameCount = Math.floor(dataLength / bytesPerSample / channels);
  const data = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;

    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset =
        dataOffset + (frame * channels + channel) * bytesPerSample;

      sum +=
        format === 3
          ? view.getFloat32(sampleOffset, true)
          : view.getInt16(sampleOffset, true) / 32768;
    }

    data[frame] = sum / channels;
  }

  return { sampleRate, data };
}
