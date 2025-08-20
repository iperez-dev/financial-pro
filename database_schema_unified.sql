-- Financial Pro Database Schema - Unified & Flexible
-- Single comprehensive schema with flexible category management
-- Users can fully customize categories to match their unique financial profiles

-- =============================================
-- CORE USER MANAGEMENT
-- =============================================

-- Extend Supabase auth.users with profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    user_role TEXT DEFAULT 'individual' CHECK (user_role IN ('individual', 'business_owner', 'business_client')),
    business_id UUID, -- Will add FK constraint after businesses table is created
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only manage their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- FLEXIBLE CATEGORIES SYSTEM
-- =============================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    business_id UUID, -- Will add FK constraint after businesses table is created
    
    -- Core category info
    name TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}', -- Array of keywords for auto-categorization
    group_name TEXT DEFAULT 'Other', -- User-customizable grouping
    color TEXT DEFAULT '#3B82F6', -- Hex color for UI display
    
    -- Category metadata
    is_default BOOLEAN DEFAULT FALSE, -- Was this a system default?
    is_active BOOLEAN DEFAULT TRUE, -- User can deactivate instead of delete
    usage_count INTEGER DEFAULT 0, -- Track how often it's used
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Flexibility features
    description TEXT, -- User can add notes about when to use this category
    parent_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL, -- Allow subcategories
    sort_order INTEGER DEFAULT 0, -- User can customize category order
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique category names per user (but allow same name across users)
    UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Basic policy for individual users (business policies added later)
DROP POLICY IF EXISTS "Users can manage own categories" ON public.categories;
CREATE POLICY "Users can manage own categories" ON public.categories
    FOR ALL USING (user_id = auth.uid());

-- =============================================
-- TRANSACTIONS SYSTEM
-- =============================================

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    business_id UUID, -- Will add FK constraint after businesses table is created
    client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- For business client tracking
    
    -- Transaction details
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL, -- Supports up to $999,999,999.99
    transaction_date DATE NOT NULL,
    posting_date DATE,
    
    -- Flexible categorization
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name TEXT, -- Denormalized for performance and history
    auto_categorized BOOLEAN DEFAULT FALSE, -- Was this auto-assigned?
    user_modified BOOLEAN DEFAULT FALSE, -- Did user manually change category?
    
    -- Status and processing
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'categorized', 'reviewed', 'income')),
    
    -- File/import tracking
    file_name TEXT,
    file_hash TEXT,
    transaction_key TEXT, -- Unique identifier for this transaction
    
    -- Smart categorization data
    merchant_name TEXT, -- Extracted/cleaned merchant name
    confidence_score DECIMAL(3,2) DEFAULT 0.0, -- How confident we are in auto-categorization
    
    -- Metadata
    notes TEXT, -- User can add personal notes
    tags TEXT[], -- User can add custom tags
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate transactions
    UNIQUE(user_id, transaction_key)
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Basic policy for individual users (business policies added later)
DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
CREATE POLICY "Users can manage own transactions" ON public.transactions
    FOR ALL USING (user_id = auth.uid());

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON public.transactions(user_id, merchant_name);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(user_id, status);

-- =============================================
-- SMART CATEGORIZATION SYSTEM
-- =============================================

-- Learn from user's categorization patterns
CREATE TABLE IF NOT EXISTS public.merchant_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    merchant_name TEXT NOT NULL, -- Cleaned merchant name
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    category_name TEXT NOT NULL, -- Denormalized for performance
    
    -- Learning metadata
    learned_from_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 0.0 to 1.0
    usage_count INTEGER DEFAULT 1, -- How many times this mapping was used
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, merchant_name)
);

-- Enable RLS
ALTER TABLE public.merchant_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own merchant mappings" ON public.merchant_mappings;
CREATE POLICY "Users can manage own merchant mappings" ON public.merchant_mappings
    FOR ALL USING (auth.uid() = user_id);

-- Zelle/P2P recipient mappings
CREATE TABLE IF NOT EXISTS public.zelle_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    recipient_name TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    category_name TEXT NOT NULL,
    
    -- Flexibility
    notes TEXT, -- User can add context about this recipient
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, recipient_name)
);

-- Enable RLS
ALTER TABLE public.zelle_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own zelle recipients" ON public.zelle_recipients;
CREATE POLICY "Users can manage own zelle recipients" ON public.zelle_recipients
    FOR ALL USING (auth.uid() = user_id);

-- Manual category overrides (when user corrects auto-categorization)
CREATE TABLE IF NOT EXISTS public.transaction_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    transaction_key TEXT NOT NULL,
    old_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    new_category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    old_category_name TEXT,
    new_category_name TEXT NOT NULL,
    
    override_reason TEXT DEFAULT 'manual',
    notes TEXT, -- User can explain why they changed it
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, transaction_key)
);

-- Enable RLS
ALTER TABLE public.transaction_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own transaction overrides" ON public.transaction_overrides;
CREATE POLICY "Users can manage own transaction overrides" ON public.transaction_overrides
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- BUSINESS FEATURES (Optional)
-- =============================================

