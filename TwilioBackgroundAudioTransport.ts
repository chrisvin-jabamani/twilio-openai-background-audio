import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions';
import type { TwilioRealtimeTransportLayerOptions } from '@openai/agents-extensions';
import { TransportLayerAudio } from '@openai/agents/realtime';
import * as fs from 'fs';
import * as path from 'path';
import type { WebSocket as NodeWebSocket } from 'ws';

export interface TwilioBackgroundAudioTransportOptions extends TwilioRealtimeTransportLayerOptions {
  backgroundAudioPath?: string;
}

export class TwilioBackgroundAudioTransport extends TwilioRealtimeTransportLayer {
  private backgroundAudio: Buffer | null = null;
  private backgroundPosition: number = 0;
  private backgroundInterval: NodeJS.Timeout | null = null;
  private streamSid: string | null = null;
  private isAgentSpeaking: boolean = false;
  private twilioWs: WebSocket | NodeWebSocket;
  private pendingMarkName: string | null = null;
  private readonly backgroundAudioPath: string;

  constructor(options: TwilioBackgroundAudioTransportOptions) {
    super(options);
    
    try {
      this.twilioWs = options.twilioWebSocket;
      this.backgroundAudioPath = options.backgroundAudioPath ?? 
        path.join(process.cwd(), 'sample-background-mulaw-8khz.raw');
      
      this.loadBackgroundAudio();
      this.setupTwilioListeners();
    } catch (err) {
      console.error('Error initializing TwilioBackgroundAudioTransport:', err);
      throw err;
    }
  }

  private setupTwilioListeners(): void {
    try {
      this.twilioWs.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data.toString());
          
          if (data.event === 'start') {
            this.streamSid = data.start.streamSid;
            this.startBackgroundAudio();
          }
          
          if (data.event === 'mark') {
            if (this.pendingMarkName && data.mark.name === this.pendingMarkName) {
              this.isAgentSpeaking = false;
              this.pendingMarkName = null;
              this.startBackgroundAudio();
            }
          }
        } catch (parseErr) {
          // Ignore parsing errors for non-JSON messages
        }
      });
    } catch (err) {
      console.error('Error setting up Twilio listeners:', err);
      throw err;
    }
  }

  private loadBackgroundAudio(): void {
    try {
      this.backgroundAudio = fs.readFileSync(this.backgroundAudioPath);
      console.log('✅ Background audio loaded successfully');
    } catch (err) {
      console.warn('⚠️  Background audio not loaded:', err);
      this.backgroundAudio = null;
    }
  }

  private startBackgroundAudio(): void {
    if (!this.backgroundAudio || this.backgroundInterval) {
      return;
    }

    const CHUNK_SIZE = 160;
    const INTERVAL_MS = 20;
    let expectedTime = Date.now() + INTERVAL_MS;
    
    const sendChunk = () => {
      try {
        if (!this.streamSid) {
          return;
        }
        
        const chunk = Buffer.alloc(CHUNK_SIZE);
        
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const bgIndex = this.backgroundPosition % this.backgroundAudio!.length;
          chunk[i] = this.backgroundAudio![bgIndex];
          this.backgroundPosition++;
        }

        this.twilioWs.send(JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: {
            payload: chunk.toString('base64')
          }
        }));
        
        expectedTime += INTERVAL_MS;
        const drift = Date.now() - expectedTime;
        const nextDelay = Math.max(0, INTERVAL_MS - drift);
        
        this.backgroundInterval = setTimeout(sendChunk, nextDelay) as any;
      } catch (err) {
        console.error('Error in background audio send:', err);
      }
    };
    
    try {
      this.backgroundInterval = setTimeout(sendChunk, INTERVAL_MS) as any;
    } catch (err) {
      console.error('Error starting background audio:', err);
    }
  }

  private stopBackgroundAudio(): void {
    if (this.backgroundInterval) {
      clearTimeout(this.backgroundInterval as any);
      this.backgroundInterval = null;
    }
  }

  private clearTwilioAudioBuffer(): void {
    try {
      if (!this.streamSid) {
        return;
      }
      
      this.twilioWs.send(JSON.stringify({
        event: 'clear',
        streamSid: this.streamSid
      }));
    } catch (err) {
      console.error('Error sending clear message:', err);
    }
  }

  protected _onAudio(audioEvent: TransportLayerAudio): void {
    try {
      if (!this.isAgentSpeaking) {
        this.isAgentSpeaking = true;
        this.stopBackgroundAudio();
        this.clearTwilioAudioBuffer();
      }
      
      super._onAudio(audioEvent);
    } catch (err) {
      console.error('Error in _onAudio:', err);
      super._onAudio(audioEvent);
    }
  }

  private sendEndOfAudioMark(): void {
    try {
      if (!this.streamSid) {
        return;
      }
      
      const markName = `agent_audio_end_${Date.now()}`;
      this.pendingMarkName = markName;
      
      this.twilioWs.send(JSON.stringify({
        event: 'mark',
        streamSid: this.streamSid,
        mark: {
          name: markName
        }
      }));
    } catch (err) {
      console.error('Error sending Twilio mark:', err);
    }
  }

  public setupSessionListeners(session: any): void {
    try {
      session.on('transport_event', (event: any) => {
        try {
          if (event.type === 'response.done') {
            setTimeout(() => {
              this.sendEndOfAudioMark();
            }, 100);
          }
        } catch (err) {
          console.error('Error handling transport_event:', err);
        }
      });
      
      session.on('audio_interrupted', () => {
        try {
          this.isAgentSpeaking = false;
          this.pendingMarkName = null;
          this.startBackgroundAudio();
        } catch (err) {
          console.error('Error handling audio_interrupted:', err);
        }
      });
    } catch (err) {
      console.error('Error in setupSessionListeners:', err);
      throw err;
    }
  }

  close(): void {
    try {
      this.stopBackgroundAudio();
      super.close();
    } catch (err) {
      console.error('Error closing:', err);
    }
  }
}