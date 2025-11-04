-- Migration: Add customer_id, campaign_id, transcript support, and response timestamps
-- Run this after the initial schema.sql

-- Add customer_id and campaign_id to survey_calls
ALTER TABLE survey_calls 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_survey_calls_customer_id ON survey_calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_survey_calls_campaign_id ON survey_calls(campaign_id);

-- Add response timestamp and follow-up flag to survey_responses
ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS response_timestamp TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_followup BOOLEAN DEFAULT FALSE;

-- Create call_transcripts table for full conversation storage
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    call_id UUID NOT NULL REFERENCES survey_calls(id) ON DELETE CASCADE,
    transcript JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for transcript lookups
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);

-- RLS policies for call_transcripts
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access all transcripts" ON call_transcripts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read transcripts" ON call_transcripts
    FOR SELECT USING (auth.role() = 'authenticated');

