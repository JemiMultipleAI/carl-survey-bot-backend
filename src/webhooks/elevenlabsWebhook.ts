import { Router, Request, Response } from 'express';
import { elevenlabsService } from '../services/elevenlabsService';
import { supabaseService } from '../services/supabaseService';

const router = Router();

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
        // Handle post_call_transcription event - contains complete transcript
        if (eventType === 'post_call_transcription') {
          console.log('📝 Processing post-call transcription');
          const conversationId = event.data?.conversation_id;
          const transcript = event.data?.transcript || [];
          const dataCollection = event.data?.analysis?.data_collection_results || {};
          
          console.log('🔍 Looking for call with conversation ID:', conversationId);
          
          if (conversationId) {
            const call = await supabaseService.getCallBySid(conversationId);
            console.log('🔍 Call lookup result:', call ? `Found call ${call.id}` : 'Call not found');
            
            if (call) {
              console.log(`📊 Found call: ${call.id}`);
              
              // Process all user responses from data collection
              const questionMapping: Record<string, { number: number; text: string }> = {
                'q1': { number: 1, text: 'How long have you been using Great Southern Fuels?' },
                'q2': { number: 2, text: 'What\'s the main reason you continue to work with us?' },
                'q3': { number: 3, text: 'Has our service been meeting expectations in that area?' },
                'q4': { number: 4, text: 'Do our actions on site and on the road meet your safety expectations?' },
                'q5': { number: 5, text: 'Anything else about your business or our service you\'d like to mention?' },
              };

              // Save each extracted response
              console.log(`💾 Processing ${Object.keys(dataCollection).length} data collection entries...`);
              let savedCount = 0;
              
              for (const [key, data] of Object.entries(dataCollection)) {
                const question = questionMapping[key.toLowerCase()];
                const responseData = data as any;
                if (question && responseData.value) {
                  console.log(`💾 Saving Q${question.number}: ${responseData.value}`);
                  await supabaseService.createResponse({
                    call_id: call.id,
                    question_number: question.number,
                    question_text: question.text,
                    response_text: responseData.value,
                    response_sentiment: elevenlabsService.analyzeSentiment(responseData.value),
                  });
                  savedCount++;
                }
              }
              
              console.log(`✅ Saved ${savedCount} responses to database`);

              // Update call status to completed
              const callDuration = event.data?.metadata?.call_duration_secs;
              await supabaseService.updateCallStatus(conversationId, 'completed', callDuration);
              
              console.log('✅ Completed and saved all responses to database');
            } else {
              console.log('⚠️  Call not found for conversation:', conversationId);
            }
          }
        }
        
        if (eventType === 'conversation_started') {
          console.log('🚀 Conversation started');
          if (callSid) {
            await supabaseService.updateCallStatus(callSid, 'in-progress');
          }
        }
        
        if (eventType === 'user_message' || eventType === 'user_speech') {
          console.log('👤 User message:', event.message?.content || event.text);
          
          if (callSid) {
            const call = await supabaseService.getCallBySid(callSid);
            if (call) {
              // Save user response
              const questionNumber = await elevenlabsService.getCurrentQuestionNumber(call.id);
              
              await supabaseService.createResponse({
                call_id: call.id,
                question_number: questionNumber,
                question_text: elevenlabsService.getQuestionText(questionNumber),
                response_text: event.message?.content || event.text || '',
                response_sentiment: elevenlabsService.analyzeSentiment(event.message?.content || event.text || ''),
              });
              
              console.log('💾 Saved response to database');
            }
          }
        }
        
        if (eventType === 'assistant_message' || eventType === 'assistant_speech') {
          console.log('🤖 Assistant message:', event.message?.content || event.text);
        }
        
        if (eventType === 'conversation_ended') {
          console.log('✅ Conversation ended');
          if (callSid) {
            await supabaseService.updateCallStatus(callSid, 'completed');
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
