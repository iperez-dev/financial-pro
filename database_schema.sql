-- Financial Pro Database Schema for Supabase
-- This file contains the SQL commands to create all necessary tables

-- Enable Row Level Security (RLS) for all tables
-- Users will only see their own data

-- =============================================
-- USERS TABLE (handled by Supabase Auth)
-- =============================================
-- Supabase automatically creates auth.users table
-- We'll create a profiles table to extend user data

CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and edit their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- CATEGORIES TABLE
-- =============================================
CREATE TABLE public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    keywords TEXT[], -- Array of keywords for auto-categorization
    group_name TEXT DEFAULT 'Other', -- For grouping categories (Utilities, Transportation, etc.)
    color TEXT DEFAULT '#3B82F6', -- Hex color for UI display
    is_default BOOLEAN DEFAULT FALSE, -- System default categories
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique category names per user
    UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own categories" ON public.categories
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- TRANSACTIONS TABLE
-- =============================================
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Transaction details
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL, -- Supports up to $999,999,999.99
    transaction_date DATE NOT NULL,
    posting_date DATE,
    
    -- Categorization
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name TEXT, -- Denormalized for performance and history
    
    -- Status tracking
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'saved', 'income')),
    
    -- File/import tracking
    file_name TEXT, -- Original file name
    file_hash TEXT, -- Hash of file content to prevent duplicates
    transaction_key TEXT, -- Unique key for this transaction
    
    -- Merchant learning
    merchant_name TEXT, -- Extracted merchant name
    is_learned BOOLEAN DEFAULT FALSE, -- Whether this was auto-categorized
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique transactions per user (prevent duplicates)
    UNIQUE(user_id, transaction_key)
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own transactions" ON public.transactions
    FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_category ON public.transactions(user_id, category_id);
CREATE INDEX idx_transactions_merchant ON public.transactions(user_id, merchant_name);
CREATE INDEX idx_transactions_status ON public.transactions(user_id, status);

-- =============================================
-- MERCHANT MAPPINGS TABLE
-- =============================================
CREATE TABLE public.merchant_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    merchant_name TEXT NOT NULL, -- Cleaned merchant name
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    category_name TEXT NOT NULL, -- Denormalized for performance
    
    -- Learning metadata
    learned_from_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 0.0 to 1.0
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique merchant mappings per user
    UNIQUE(user_id, merchant_name)
);

-- Enable RLS
ALTER TABLE public.merchant_mappings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own merchant mappings" ON public.merchant_mappings
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- ZELLE RECIPIENTS TABLE
-- =============================================
CREATE TABLE public.zelle_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    recipient_name TEXT NOT NULL, -- Name as it appears in Zelle transactions
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    category_name TEXT NOT NULL, -- Denormalized for performance
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique recipient mappings per user
    UNIQUE(user_id, recipient_name)
);

-- Enable RLS
ALTER TABLE public.zelle_recipients ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own zelle recipients" ON public.zelle_recipients
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- TRANSACTION OVERRIDES TABLE
-- =============================================
CREATE TABLE public.transaction_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    transaction_key TEXT NOT NULL, -- Key to identify the transaction
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    category_name TEXT NOT NULL, -- Denormalized for performance
    
    -- Override metadata
    override_reason TEXT DEFAULT 'manual', -- 'manual', 'correction', etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique overrides per user per transaction
    UNIQUE(user_id, transaction_key)
);

-- Enable RLS
ALTER TABLE public.transaction_overrides ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own transaction overrides" ON public.transaction_overrides
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- FILE UPLOADS TABLE
-- =============================================
CREATE TABLE public.file_uploads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT NOT NULL, -- SHA-256 hash to prevent duplicate uploads
    file_type TEXT NOT NULL, -- 'csv', 'xlsx', 'xls'
    
    -- Processing results
    total_transactions INTEGER DEFAULT 0,
    processed_transactions INTEGER DEFAULT 0,
    new_transactions INTEGER DEFAULT 0,
    duplicate_transactions INTEGER DEFAULT 0,
    
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Prevent duplicate file uploads
    UNIQUE(user_id, file_hash)
);

-- Enable RLS
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own file uploads" ON public.file_uploads
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchant_mappings_updated_at BEFORE UPDATE ON public.merchant_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zelle_recipients_updated_at BEFORE UPDATE ON public.zelle_recipients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transaction_overrides_updated_at BEFORE UPDATE ON public.transaction_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Function to create default categories for new users
CREATE OR REPLACE FUNCTION create_default_categories_for_user(user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.categories (user_id, name, keywords, group_name, is_default) VALUES
    -- Housing
    (user_id, 'Mortgage', ARRAY['mortgage', 'home loan', 'principal', 'interest'], 'Housing', TRUE),
    (user_id, 'HOA', ARRAY['hoa', 'homeowners association', 'association'], 'Housing', TRUE),
    
    -- Utilities
    (user_id, 'City Gas', ARRAY['city gas', 'gas company', 'natural gas'], 'Utilities', TRUE),
    (user_id, 'FPL', ARRAY['fpl', 'florida power', 'electric', 'electricity'], 'Utilities', TRUE),
    (user_id, 'Internet', ARRAY['internet', 'wifi', 'broadband', 'comcast', 'xfinity'], 'Utilities', TRUE),
    (user_id, 'Phone', ARRAY['phone', 'mobile', 'cell', 'verizon', 'att', 't-mobile'], 'Utilities', TRUE),
    
    -- Transportation
    (user_id, 'Toll', ARRAY['toll', 'turnpike', 'sunpass', 'ezpass'], 'Transportation', TRUE),
    (user_id, 'Gas Station', ARRAY['gas', 'fuel', 'shell', 'bp', 'exxon', 'chevron'], 'Transportation', TRUE),
    (user_id, 'Car Insurance', ARRAY['car insurance', 'auto insurance', 'geico', 'progressive'], 'Transportation', TRUE),
    
    -- Financial
    (user_id, 'Student Loan', ARRAY['student loan', 'education loan', 'navient', 'sallie mae'], 'Financial', TRUE),
    (user_id, 'Credit Card Jenny', ARRAY['jenny credit', 'jenny card'], 'Financial', TRUE),
    (user_id, 'Credit Card Ivan', ARRAY['ivan credit', 'ivan card'], 'Financial', TRUE),
    
    -- Personal
    (user_id, 'ChildCare', ARRAY['childcare', 'daycare', 'babysitter', 'nanny'], 'Personal', TRUE);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- VIEWS FOR REPORTING
-- =============================================

-- Monthly expense summary view
CREATE VIEW monthly_expense_summary AS
SELECT 
    user_id,
    DATE_TRUNC('month', transaction_date) as month,
    category_name,
    COUNT(*) as transaction_count,
    SUM(ABS(amount)) as total_amount
FROM public.transactions 
WHERE amount < 0 -- Only expenses
GROUP BY user_id, DATE_TRUNC('month', transaction_date), category_name;

-- Category summary view
CREATE VIEW category_summary AS
SELECT 
    t.user_id,
    c.group_name,
    t.category_name,
    COUNT(*) as transaction_count,
    SUM(ABS(t.amount)) as total_amount,
    AVG(ABS(t.amount)) as avg_amount
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
WHERE t.amount < 0 -- Only expenses
GROUP BY t.user_id, c.group_name, t.category_name;

-- Enable RLS on views
ALTER VIEW monthly_expense_summary SET (security_invoker = true);
ALTER VIEW category_summary SET (security_invoker = true);

-- =============================================
-- SAMPLE DATA (for testing)
-- =============================================
-- This will be populated when users sign up and upload files
