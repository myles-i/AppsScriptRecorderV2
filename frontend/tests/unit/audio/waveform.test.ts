import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveformVisualizer } from '../../../src/audio/waveform';

const WIDTH = 320;
const HEIGHT = 80;

function makeCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '' as string,
    lineWidth: 0 as number,
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: WIDTH,
    height: HEIGHT,
    getContext: vi.fn().mockReturnValue(ctx),
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx };
}

function makeAnalyser(sampleValue = 128) {
  return {
    frequencyBinCount: 4,
    getByteTimeDomainData: vi.fn().mockImplementation((data: Uint8Array) => {
      data.fill(sampleValue);
    }),
  } as unknown as AnalyserNode;
}

beforeEach(() => {
  // requestAnimationFrame schedules but does not invoke the callback —
  // this lets draw() execute once without looping infinitely.
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

describe('WaveformVisualizer', () => {
  describe('start()', () => {
    it('schedules an animation frame', () => {
      const { canvas, ctx: _ } = makeCanvas();
      new WaveformVisualizer(canvas, makeAnalyser()).start();
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('reads amplitude data from the analyser', () => {
      const { canvas } = makeCanvas();
      const analyser = makeAnalyser();
      new WaveformVisualizer(canvas, analyser).start();
      expect(analyser.getByteTimeDomainData).toHaveBeenCalled();
    });

    it('clears the canvas and draws a path on each frame', () => {
      const { canvas, ctx } = makeCanvas();
      new WaveformVisualizer(canvas, makeAnalyser()).start();
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('cancels the scheduled animation frame', () => {
      const { canvas } = makeCanvas();
      const viz = new WaveformVisualizer(canvas, makeAnalyser());
      viz.start(); // animationId = 42
      viz.stop();
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    });

    it('draws a flat line at the vertical midpoint', () => {
      const { canvas, ctx } = makeCanvas();
      new WaveformVisualizer(canvas, makeAnalyser()).stop();
      expect(ctx.moveTo).toHaveBeenCalledWith(0, HEIGHT / 2);
      expect(ctx.lineTo).toHaveBeenCalledWith(WIDTH, HEIGHT / 2);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('clears the canvas before drawing the flat line', () => {
      const { canvas, ctx } = makeCanvas();
      new WaveformVisualizer(canvas, makeAnalyser()).stop();
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT);
    });
  });
});
