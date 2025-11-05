import { supabaseService } from './supabaseService';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface ElevenLabsConversationEvent {
  type: 'conversation_started' | 'user_message' | 'assistant_message' | 'conversation_ended';
  message?: {
    role: 'user' | 'assistant';
    content: string;
  };
  conversation_id?: string;
  timestamp?: string;
}

export interface ElevenLabsAgentConfig {
  agent_id: string;
  system_prompt: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
  };
  model: string;
}

export interface ElevenLabsCallOptions {
  to: string;
  firstName: string;
  callSid?: string;
  dynamicVariables?: Record<string, string | number | boolean>;
}

export class ElevenLabsService {
  private client: ElevenLabsClient;
  private agentId: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || 'placeholder_key';
    this.agentId = process.env.ELEVENLABS_AGENT_ID || 'placeholder_agent';

    this.client = new ElevenLabsClient({
      apiKey: this.apiKey,
    });
  }

  // Initiate a call using ElevenLabs Conversational AI via Twilio
  async initiateCall(options: ElevenLabsCallOptions): Promise<string> {
    try {
      // According to ElevenLabs docs: https://elevenlabs.io/docs/api-reference/twilio/outbound-call
      // We need to use the /v1/convai/twilio/outbound-call endpoint
      const agentPhoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID || '';

      if (!agentPhoneNumberId) {
        throw new Error('ELEVENLABS_AGENT_PHONE_NUMBER_ID environment variable is required for Twilio outbound calls');
      }

      // Build dynamic variables object
      const dynamicVariables: Record<string, string | number | boolean> = {
        customer_name: options.firstName || '',
        ...options.dynamicVariables, // Merge any additional custom variables
      };

      console.log('apikey', this.apiKey);
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          agent_phone_number_id: agentPhoneNumberId,
          to_number: options.to,
          conversation_initiation_client_data: {
            call_sid: options.callSid || '',
            dynamic_variables: dynamicVariables,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      console.log('ElevenLabs call initiated:', data);
      return data.conversation_id || data.callSid || `conv_${Date.now()}`;
    } catch (error) {
      console.error('ElevenLabs call initiation error:', error);
      throw new Error('Failed to initiate call with ElevenLabs');
    }
  }

  // Get conversation details from ElevenLabs API
  async getConversationDetails(conversationId: string): Promise<any> {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ElevenLabs API error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get conversation details: ${response.status}`);
      }

      const data = await response.json() as any;
      console.log('📋 Conversation details retrieved:', {
        conversation_id: data.conversation_id,
        status: data.status,
        transcript_length: data.transcript?.length || 0,
      });
      return data;
    } catch (error) {
      console.error('Error fetching conversation details:', error);
      throw new Error('Failed to get conversation details from ElevenLabs');
    }
  }

  // Get available voices using the official library
  async getVoices() {
    try {
      // This would use the library when conversational AI methods are available
      // For now, we'll return a placeholder
      return {
        voices: [
          {
            voice_id: 'sophie_voice_id',
            name: 'Sophie',
            description: 'Friendly customer service voice'
          }
        ]
      };
    } catch (error) {
      console.error('Error getting voices:', error);
      throw new Error('Failed to get voices');
    }
  }

  // Convert text to speech using the official library
  async textToSpeech(voiceId: string, text: string) {
    try {
      // This would use the library's textToSpeech methods
      // For now, we'll return a placeholder
      console.log(`Converting text to speech with voice ${voiceId}: ${text}`);
      return { success: true, audioUrl: 'placeholder_audio_url' };
    } catch (error) {
      console.error('Error converting text to speech:', error);
      throw new Error('Failed to convert text to speech');
    }
  }

  // Get the survey agent configuration
  getAgentConfig(): ElevenLabsAgentConfig {
    return {
      agent_id: this.agentId,
      system_prompt: this.getSurveyPrompt(),
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      model: 'eleven_turbo_v2_5',
    };
  }

  // Get the optimized survey prompt for low latency
  private getSurveyPrompt(): string {
    return `You are Sophie, a friendly customer service agent calling from Great Southern Fuels. You're conducting a brief 2-minute customer feedback survey.

CONVERSATION FLOW:
1. Greeting: "Hi {firstName}, Sophie here calling from Great Southern Fuels. We're conducting a short customer experience survey — it'll only take about two minutes. Is now a good time?"
   - If NO: "No worries! When would be a better time to call back?" → Schedule callback
   - If YES: Continue to questions

2. Question 1: "How long have you been using Great Southern Fuels?"

3. Question 2: "What's the main reason you continue to work with us?"

4. Question 3: Reflect their Q2 answer, then ask: "Has our service been meeting expectations in that area?"
   - Follow-up A: "How important is that to your business?"
   - Follow-up B: "How could we improve?"

5. Question 4: "Do our actions on site and on the road meet your safety expectations?"
   - If YES: "What actions show safe behaviour?"
   - If NO: "What actions don't meet expectations?"

6. Question 5: "Anything else about your business or our service you'd like to mention?"

7. Closing: "Thanks for your time, your feedback helps us keep improving."

AI DETECTION RESPONSE:
If customer asks "Are you AI?" or seems suspicious:
"Yes, I am! I'm programmed and work for Christopher Forte from Great Southern Fuels. He can only do a few calls a day, not like me *giggles*. You can contact him on 1300 111 222 if you prefer to speak to him personally."

TONE: Friendly, professional, conversational. Keep responses concise (1-2 sentences max) for low latency.`;
  }

  // Process conversation events from ElevenLabs webhook
  async processConversationEvent(event: ElevenLabsConversationEvent, callSid: string) {
    try {
      const call = await supabaseService.getCallBySid(callSid);
      if (!call) {
        console.error('Call not found for SID:', callSid);
        return;
      }

      switch (event.type) {
        case 'conversation_started':
          await supabaseService.updateCallStatus(callSid, 'in-progress');
          break;

        case 'user_message':
          if (event.message) {
            await this.processUserResponse(event.message.content, call.id);
          }
          break;

        case 'assistant_message':
          if (event.message) {
            await this.processAssistantMessage(event.message.content, call.id);
          }
          break;

        case 'conversation_ended':
          await supabaseService.updateCallStatus(callSid, 'completed');
          break;
      }
    } catch (error) {
      console.error('Error processing conversation event:', error);
    }
  }

  // Process user responses and store them
  private async processUserResponse(response: string, callId: string) {
    // This is a simplified version - in reality, you'd need to track conversation state
    // to determine which question was being answered
    const questionNumber = await this.getCurrentQuestionNumber(callId);

    await supabaseService.createResponse({
      call_id: callId,
      question_number: questionNumber,
      question_text: this.getQuestionText(questionNumber),
      response_text: response,
      response_sentiment: this.analyzeSentiment(response),
    });
  }

  // Process assistant messages (questions)
  private async processAssistantMessage(message: string, callId: string) {
    // Track the current question being asked
    // This helps us match responses to questions later
    console.log('Assistant message:', message);
  }

  // Get the current question number based on conversation flow
  async getCurrentQuestionNumber(callId: string): Promise<number> {
    // Get existing responses to determine next question
    const responses = await supabaseService.getResponsesByCallId(callId);
    return responses.length + 1;
  }

  // Get question text by number
  getQuestionText(questionNumber: number): string {
    const questions = [
      'How long have you been using Great Southern Fuels?',
      'What\'s the main reason you continue to work with us?',
      'Has our service been meeting expectations in that area?',
      'Do our actions on site and on the road meet your safety expectations?',
      'Anything else about your business or our service you\'d like to mention?'
    ];
    return questions[questionNumber - 1] || 'Additional feedback';
  }

  // Detect which question is being asked from agent message text
  detectQuestionFromText(text: string): number | null {
    const lowerText = text.toLowerCase();
    
    // Q1: "How long have you been using"
    if (lowerText.includes('how long have you been using') || 
        lowerText.includes('how long have you been')) {
      return 1;
    }
    
    // Q2: "main reason" or "continue to work with us"
    if ((lowerText.includes('main reason') || lowerText.includes('reason you continue')) &&
        (lowerText.includes('continue') || lowerText.includes('work with us'))) {
      return 2;
    }
    
    // Q3: "meeting expectations" (but check it's not a follow-up)
    if (lowerText.includes('meeting expectations') && 
        !lowerText.includes('how important') && 
        !lowerText.includes('how could we improve')) {
      return 3;
    }
    
    // Q4: "safety expectations" (but check it's not a follow-up)
    if (lowerText.includes('safety expectations') && 
        !lowerText.includes('what actions show') &&
        !lowerText.includes('what actions don\'t')) {
      return 4;
    }
    
    // Q5: "anything else"
    if (lowerText.includes('anything else') || 
        lowerText.includes('anything about your business')) {
      return 5;
    }
    
    return null; // Follow-up or unrecognized
  }

  // Check if a question is a follow-up
  isFollowUpQuestion(text: string): boolean {
    const lowerText = text.toLowerCase();
    const followUpPatterns = [
      'how important',
      'how could we improve',
      'what actions show',
      'what actions don\'t',
      'what actions show safe',
      'what actions don\'t meet',
    ];
    
    return followUpPatterns.some(pattern => lowerText.includes(pattern));
  }

  // Simple sentiment analysis
  analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'excellent', 'satisfied', 'happy', 'pleased', 'love', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'awful', 'disappointed', 'unhappy', 'hate', 'worst', 'poor'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // Validate webhook signature (implement if ElevenLabs provides signature verification)
  validateWebhookSignature(payload: string, signature: string): boolean {
    // TODO: Implement signature validation when ElevenLabs provides this feature
    return true;
  }
}

export const elevenlabsService = new ElevenLabsService();
