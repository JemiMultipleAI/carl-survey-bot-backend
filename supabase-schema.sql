-- Supabase Database Schema for Voice AI Survey Bot
-- Run this SQL in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table
CREATE TABLE customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    phone_number TEXT NOT NULL UNIQUE,
    company_name TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    campaign_id TEXT
);

-- Survey calls table
CREATE TABLE survey_calls (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_first_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    call_sid TEXT UNIQUE,
    call_status TEXT NOT NULL CHECK (call_status IN ('queued', 'in-progress', 'completed', 'failed', 'no-answer')),
    call_duration INTEGER, -- in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Survey responses table
CREATE TABLE survey_responses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    call_id UUID NOT NULL REFERENCES survey_calls(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    response_sentiment TEXT CHECK (response_sentiment IN ('positive', 'neutral', 'negative')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_customers_phone ON customers(phone_number);
CREATE INDEX idx_customers_campaign ON customers(campaign_id);
CREATE INDEX idx_survey_calls_status ON survey_calls(call_status);
CREATE INDEX idx_survey_calls_sid ON survey_calls(call_sid);
CREATE INDEX idx_survey_calls_created ON survey_calls(created_at);
CREATE INDEX idx_survey_responses_call_id ON survey_responses(call_id);
CREATE INDEX idx_survey_responses_question ON survey_responses(question_number);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_survey_calls_updated_at 
    BEFORE UPDATE ON survey_calls 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all data
CREATE POLICY "Service role can access all data" ON customers
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all data" ON survey_calls
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all data" ON survey_responses
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to read data (for frontend)
CREATE POLICY "Authenticated users can read customers" ON customers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read calls" ON survey_calls
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read responses" ON survey_responses
    FOR SELECT USING (auth.role() = 'authenticated');

-- Insert some sample data for testing
INSERT INTO customers (first_name, last_name, phone_number, company_name, campaign_id) VALUES
('John', 'Smith', '+61412345678', 'ABC Corp', 'test-campaign-1'),
('Sarah', 'Jones', '+61423456789', 'XYZ Ltd', 'test-campaign-1'),
('Mike', 'Wilson', '+61434567890', 'Tech Solutions', 'test-campaign-1');

-- Create a view for call analytics
CREATE VIEW call_analytics AS
SELECT 
    DATE(created_at) as call_date,
    call_status,
    COUNT(*) as call_count,
    AVG(call_duration) as avg_duration,
    COUNT(CASE WHEN call_status = 'completed' THEN 1 END) as completed_calls,
    COUNT(CASE WHEN call_status = 'failed' THEN 1 END) as failed_calls,
    COUNT(CASE WHEN call_status = 'no-answer' THEN 1 END) as no_answer_calls
FROM survey_calls
GROUP BY DATE(created_at), call_status
ORDER BY call_date DESC, call_status;

