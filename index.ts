import Fastify from 'fastify';
import dotenv from 'dotenv';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { TwilioBackgroundAudioTransport } from './TwilioBackgroundAudioTransport.js';
import process from 'node:process';

// Load environment variables
dotenv.config();

const { OPENAI_API_KEY } = process.env;
if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

const PORT = +(process.env.PORT || 5050);

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Create a simple demo agent
const demoAgent = new RealtimeAgent({
  name: 'Assistant',
  instructions: `You are a friendly AI assistant`,
});

// Incoming call route - returns TwiML to connect to media stream
fastify.all('/incoming-call', async (request, reply) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Connect>
</Response>`;
  
  reply.type('text/xml').send(twiml);
});

// WebSocket route for media stream
fastify.register(async (scopedFastify: FastifyInstance) => {
  scopedFastify.get(
    '/media-stream',
    { websocket: true },
    async (connection: any) => {
      try {
        console.log('📞 Call connected to media stream');

        // Initialize the custom transport with background audio
        const twilioTransport = new TwilioBackgroundAudioTransport({ 
          twilioWebSocket: connection 
        });

        const session = new RealtimeSession(demoAgent, {
          transport: twilioTransport,
          model: 'gpt-realtime-mini',
        });

        // Setup session listeners for background audio
        twilioTransport.setupSessionListeners(session);

        await session.connect({ apiKey: OPENAI_API_KEY });

      } catch (err: any) {
        console.error('❌ WebSocket error:', err.message);
        connection.close();
      }
    }
  );
});

// Start server
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`\n🚀 Server listening on port ${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    fastify.close();
    process.exit(0);
  });