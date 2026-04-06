export class WaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode;
  private animationId = 0;
  private color: string;

  constructor(canvas: HTMLCanvasElement, analyser: AnalyserNode, color = '#1a73e8') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.analyser = analyser;
    this.color = color;
  }

  start(): void {
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      const { width, height } = this.canvas;
      const bufferLength = this.analyser.frequencyBinCount;
      const data = new Uint8Array(bufferLength);
      this.analyser.getByteTimeDomainData(data);

      this.ctx.clearRect(0, 0, width, height);
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      this.ctx.lineTo(width, height / 2);
      this.ctx.stroke();
    };

    draw();
  }

  stop(): void {
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;

    // Draw flat line
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, height / 2);
    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
  }
}
