const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 1600; // 100 ms at 16 kHz
const FRAME_BYTES = FRAME_SAMPLES * 2; // 3200 bytes (Int16 little-endian)

class Pcm16WorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    const srcRate =
      typeof sampleRate === "number" && Number.isFinite(sampleRate) && sampleRate > 0
        ? sampleRate
        : 48000;

    this._step = srcRate / TARGET_SAMPLE_RATE;
    this._readPos = 0;
    this._prevSample = 0;

    this._buffer = new ArrayBuffer(FRAME_BYTES);
    this._view = new DataView(this._buffer);
    this._outIndex = 0;

    // Emit RMS level roughly 10 times per second (every ~100 ms of input audio).
    this._rmsWindowSamples = Math.max(1, Math.round(srcRate / 10));
    this._rmsSumSq = 0;
    this._rmsCount = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "flush") {
        this._outIndex = 0;
        this._readPos = 0;
        this._prevSample = 0;
        this._rmsSumSq = 0;
        this._rmsCount = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channel = input[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const len = channel.length;

    // Accumulate input energy for ~10 Hz RMS reporting.
    for (let i = 0; i < len; i++) {
      const s = channel[i];
      this._rmsSumSq += s * s;
    }
    this._rmsCount += len;

    if (this._rmsCount >= this._rmsWindowSamples) {
      const rms = Math.sqrt(this._rmsSumSq / this._rmsCount);
      const value = rms > 1 ? 1 : rms < 0 ? 0 : rms;
      this.port.postMessage({ type: "level", value });
      this._rmsSumSq = 0;
      this._rmsCount = 0;
    }

    // Linear-interpolation resampling with fractional position carried across blocks.
    // Index -1 refers to the last sample of the previous block (`this._prevSample`).
    let readPos = this._readPos;
    const step = this._step;
    const prevSample = this._prevSample;
    const limit = len - 1;

    while (readPos < limit) {
      const idx0 = Math.floor(readPos);
      const frac = readPos - idx0;
      const s0 = idx0 < 0 ? prevSample : channel[idx0];
      const s1 = channel[idx0 + 1];
      const sample = s0 + (s1 - s0) * frac;

      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      const int16 =
        clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);

      this._view.setInt16(this._outIndex * 2, int16, true);
      this._outIndex += 1;

      if (this._outIndex >= FRAME_SAMPLES) {
        const frame = this._buffer;
        this.port.postMessage(frame, [frame]);
        this._buffer = new ArrayBuffer(FRAME_BYTES);
        this._view = new DataView(this._buffer);
        this._outIndex = 0;
      }

      readPos += step;
    }

    this._prevSample = channel[limit];
    this._readPos = readPos - len;

    return true;
  }
}

registerProcessor("pcm16-worklet", Pcm16WorkletProcessor);
