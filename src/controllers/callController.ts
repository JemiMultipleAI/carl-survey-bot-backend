import { Request, Response } from 'express';
import { elevenlabsService } from '../services/elevenlabsService';
import { supabaseService } from '../services/supabaseService';

export class CallController {
  // Test call endpoint for integration testing
  async testCall(req: Request, res: Response) {
    try {
      const { firstName, phoneNumber } = req.body;

      if (!firstName || !phoneNumber) {
        return res.status(400).json({
          error: 'firstName and phoneNumber are required'
        });
      }

      // Validate phone number format
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
        return res.status(400).json({
          error: 'Invalid phone number format'
        });
      }

      // Initiate ElevenLabs call first to get conversation ID
      console.log('📞 Initiating ElevenLabs call...');
      const conversationId = await elevenlabsService.initiateCall({
        to: phoneNumber,
        firstName: firstName,
        callSid: '', // Will be created in database
      });
      
      console.log('✅ ElevenLabs call initiated, conversation ID:', conversationId);

      // Create call record in database with conversation ID
      console.log('💾 Creating call record in Supabase...');
      const call = await supabaseService.createCall({
        customer_first_name: firstName,
        customer_phone: phoneNumber,
        call_sid: conversationId,
        call_status: 'queued',
      });
      
      console.log('✅ Call record created with ID:', call.id);

      res.json({
        success: true,
        callId: call.id,
        callSid: conversationId,
        status: 'queued',
        message: 'Test call initiated successfully'
      });

    } catch (error) {
      console.error('Test call error:', error);
      res.status(500).json({
        error: 'Failed to initiate test call',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Start a single call
  async startCall(req: Request, res: Response) {
    try {
      const { customerId, phoneNumber, firstName } = req.body;

      if (!customerId || !phoneNumber || !firstName) {
        return res.status(400).json({
          error: 'customerId, phoneNumber, and firstName are required'
        });
      }

      // Verify customer exists
      const customer = await supabaseService.getCustomerById(customerId);
      if (!customer) {
        return res.status(404).json({
          error: 'Customer not found'
        });
      }

      // Initiate ElevenLabs call first to get conversation ID
      console.log('📞 Initiating ElevenLabs call...');
      const conversationId = await elevenlabsService.initiateCall({
        to: phoneNumber,
        firstName: firstName,
        callSid: '', // Will be set in database
      });

      console.log('✅ ElevenLabs call initiated, conversation ID:', conversationId);

      // Create call record with conversation ID immediately
      console.log('💾 Creating call record in Supabase...');
      const call = await supabaseService.createCall({
        customer_first_name: firstName,
        customer_phone: phoneNumber,
        call_sid: conversationId,
        customer_id: customerId,
        campaign_id: customer.campaign_id,
        call_status: 'queued',
      });

      console.log('✅ Call record created with ID:', call.id);

      res.json({
        success: true,
        callId: call.id,
        callSid: conversationId,
        status: 'queued'
      });

    } catch (error) {
      console.error('Start call error:', error);
      res.status(500).json({
        error: 'Failed to start call',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Start batch calling campaign
  async startBatchCalls(req: Request, res: Response) {
    try {
      const { customerIds, maxConcurrent = 5 } = req.body;

      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({
          error: 'customerIds array is required'
        });
      }

      const results = [];
      const errors = [];

      // Process calls in batches to respect rate limits
      for (let i = 0; i < customerIds.length; i += maxConcurrent) {
        const batch = customerIds.slice(i, i + maxConcurrent);

        const batchPromises = batch.map(async (customerId: string) => {
          try {
            const customer = await supabaseService.getCustomerById(customerId);
            if (!customer) {
              throw new Error(`Customer ${customerId} not found`);
            }

            // Initiate ElevenLabs call first to get conversation ID
            const conversationId = await elevenlabsService.initiateCall({
              to: customer.phone_number,
              firstName: customer.first_name,
              callSid: '', // Will be set in database
            });

            // Create call record with conversation ID immediately
            const call = await supabaseService.createCall({
              customer_first_name: customer.first_name,
              customer_phone: customer.phone_number,
              call_sid: conversationId,
              customer_id: customerId,
              campaign_id: customer.campaign_id,
              call_status: 'queued',
            });

            return {
              customerId,
              callId: call.id,
              callSid: conversationId,
              status: 'queued'
            };
          } catch (error) {
            return {
              customerId,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add delay between batches to respect rate limits
        if (i + maxConcurrent < customerIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successful = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;

      res.json({
        success: true,
        total: customerIds.length,
        successful,
        failed,
        results
      });

    } catch (error) {
      console.error('Batch calls error:', error);
      res.status(500).json({
        error: 'Failed to start batch calls',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get call details
  async getCall(req: Request, res: Response) {
    try {
      const { callId } = req.params;

      const call = await supabaseService.getCallById(callId);
      if (!call) {
        return res.status(404).json({
          error: 'Call not found'
        });
      }

      const responses = await supabaseService.getResponsesByCallId(callId);

      res.json({
        call,
        responses
      });

    } catch (error) {
      console.error('Get call error:', error);
      res.status(500).json({
        error: 'Failed to get call details',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get ElevenLabs voices
  async getVoices(req: Request, res: Response) {
    try {
      const voices = await elevenlabsService.getVoices();
      res.json(voices);
    } catch (error) {
      console.error('Get voices error:', error);
      res.status(500).json({
        error: 'Failed to get voices',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Test text-to-speech
  async testTextToSpeech(req: Request, res: Response) {
    try {
      const { voiceId, text } = req.body;

      if (!voiceId || !text) {
        return res.status(400).json({
          error: 'voiceId and text are required'
        });
      }

      const result = await elevenlabsService.textToSpeech(voiceId, text);
      res.json(result);
    } catch (error) {
      console.error('Text-to-speech error:', error);
      res.status(500).json({
        error: 'Failed to convert text to speech',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get all calls
  async getCalls(req: Request, res: Response) {
    try {
      const calls = await supabaseService.getCalls();
      res.json(calls);
    } catch (error) {
      console.error('Get calls error:', error);
      res.status(500).json({
        error: 'Failed to get calls',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const callController = new CallController();
