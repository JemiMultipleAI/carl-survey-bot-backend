import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { customerRoutes } from './routes/customerRoutes';
import { callRoutes } from './routes/callRoutes';
import { reportRoutes } from './routes/reportRoutes';
import { elevenlabsWebhook } from './webhooks/elevenlabsWebhook';

// Load environment variables from .env file
dotenv.config();

// Debug: Check if environment variables are loaded
console.log('🔧 Environment Variables:');
console.log('ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Not set');
console.log('ELEVENLABS_AGENT_ID:', process.env.ELEVENLABS_AGENT_ID ? '✅ Set' : '❌ Not set');
console.log('ELEVENLABS_AGENT_PHONE_NUMBER_ID:', process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID ? '✅ Set' : '❌ Not set');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '⚠️  Not set (optional)');
console.log('WEBHOOK_BASE_URL:', process.env.WEBHOOK_BASE_URL || 'http://localhost:3001');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/customers', customerRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/reports', reportRoutes);

// Webhooks
app.use('/webhook/elevenlabs', elevenlabsWebhook);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📞 Webhook URL: ${process.env.WEBHOOK_BASE_URL}`);
});
