import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendMessage, uploadFile } from '../services/chat.service.js';

const sameId = (a, b) => String(a ?? '') === String(b ?? '');

const formatElapsed = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const pickMimeType = () => {
  if (
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported?.('audio/webm')
  ) {
    return 'audio/webm';
  }
  return undefined;
};

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
};

/**
 * Mic recorder → upload + send as a voice message.
 */
export default function VoiceRecorder({ conversationId, onSent }) {
  const queryClient = useQueryClient();
  const [permissionError, setPermissionError] = useState('');
  const [sendError, setSendError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const elapsedRef = useRef(0);
  const tickRef = useRef(null);
  const finalDurationRef = useRef(0);
  const discardRef = useRef(false);

  const clearTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const releaseMic = ({ discard = true } = {}) => {
    clearTick();
    discardRef.current = discard;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
      }
      return;
    }
    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      releaseMic({ discard: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (file) => {
      const uploaded = await uploadFile(conversationId, file);
      return sendMessage(conversationId, {
        type: 'voice',
        attachment: {
          storedFilename: uploaded.storedFilename,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          durationSeconds: finalDurationRef.current,
        },
      });
    },
    onSuccess: (data) => {
      const sent = data?.message ?? data;
      if (sent) {
        queryClient.setQueryData(['messages', conversationId], (old) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((m) => sameId(m._id, sent._id))) return list;
          return [...list, sent];
        });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSendError('');
      onSent?.();
    },
    onError: (err) => {
      setSendError(
        err?.response?.data?.message ||
          err?.message ||
          'Could not send voice note.'
      );
    },
  });

  const startRecording = async () => {
    setPermissionError('');
    setSendError('');
    discardRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPermissionError('Voice recording is not supported in this browser.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPermissionError('Microphone access was denied');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    elapsedRef.current = 0;
    finalDurationRef.current = 0;
    setElapsedSeconds(0);

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      stopStreamTracks(stream);
      streamRef.current = null;
      setSendError('Could not start the microphone recorder.');
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      discardRef.current = true;
      clearTick();
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setSendError('Recording failed. Please try again.');
    };

    recorder.onstop = () => {
      clearTick();
      const shouldDiscard = discardRef.current;
      finalDurationRef.current = elapsedRef.current;

      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);

      if (shouldDiscard) {
        chunksRef.current = [];
        discardRef.current = false;
        return;
      }

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];

      if (!blob.size) {
        setSendError('No audio was captured.');
        return;
      }

      const file = new File(
        [blob],
        `voice-note-${Date.now()}.webm`,
        { type: 'audio/webm' }
      );
      sendMutation.mutate(file);
    };

    try {
      recorder.start(250);
    } catch {
      stopStreamTracks(stream);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setSendError('Could not start the microphone recorder.');
      return;
    }

    setIsRecording(true);
    tickRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);
  };

  const stopRecording = () => {
    discardRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      setIsRecording(false);
      return;
    }
    clearTick();
    finalDurationRef.current = elapsedRef.current;
    try {
      recorder.stop();
    } catch {
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  };

  if (sendMutation.isPending) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
        Sending voice note…
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500"
          aria-hidden
        />
        <span className="font-mono text-sm tabular-nums text-zinc-100">
          {formatElapsed(elapsedSeconds)}
        </span>
        <button
          type="button"
          onClick={stopRecording}
          className="ml-auto cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
        >
          Stop
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startRecording}
          aria-label="Start recording"
          className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-orange-500/50 hover:text-white"
        >
          Mic
        </button>
        <button
          type="button"
          onClick={() => {
            releaseMic({ discard: true });
            onSent?.();
          }}
          className="cursor-pointer rounded-lg px-2 py-2 text-xs text-zinc-500 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
      {permissionError ? (
        <p className="text-[11px] text-red-400">{permissionError}</p>
      ) : null}
      {sendError ? (
        <p className="text-[11px] text-red-400">{sendError}</p>
      ) : null}
    </div>
  );
}
