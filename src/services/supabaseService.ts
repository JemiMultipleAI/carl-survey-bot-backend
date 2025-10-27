import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client lazily to ensure environment variables are loaded
let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'placeholder_key';
    
    console.log('🔧 Supabase Configuration:');
    console.log('SUPABASE_URL:', supabaseUrl !== 'https://placeholder.supabase.co' ? '✅ Set' : '❌ Using placeholder');
    console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey !== 'placeholder_key' ? '✅ Set' : '❌ Using placeholder');
    
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClient;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name?: string;
  phone_number: string;
  company_name?: string;
  uploaded_at: string;
  campaign_id?: string;
}

export interface SurveyCall {
  id: string;
  customer_first_name: string;
  customer_phone: string;
  call_sid: string;
  call_status: 'queued' | 'in-progress' | 'completed' | 'failed' | 'no-answer';
  call_duration?: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponse {
  id: string;
  call_id: string;
  question_number: number;
  question_text: string;
  response_text: string;
  response_sentiment?: 'positive' | 'neutral' | 'negative';
  created_at: string;
}

export class SupabaseService {
  // Customer operations
  async createCustomer(customer: Omit<Customer, 'id' | 'uploaded_at'>) {
    const { data, error } = await getSupabase()
      .from('customers')
      .insert([customer])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getCustomers() {
    const { data, error } = await getSupabase()
      .from('customers')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getCustomerById(id: string) {
    const { data, error } = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Call operations
  async createCall(call: Omit<SurveyCall, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await getSupabase()
      .from('survey_calls')
      .insert([call])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateCallStatus(callSid: string, status: SurveyCall['call_status'], duration?: number) {
    const { data, error } = await getSupabase()
      .from('survey_calls')
      .update({ 
        call_status: status, 
        call_duration: duration,
        updated_at: new Date().toISOString()
      })
      .eq('call_sid', callSid)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getCallById(id: string) {
    const { data, error } = await getSupabase()
      .from('survey_calls')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getCallBySid(callSid: string) {
    const { data, error } = await getSupabase()
      .from('survey_calls')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    if (error) throw error;
    return data;
  }

  async getCalls() {
    const { data, error } = await getSupabase()
      .from('survey_calls')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Response operations
  async createResponse(response: Omit<SurveyResponse, 'id' | 'created_at'>) {
    const { data, error } = await getSupabase()
      .from('survey_responses')
      .insert([response])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getResponsesByCallId(callId: string) {
    const { data, error } = await getSupabase()
      .from('survey_responses')
      .select('*')
      .eq('call_id', callId)
      .order('question_number', { ascending: true });

    if (error) throw error;
    return data;
  }

  // Get all survey responses
  async getAllResponses() {
    const { data, error } = await getSupabase()
      .from('survey_responses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Get all customers
  async getAllCustomers() {
    const { data, error } = await getSupabase()
      .from('customers')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Analytics
  async getCallSummary() {
    const { data: calls, error } = await getSupabase()
      .from('survey_calls')
      .select('call_status, call_duration');

    if (error) throw error;

    const totalCalls = calls.length;
    const completedCalls = calls.filter(c => c.call_status === 'completed').length;
    const failedCalls = calls.filter(c => c.call_status === 'failed').length;
    const noAnswerCalls = calls.filter(c => c.call_status === 'no-answer').length;
    const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
    const averageDuration = completedCalls > 0 
      ? calls.filter(c => c.call_status === 'completed' && c.call_duration)
            .reduce((sum, c) => sum + (c.call_duration || 0), 0) / completedCalls
      : 0;

    return {
      total_calls: totalCalls,
      completed_calls: completedCalls,
      failed_calls: failedCalls,
      no_answer_calls: noAnswerCalls,
      completion_rate: Math.round(completionRate * 100) / 100,
      average_duration: Math.round(averageDuration)
    };
  }
}

export const supabaseService = new SupabaseService();
