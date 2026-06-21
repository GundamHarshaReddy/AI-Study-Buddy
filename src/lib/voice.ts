const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

// Browser Web Speech API interfaces
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/**
 * Speech to Text (STT) Service
 * Dictates text from the user microphone.
 */
export async function startSpeechToText(
  onTranscript: (text: string) => void,
  onError: (err: string) => void,
  onEnd: () => void
): Promise<{ stop: () => void }> {
  // Use Browser Speech Recognition if no Deepgram API key is provided
  if (!DEEPGRAM_API_KEY) {
    if (!SpeechRecognition) {
      onError('Web Speech API is not supported in this browser. Please configure VITE_DEEPGRAM_API_KEY for Deepgram voice.');
      onEnd();
      return { stop: () => {} };
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      onError(event.error || 'Speech recognition error');
    };

    recognition.onend = () => {
      onEnd();
    };

    recognition.start();
    return {
      stop: () => {
        recognition.stop();
      }
    };
  }

  // Deepgram API recording route
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      stream.getTracks().forEach(track => track.stop());

      try {
        const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&model=nova-2', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/webm',
          },
          body: audioBlob,
        });

        if (!response.ok) {
          throw new Error(`Deepgram transcription failed: ${response.statusText}`);
        }

        const data = await response.json();
        const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';
        if (transcript) {
          onTranscript(transcript);
        } else {
          onError('Could not hear anything. Please try speaking clearly.');
        }
      } catch (err) {
        console.error('Deepgram transcription error:', err);
        onError('Deepgram STT API error. Checking browser SpeechRecognition fallback...');
        // Quick fallback if Deepgram fails
        fallbackSpeechToText(onTranscript, onError, onEnd);
      } finally {
        onEnd();
      }
    };

    mediaRecorder.start();
    return {
      stop: () => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }
    };
  } catch (err: any) {
    onError(err.message || 'Microphone access denied');
    onEnd();
    return { stop: () => {} };
  }
}

function fallbackSpeechToText(
  onTranscript: (text: string) => void,
  onError: (err: string) => void,
  onEnd: () => void
) {
  if (!SpeechRecognition) {
    onError('Browser fallback SpeechRecognition is not supported.');
    onEnd();
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    if (transcript) onTranscript(transcript);
  };
  recognition.onerror = (e: any) => onError(e.error || 'Fallback error');
  recognition.onend = onEnd;
  recognition.start();
}

// Global AudioContext cache to avoid reinitialization errors
let audioCtx: AudioContext | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;

/**
 * Text to Speech (TTS) Service
 * Speaks text using Deepgram Aura or Browser Web Speech API.
 */
export async function speakText(text: string): Promise<void> {
  // Stop any active speak sessions
  stopSpeaking();

  // Strip Markdown for cleaner speech output
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '') // remove code blocks (don't speak code!)
    .replace(/[*#_`~[\]]/g, '') // remove markdown symbols
    .trim();

  if (!cleanText) return;

  if (DEEPGRAM_API_KEY) {
    try {
      const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: cleanText }),
      });

      if (!response.ok) {
        throw new Error(`Deepgram TTS failed: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const decodedBuffer = await audioCtx.decodeAudioData(audioBuffer);
      currentAudioSource = audioCtx.createBufferSource();
      currentAudioSource.buffer = decodedBuffer;
      currentAudioSource.connect(audioCtx.destination);
      currentAudioSource.start(0);
      return;
    } catch (err) {
      console.warn('Deepgram TTS failed, falling back to Browser Synthesis:', err);
    }
  }

  // Fallback to Web Speech API
  if ('speechSynthesis' in window) {
    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.rate = 1.0;
    currentUtterance.pitch = 1.0;
    currentUtterance.lang = 'en-US';
    window.speechSynthesis.speak(currentUtterance);
  }
}

/**
 * Stops any current speech playbacks
 */
export function stopSpeaking() {
  // Stop browser synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  
  // Stop web audio context
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch {}
    currentAudioSource = null;
  }
}
