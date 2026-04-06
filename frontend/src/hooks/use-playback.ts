import { useState, useEffect, useRef } from 'preact/hooks';
import { AudioPlayer, type PlayerState } from '../audio/player';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { ApiClient } from '../api/types';

export function usePlayback(
  recordingId: string | null,
  audioCache?: AudioCacheImpl,
  api?: ApiClient,
) {
  const [playerState, setPlayerState] = useState<PlayerState>({
    status: 'idle',
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
  });

  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    const player = new AudioPlayer(setPlayerState, audioCache, api);
    playerRef.current = player;

    if (recordingId) {
      player.load(recordingId);
    }

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [recordingId]);

  return {
    playerState,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seek: (time: number) => playerRef.current?.seek(time),
    skipForward: () => playerRef.current?.skipForward(),
    skipBackward: () => playerRef.current?.skipBackward(),
    setRate: (rate: number) => playerRef.current?.setRate(rate),
  };
}