-- Business accounts for tax professionals, etc.
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    business_type TEXT DEFAULT 'tax_services',
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Business details
    business_email TEXT,
    phone TEXT,
    address TEXT,
    tax_id TEXT,
    
    -- Settings
    max_clients INTEGER DEFAULT 50,
    current_clients INTEGER DEFAULT 0,
    subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro', 'enterprise')),
    
    -- Customization
    default_categories JSONB, -- Business can set default categories for clients
    branding JSONB, -- Logo, colors, etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(name)
);

-- FK constraints will be added after all tables are created

-- Enable RLS
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can manage their business" ON public.businesses;
CREATE POLICY "Business owners can manage their business" ON public.businesses
    FOR ALL USING (auth.uid() = owner_id);

-- Business-client relationships
CREATE TABLE IF NOT EXISTS public.business_clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    client_notes TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{"view_reports": true, "upload_files": true, "manage_categories": false}',
    
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(business_id, client_id)
);

-- Enable RLS
ALTER TABLE public.business_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can manage their clients" ON public.business_clients;
CREATE POLICY "Business owners can manage their clients" ON public.business_clients
    FOR ALL USING (
        business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )
    );

-- =============================================
-- FILE UPLOAD TRACKING
-- =============================================

CREATE TABLE IF NOT EXISTS public.file_uploads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT NOT NULL,
    file_type TEXT NOT NULL,
    
    -- Processing results
    total_transactions INTEGER DEFAULT 0,
    processed_transactions INTEGER DEFAULT 0,
    new_transactions INTEGER DEFAULT 0,
    duplicate_transactions INTEGER DEFAULT 0,
    auto_categorized INTEGER DEFAULT 0,
    
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(user_id, file_hash)
);

-- Enable RLS
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own file uploads" ON public.file_uploads;
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

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_mappings_updated_at ON public.merchant_mappings;
CREATE TRIGGER update_merchant_mappings_updated_at BEFORE UPDATE ON public.merchant_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_zelle_recipients_updated_at ON public.zelle_recipients;
CREATE TRIGGER update_zelle_recipients_updated_at BEFORE UPDATE ON public.zelle_recipients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_businesses_updated_at ON public.businesses;
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_clients_updated_at ON public.business_clients;
CREATE TRIGGER update_business_clients_updated_at BEFORE UPDATE ON public.business_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update category usage statistics
CREATE OR REPLACE FUNCTION update_category_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        UPDATE public.categories 
        SET 
            usage_count = usage_count + 1,
            last_used_at = NOW()
        WHERE id = NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update category usage when transactions are categorized
DROP TRIGGER IF EXISTS update_category_usage_trigger ON public.transactions;
CREATE TRIGGER update_category_usage_trigger
    AFTER INSERT OR UPDATE OF category_id ON public.transactions
    FOR EACH ROW 
    WHEN (NEW.category_id IS NOT NULL)
    EXECUTE FUNCTION update_category_usage();

-- Function to update business client count
CREATE OR REPLACE FUNCTION update_business_client_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.businesses 
        SET current_clients = current_clients + 1 
        WHERE id = NEW.business_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.businesses 
        SET current_clients = current_clients - 1 
        WHERE id = OLD.business_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for client count
DROP TRIGGER IF EXISTS trigger_update_business_client_count ON public.business_clients;
CREATE TRIGGER trigger_update_business_client_count
    AFTER INSERT OR DELETE ON public.business_clients
    FOR EACH ROW EXECUTE FUNCTION update_business_client_count();

-- =============================================
-- FLEXIBLE DEFAULT CATEGORIES
-- =============================================

