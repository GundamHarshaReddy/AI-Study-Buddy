import { ChatMessage } from '../types/chat';

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

export interface DeepgramAgentCallbacks {
  onStateChange: (state: 'connecting' | 'connected' | 'listening' | 'speaking' | 'disconnected' | 'error', errorMsg?: string) => void;
  onUserTranscript: (text: string) => void;
  onAgentTranscript: (text: string) => void;
  onTurnComplete: (userText: string, agentText: string) => void;
}

export class DeepgramVoiceAgent {
  private socket: WebSocket | null = null;
  private keepAliveInterval: any = null;
  private connectionTimeout: any = null;

  // Audio nodes & contexts
  private inputAudioCtx: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;

  private outputAudioCtx: AudioContext | null = null;
  private outputProcessor: ScriptProcessorNode | null = null;
  private playbackQueue: Float32Array[] = [];

  // Transcripts tracking
  private currentUserText = '';
  private currentAgentText = '';

  constructor(
    private systemPrompt: string,
    private historyMessages: ChatMessage[],
    private callbacks: DeepgramAgentCallbacks
  ) {}

  public async start(): Promise<void> {
    if (!DEEPGRAM_API_KEY || !GROQ_API_KEY) {
      this.callbacks.onStateChange('error', 'Missing VITE_DEEPGRAM_API_KEY or VITE_GROQ_API_KEY.');
      return;
    }

    this.callbacks.onStateChange('connecting');

    // Timeout if connection takes too long
    this.connectionTimeout = setTimeout(() => {
      this.callbacks.onStateChange('error', 'Connection timed out.');
      this.stop();
    }, 10000);

    try {
      const url = 'wss://agent.deepgram.com/v1/agent/converse';
      this.socket = new WebSocket(url, ['token', DEEPGRAM_API_KEY]);

      this.socket.onopen = () => {
        clearTimeout(this.connectionTimeout);
        this.callbacks.onStateChange('connected');
        this.sendSettings();
        this.startAudioEngine();
      };

      this.socket.onmessage = async (event) => {
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          // Play binary PCM audio data from the agent
          await this.processAndQueueAudioChunk(event.data);
        } else if (typeof event.data === 'string') {
          // Parse JSON messages
          try {
            const data = JSON.parse(event.data);
            this.handleJsonMessage(data);
          } catch (e) {
            console.error('Failed to parse WebSocket text message:', e);
          }
        }
      };

      this.socket.onerror = (e) => {
        console.error('Deepgram Agent WebSocket error:', e);
        this.callbacks.onStateChange('error', 'WebSocket connection failed.');
      };

      this.socket.onclose = (event) => {
        console.log(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.cleanup();
        this.callbacks.onStateChange('disconnected');
      };

    } catch (err: any) {
      console.error('Failed to start Deepgram Agent:', err);
      this.callbacks.onStateChange('error', err.message || 'Failed to start.');
    }
  }

