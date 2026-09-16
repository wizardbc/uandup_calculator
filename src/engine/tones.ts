export class TonePlayer {
  private context: AudioContext | null = null;
  private voices = new Map<
    string,
    { oscillator: OscillatorNode; gain: GainNode }
  >();
  private enabled = false;
  enable(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.context ??= new AudioContext();
      void this.context.resume();
    } else this.clear();
  }
  update(tones: { id: string; frequency: number; gain: number }[]) {
    const context = this.context;
    if (!context || !this.enabled) return;
    const ids = new Set(tones.map((t) => t.id));
    for (const [id, voice] of this.voices)
      if (!ids.has(id)) {
        voice.oscillator.stop();
        voice.oscillator.disconnect();
        voice.gain.disconnect();
        this.voices.delete(id);
      }
    for (const tone of tones) {
      let voice = this.voices.get(tone.id);
      if (!voice) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        voice = { oscillator, gain };
        this.voices.set(tone.id, voice);
      }
      voice.oscillator.frequency.setTargetAtTime(
        tone.frequency,
        context.currentTime,
        0.01,
      );
      voice.gain.gain.setTargetAtTime(
        (tone.gain * 0.08) / Math.max(1, Math.sqrt(tones.length)),
        context.currentTime,
        0.01,
      );
    }
  }
  clear() {
    for (const v of this.voices.values()) {
      v.oscillator.stop();
      v.oscillator.disconnect();
      v.gain.disconnect();
    }
    this.voices.clear();
  }
  close() {
    this.clear();
    void this.context?.close();
    this.context = null;
  }
}
