# Background Audio for OpenAI Voice Agents

Add realistic background audio to speech-to-speech voice agents using OpenAI's Realtime API and Twilio.

**📖 [Read the technical writeup]([https://your-blog-link.com](https://chrisvin.substack.com/p/background-audio-for-speech-to-speech))**

---

## Overview

Extends OpenAI's `TwilioRealtimeTransportLayer` to play continuous background audio during calls. Audio automatically mutes when the agent speaks and resumes when finished.

**Key Features:**
- Background audio plays during silence
- Automatic muting during agent speech
- Zero audio bleed-through
- Sample audio file included

---

## Prerequisites

- Node.js 18+
- OpenAI API key
- Twilio account

---

## Installation
```bash
git clone https://github.com/chrisvin-jabamani/twilio-openai-background-audio.git
cd twilio-openai-background-audio
npm install
```

Create `.env`:
```env
OPENAI_API_KEY=sk-...
PORT=5050
```

---

## Quick Start
```typescript
import { TwilioBackgroundAudioTransport } from './TwilioBackgroundAudioTransport';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

const agent = new RealtimeAgent({ 
  name: 'Assistant', 
  instructions: 'You are a helpful assistant...' 
});

const transport = new TwilioBackgroundAudioTransport({
  twilioWebSocket: connection,
  backgroundAudioPath: './sample-background-mulaw-8khz.raw' // Optional
});

const session = new RealtimeSession(agent, { transport });
transport.setupSessionListeners(session); // Required
await session.connect({ apiKey: process.env.OPENAI_API_KEY });
```

---

## Audio Requirements

Background audio must be **μ-law encoded at 8kHz**.

**Convert your audio:**
```bash
ffmpeg -i input.mp3 -ar 8000 -ac 1 -acodec pcm_mulaw output.raw
```

A sample file is included: `sample-background-mulaw-8khz.raw`

---

## How It Works

1. **Speech Detection** - Tracks when agent starts/stops speaking using `_onAudio()` override and `response.done` events
2. **Playback Detection** - Uses Twilio mark events to detect when audio finishes playing to caller
3. **Buffer Management** - Sends `clear` event before agent speech to prevent audio overlap

**📖 [Full technical details](https://your-blog-link.com)**

---

## API Reference

### `TwilioBackgroundAudioTransport`

**Constructor Options:**
- `twilioWebSocket` *(required)* - WebSocket from Twilio
- `backgroundAudioPath` *(optional)* - Path to audio file (default: `./sample-background-mulaw-8khz.raw`)

**Methods:**
- `setupSessionListeners(session)` - Must be called after creating session

---

## Troubleshooting

**No background audio:**
- Verify audio file is μ-law 8kHz format
- Ensure `setupSessionListeners()` is called

**Audio overlap:**
- Check that `clear` events are being sent
- Verify `isAgentSpeaking` flag logic

---

## Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
```

---

## License

MIT

---

## Resources

- [Technical Writeup](https://chrisvin.substack.com/p/background-audio-for-speech-to-speech)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/twiml/stream)