  public stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.cleanup();
  }

  private sendSettings(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // Start KeepAlive ping every 12 seconds to prevent idle timeout
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 12000);

    // Format local messages history for Deepgram Agent context
    const history = this.historyMessages.map(m => ({
      type: 'History',
      role: m.role,
      content: m.content
    }));

    const settings = {
      type: 'Settings',
      audio: {
        input: { encoding: 'linear16', sample_rate: 16000 },
        output: { encoding: 'linear16', sample_rate: 24000 }
      },
      agent: {
        context: {
          messages: history
        },
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-2',
            endpointing: 1000 // waits 1s of silence to finalize speech
          }
        },
        think: {
          provider: {
            type: 'groq',
            model: 'llama-3.3-70b-versatile'
          },
          endpoint: {
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`
            }
          },
          prompt: this.systemPrompt
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: 'aura-2-asteria-en'
          }
        }
      }
    };

    this.socket.send(JSON.stringify(settings));
  }

  private async startAudioEngine(): Promise<void> {
    try {
      // 1. Prepare Output Audio (Agent speaking playback)
      this.outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await this.outputAudioCtx.resume();

      // ScriptProcessorNode node to pull PCM samples from queue
      this.outputProcessor = this.outputAudioCtx.createScriptProcessor(4096, 0, 1);
      this.outputProcessor.onaudioprocess = (e) => {
        const outputChannel = e.outputBuffer.getChannelData(0);
        let i = 0;

        if (this.playbackQueue.length > 0) {
          this.callbacks.onStateChange('speaking');
        }

        while (i < outputChannel.length && this.playbackQueue.length > 0) {
          const chunk = this.playbackQueue[0];
          const toCopy = Math.min(outputChannel.length - i, chunk.length);

          for (let j = 0; j < toCopy; j++) {
            outputChannel[i + j] = chunk[j];
          }

          i += toCopy;

          if (toCopy === chunk.length) {
            this.playbackQueue.shift();
          } else {
            this.playbackQueue[0] = chunk.slice(toCopy);
          }
        }

        // Fill remaining buffer space with silence if queue is empty
        while (i < outputChannel.length) {
          outputChannel[i++] = 0;
        }
      };
      this.outputProcessor.connect(this.outputAudioCtx.destination);

      // 2. Prepare Input Audio (User microphone capture)
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, sampleRate: 16000 }
      });

      this.inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      this.inputSource = this.inputAudioCtx.createMediaStreamSource(this.micStream);

      // ScriptProcessorNode to capture user microphone and convert Float32 to Int16 PCM
      this.inputProcessor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);
      this.inputProcessor.onaudioprocess = (e) => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp value between [-1, 1] and scale to 16-bit signed integer
          int16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }

        // Send binary PCM frame over WebSocket
        this.socket.send(int16.buffer);
      };

      this.inputSource.connect(this.inputProcessor);
      this.inputProcessor.connect(this.inputAudioCtx.destination);

      this.callbacks.onStateChange('listening');

    } catch (err: any) {
      console.error('Audio engine start failed:', err);
      this.callbacks.onStateChange('error', 'Microphone or sound card access failed.');
      this.stop();
    }
  }

  private async processAndQueueAudioChunk(data: Blob | ArrayBuffer): Promise<void> {
    try {
      const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);

      // Convert 16-bit PCM to 32-bit Float
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      this.playbackQueue.push(float32);
    } catch (e) {
      console.error('Error queuing agent audio chunk:', e);
    }
  }

  private handleJsonMessage(data: any): void {
    const { type } = data;

    // Log the incoming message for easy debugging
    console.log('Deepgram Voice Agent JSON Event:', data);

    if (type === 'ConversationText') {
      const textVal = data.content || data.text || '';
      if (data.role === 'user' && textVal) {
        this.currentUserText = textVal;
        this.callbacks.onUserTranscript(textVal);
        this.callbacks.onStateChange('listening');
      } else if ((data.role === 'assistant' || data.role === 'agent') && textVal) {
        // Accumulate assistant utterances to avoid overwriting or vanishing
        if (this.currentAgentText && !this.currentAgentText.includes(textVal)) {
          this.currentAgentText = `${this.currentAgentText}\n\n${textVal}`;
        } else if (!this.currentAgentText) {
          this.currentAgentText = textVal;
        }
        this.callbacks.onAgentTranscript(this.currentAgentText);
      }
    }
    else if (type === 'AgentInfo') {
      if (data.event === 'thinking' && data.data?.input) {
        // User finished speaking, this is their finalized transcript
        this.currentUserText = data.data.input;
        this.callbacks.onUserTranscript(data.data.input);
        this.callbacks.onStateChange('listening');
      }
    } 
    else if (type === 'UserStartedSpeaking') {
      // Barge-in: immediately stop playing previous audio response and empty the queue
      this.playbackQueue = [];
      this.currentUserText = '';
      this.currentAgentText = '';
      this.callbacks.onStateChange('listening');
    }
    else if (type === 'AgentAudioDone') {
      // Audio playback completed for current utterance
      this.callbacks.onStateChange('listening');
    }
    else if (type === 'TurnComplete') {
      // Speech exchange turn completed: save logs to Supabase/localStorage
      if (this.currentUserText.trim() && this.currentAgentText.trim()) {
        this.callbacks.onTurnComplete(this.currentUserText, this.currentAgentText);
      }
      this.currentUserText = '';
      this.currentAgentText = '';
      this.callbacks.onStateChange('listening');
    }
  }

  private cleanup(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Input cleanup
    if (this.inputProcessor) this.inputProcessor.disconnect();
    if (this.inputSource) this.inputSource.disconnect();
    if (this.inputAudioCtx && this.inputAudioCtx.state !== 'closed') {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }

    // Output cleanup
    if (this.outputProcessor) this.outputProcessor.disconnect();
    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }

    // Mic stream cleanup
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }

    // Commit any pending conversation turn before clearing
    if (this.currentUserText.trim() && this.currentAgentText.trim()) {
      this.callbacks.onTurnComplete(this.currentUserText, this.currentAgentText);
    }

    this.playbackQueue = [];
    this.currentUserText = '';
    this.currentAgentText = '';
  }
}
