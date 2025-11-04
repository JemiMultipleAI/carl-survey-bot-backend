import { Router, Request, Response } from 'express';
import { elevenlabsService } from '../services/elevenlabsService';
import { supabaseService } from '../services/supabaseService';

const router = Router();

// Helper function to parse transcript and extract survey responses
async function parseTranscriptToResponses(callId: string, transcript: any[], metadata: any) {
  let currentQuestion: number | null = null;
  const callStartTime = metadata.start_time_unix_secs 
    ? new Date(metadata.start_time_unix_secs * 1000)
    : new Date(); // Fallback to current time

  console.log(`📝 Parsing ${transcript.length} transcript entries...`);

  for (let i = 0; i < transcript.length; i++) {
    const entry = transcript[i];
    const role = entry.role || entry.speaker;
    const message = entry.message || entry.response || entry.text || '';
    const timeInCallSecs = entry.time_in_call_secs;

    // Calculate response timestamp
    let responseTimestamp: string | undefined;
    if (timeInCallSecs !== undefined && metadata.start_time_unix_secs) {
      responseTimestamp = new Date((metadata.start_time_unix_secs + timeInCallSecs) * 1000).toISOString();
    } else if (timeInCallSecs !== undefined) {
      // Relative to call start time
      responseTimestamp = new Date(callStartTime.getTime() + timeInCallSecs * 1000).toISOString();
    }

    if (role === 'assistant' || role === 'agent') {
      // Detect which question is being asked
      const detectedQuestion = elevenlabsService.detectQuestionFromText(message);
      const isFollowUp = elevenlabsService.isFollowUpQuestion(message);
      
      if (detectedQuestion) {
        currentQuestion = detectedQuestion;
        console.log(`🤖 Agent asked Q${detectedQuestion}: ${message.substring(0, 50)}...`);
      } else if (isFollowUp && currentQuestion !== null) {
        // Keep current question for follow-up responses
        console.log(`🤖 Follow-up question for Q${currentQuestion}: ${message.substring(0, 50)}...`);
      }
    } else if (role === 'user' && currentQuestion !== null) {
      // Check if previous message was a follow-up
      const previousEntry = i > 0 ? transcript[i - 1] : null;
      const isFollowUp = previousEntry && 
        (previousEntry.role === 'assistant' || previousEntry.role === 'agent') &&
        elevenlabsService.isFollowUpQuestion(
          previousEntry.message || previousEntry.response || ''
        );

      console.log(`👤 User responded to Q${currentQuestion}${isFollowUp ? ' (follow-up)' : ''}: ${message.substring(0, 50)}...`);
      
      await supabaseService.createResponse({
        call_id: callId,
        question_number: currentQuestion,
        question_text: elevenlabsService.getQuestionText(currentQuestion),
        response_text: message,
        response_sentiment: elevenlabsService.analyzeSentiment(message),
        response_timestamp: responseTimestamp,
        is_followup: isFollowUp || false,
      });

      // Reset current question after saving main response (not follow-up)
      if (!isFollowUp) {
        currentQuestion = null;
      }
    }
  }

  console.log('✅ Finished parsing transcript');
}

// ElevenLabs conversation webhook
router.post('/conversation', async (req: Request, res: Response) => {
  try {
    console.log('📞 ElevenLabs Webhook Received:', JSON.stringify(req.body, null, 2));
    
    const event = req.body;
    const eventType = event.type || event.event_type || 'unknown';
    
    // For post_call_transcription, extract from nested data structure
    let callSid: string | undefined;
    if (eventType === 'post_call_transcription') {
      callSid = event.data?.conversation_id 
        || event.data?.metadata?.phone_call?.call_sid
        || event.conversation_id;
    } else {
      // For other event types, use the original logic
      callSid = req.headers['x-call-sid'] as string 
        || req.body.call_sid 
        || req.body.conversation_id 
        || req.body.call_id
        || event.conversation_id;
    }

    console.log('Event Type:', eventType);
    console.log('Call SID:', callSid);

    // Acknowledge receipt immediately
    res.json({ success: true, received: eventType });

    // Process the event asynchronously
    setImmediate(async () => {
      try {
        // Handle conversation ended or post_call_transcription - fetch transcript from API
        if (eventType === 'conversation_ended' || eventType === 'post_call_transcription' || eventType === 'conversation_completed') {
          const conversationId = callSid || event.data?.conversation_id || event.conversation_id;
          
          if (!conversationId) {
            console.log('⚠️  No conversation ID found in webhook');
            return;
          }

          console.log('📝 Processing conversation completion for:', conversationId);
          
          // Find call record
          const call = await supabaseService.getCallBySid(conversationId);
          if (!call) {
            console.log('⚠️  Call not found for conversation:', conversationId);
            return;
          }

          console.log(`📊 Found call: ${call.id}`);

          try {
            // Fetch complete transcript from ElevenLabs API (source of truth)
            console.log('🔍 Fetching conversation details from ElevenLabs API...');
            const conversationData = await elevenlabsService.getConversationDetails(conversationId);
            
            const transcript = conversationData.transcript || [];
            const metadata = conversationData.metadata || {};
            
            console.log(`📋 Received transcript with ${transcript.length} entries`);

            // Store full transcript
            await supabaseService.createTranscript({
              call_id: call.id,
              transcript: transcript,
            });
            console.log('✅ Stored full transcript in database');

            // Parse transcript to extract Q1-Q5 responses
            await parseTranscriptToResponses(call.id, transcript, metadata);

            // Update call status and duration
            const callDuration = metadata.call_duration_secs || event.data?.metadata?.call_duration_secs;
            await supabaseService.updateCallStatus(conversationId, 'completed', callDuration);

            console.log('✅ Completed processing conversation');
          } catch (apiError) {
            console.error('❌ Error fetching from API, trying webhook transcript fallback:', apiError);
            
            // Fallback: Try to use webhook transcript if available
            const webhookTranscript = event.transcript || event.data?.transcript || [];
            if (webhookTranscript.length > 0) {
              console.log('📋 Using webhook transcript as fallback');
              await supabaseService.createTranscript({
                call_id: call.id,
                transcript: webhookTranscript,
              });
              await parseTranscriptToResponses(call.id, webhookTranscript, event.data?.metadata || {});
            }
          }
        }
        
        if (eventType === 'conversation_started') {
          console.log('🚀 Conversation started');
          if (callSid) {
            await supabaseService.updateCallStatus(callSid, 'in-progress');
          }
        }
        
      } catch (error) {
        console.error('Error processing webhook event:', error);
      }
    });

  } catch (error) {
    console.error('ElevenLabs webhook error:', error);
    res.status(500).json({
      error: 'Failed to process conversation event',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Webhook verification endpoint (for some providers)
router.get('/conversation', async (req: Request, res: Response) => {
  res.json({ status: 'webhook_endpoint_ready' });
});

export { router as elevenlabsWebhook };