-- Function to create starter categories for new users
-- Users can modify, delete, or add to these as needed
CREATE OR REPLACE FUNCTION create_starter_categories_for_user(user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.categories (user_id, name, keywords, group_name, is_default, description) VALUES
    
    -- Housing & Utilities (most common)
    (user_id, 'Rent/Mortgage', ARRAY['rent', 'mortgage', 'home loan', 'principal', 'interest'], 'Housing', TRUE, 'Monthly housing payment'),
    (user_id, 'Utilities', ARRAY['electric', 'electricity', 'gas', 'water', 'sewer', 'utility'], 'Housing', TRUE, 'Basic utilities'),
    (user_id, 'Internet & Phone', ARRAY['internet', 'wifi', 'phone', 'mobile', 'cell', 'comcast', 'verizon'], 'Housing', TRUE, 'Communication services'),
    
    -- Transportation
    (user_id, 'Gas & Fuel', ARRAY['gas', 'fuel', 'shell', 'bp', 'exxon', 'chevron', 'gasoline'], 'Transportation', TRUE, 'Vehicle fuel'),
    (user_id, 'Car Payment', ARRAY['car payment', 'auto loan', 'vehicle payment'], 'Transportation', TRUE, 'Vehicle financing'),
    (user_id, 'Car Insurance', ARRAY['car insurance', 'auto insurance', 'geico', 'progressive', 'state farm'], 'Transportation', TRUE, 'Vehicle insurance'),
    
    -- Food & Dining
    (user_id, 'Groceries', ARRAY['grocery', 'supermarket', 'walmart', 'target', 'publix', 'kroger'], 'Food & Dining', TRUE, 'Food shopping'),
    (user_id, 'Restaurants', ARRAY['restaurant', 'dining', 'food delivery', 'takeout', 'uber eats', 'doordash'], 'Food & Dining', TRUE, 'Eating out'),
    
    -- Personal & Health
    (user_id, 'Healthcare', ARRAY['doctor', 'medical', 'hospital', 'pharmacy', 'health', 'dental'], 'Healthcare', TRUE, 'Medical expenses'),
    (user_id, 'Personal Care', ARRAY['haircut', 'salon', 'personal', 'beauty', 'hygiene'], 'Personal', TRUE, 'Personal grooming'),
    
    -- Entertainment & Shopping
    (user_id, 'Entertainment', ARRAY['movie', 'streaming', 'netflix', 'spotify', 'entertainment', 'games'], 'Entertainment', TRUE, 'Fun and leisure'),
    (user_id, 'Shopping', ARRAY['shopping', 'amazon', 'clothing', 'retail', 'store'], 'Shopping', TRUE, 'General purchases'),
    
    -- Financial
    (user_id, 'Credit Card Payment', ARRAY['credit card', 'card payment', 'cc payment'], 'Financial', TRUE, 'Credit card payments'),
    (user_id, 'Bank Fees', ARRAY['bank fee', 'atm fee', 'overdraft', 'service charge'], 'Financial', TRUE, 'Banking fees'),
    
    -- Flexible categories
    (user_id, 'Income', ARRAY['salary', 'paycheck', 'income', 'deposit', 'payment received'], 'Income', TRUE, 'Money coming in'),
    (user_id, 'Other', ARRAY[], 'Other', TRUE, 'Uncategorized transactions');
    
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- REPORTING VIEWS
-- =============================================

-- Monthly spending by category
CREATE OR REPLACE VIEW monthly_spending_summary AS
SELECT 
    t.user_id,
    DATE_TRUNC('month', t.transaction_date) as month,
    c.group_name,
    t.category_name,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as total_expenses,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total_income,
    AVG(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE NULL END) as avg_expense_amount
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
GROUP BY t.user_id, DATE_TRUNC('month', t.transaction_date), c.group_name, t.category_name;

-- Category usage and effectiveness
CREATE OR REPLACE VIEW category_analytics AS
SELECT 
    c.user_id,
    c.id as category_id,
    c.name as category_name,
    c.group_name,
    c.usage_count,
    c.last_used_at,
    COUNT(t.id) as total_transactions,
    SUM(CASE WHEN t.auto_categorized = true THEN 1 ELSE 0 END) as auto_categorized_count,
    SUM(CASE WHEN t.user_modified = true THEN 1 ELSE 0 END) as user_modified_count,
    ROUND(
        CASE 
            WHEN COUNT(t.id) > 0 
            THEN (SUM(CASE WHEN t.auto_categorized = true AND t.user_modified = false THEN 1 ELSE 0 END)::DECIMAL / COUNT(t.id)) * 100
            ELSE 0 
        END, 2
    ) as auto_categorization_accuracy
FROM public.categories c
LEFT JOIN public.transactions t ON c.id = t.category_id
GROUP BY c.user_id, c.id, c.name, c.group_name, c.usage_count, c.last_used_at;

-- Enable RLS on views
ALTER VIEW monthly_spending_summary SET (security_invoker = true);
ALTER VIEW category_analytics SET (security_invoker = true);

-- =============================================
-- ADD FOREIGN KEY CONSTRAINTS AND BUSINESS POLICIES
-- =============================================

-- Now that all tables exist, add the FK constraints
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS fk_profiles_business;
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_business 
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS fk_categories_business;
ALTER TABLE public.categories ADD CONSTRAINT fk_categories_business 
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_business;
ALTER TABLE public.transactions ADD CONSTRAINT fk_transactions_business 
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- Now add the complete business-aware policies
DROP POLICY IF EXISTS "Users can manage own categories" ON public.categories;
CREATE POLICY "Users can manage own categories" ON public.categories
    FOR ALL USING (
        (user_id = auth.uid()) OR
        (business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )) OR
        (user_id = auth.uid() AND business_id IN (
            SELECT business_id FROM public.profiles WHERE id = auth.uid() AND user_role = 'business_client'
        ))
    );

DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
CREATE POLICY "Users can manage own transactions" ON public.transactions
    FOR ALL USING (
        (user_id = auth.uid()) OR
        (business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )) OR
        (client_id = auth.uid() AND business_id IS NOT NULL)
    );

-- =============================================
-- SAMPLE DATA SETUP
-- =============================================

-- This schema is designed to be flexible and user-driven
-- Default categories are minimal and users can customize everything
-- The system learns from user behavior to improve auto-categorization
