-- Financial Pro Database Schema V2 - Multi-Tenant Support
-- Supports Individual Users and Business Accounts with Client Management

-- =============================================
-- USER ROLES AND BUSINESS ACCOUNTS
-- =============================================

-- Extend profiles table with role-based access
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role TEXT DEFAULT 'individual' CHECK (user_role IN ('individual', 'business_owner', 'business_client'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL; -- Who created this user (for business clients)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create businesses table
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    business_type TEXT DEFAULT 'tax_services',
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Business details
    business_email TEXT,
    phone TEXT,
    address TEXT,
    tax_id TEXT, -- EIN or Tax ID
    
    -- Subscription and limits
    max_clients INTEGER DEFAULT 50,
    current_clients INTEGER DEFAULT 0,
    subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro', 'enterprise')),
    
    -- Settings
    default_categories JSONB, -- Business-specific default categories
    branding JSONB, -- Logo, colors, etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(name) -- Business names must be unique
);

-- Enable RLS
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Policies for businesses
CREATE POLICY "Business owners can manage their business" ON public.businesses
    FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Business clients can view their business info" ON public.businesses
    FOR SELECT USING (
        id IN (
            SELECT business_id FROM public.profiles 
            WHERE id = auth.uid() AND user_role = 'business_client'
        )
    );

-- =============================================
-- CLIENT MANAGEMENT
-- =============================================

-- Table to track business-client relationships
CREATE TABLE IF NOT EXISTS public.business_clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Client details (as seen by business)
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    client_notes TEXT,
    
    -- Access control
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{"view_reports": true, "upload_files": true, "manage_categories": false}',
    
    -- Tracking
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(business_id, client_id) -- One relationship per business-client pair
);

-- Enable RLS
ALTER TABLE public.business_clients ENABLE ROW LEVEL SECURITY;

-- Policies for business_clients
CREATE POLICY "Business owners can manage their clients" ON public.business_clients
    FOR ALL USING (
        business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "Clients can view their business relationship" ON public.business_clients
    FOR SELECT USING (client_id = auth.uid());

-- =============================================
-- UPDATE EXISTING TABLES FOR MULTI-TENANCY
-- =============================================

-- Update categories table to support business-wide categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_business_default BOOLEAN DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_by_role TEXT DEFAULT 'individual';

-- Update categories policies
DROP POLICY IF EXISTS "Users can manage own categories" ON public.categories;

CREATE POLICY "Individual users can manage own categories" ON public.categories
    FOR ALL USING (
        (user_id = auth.uid() AND business_id IS NULL) OR
        (business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )) OR
        (user_id = auth.uid() AND business_id IN (
            SELECT business_id FROM public.profiles WHERE id = auth.uid() AND user_role = 'business_client'
        ))
    );

-- Update transactions table for business context
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE; -- For business tracking

-- Update transactions policies
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
-- BUSINESS DASHBOARD VIEWS
-- =============================================

-- View for business client summary
CREATE OR REPLACE VIEW business_client_summary AS
SELECT 
    b.id as business_id,
    b.name as business_name,
    bc.client_id,
    bc.client_name,
    bc.client_email,
    bc.is_active,
    bc.last_login,
    COUNT(t.id) as total_transactions,
    SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as total_expenses,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total_income,
    MAX(t.transaction_date) as last_transaction_date
FROM public.businesses b
LEFT JOIN public.business_clients bc ON b.id = bc.business_id
LEFT JOIN public.transactions t ON bc.client_id = t.user_id
WHERE bc.is_active = true
GROUP BY b.id, b.name, bc.client_id, bc.client_name, bc.client_email, bc.is_active, bc.last_login;

-- Enable RLS on view
ALTER VIEW business_client_summary SET (security_invoker = true);

-- =============================================
-- DEFAULT BUSINESS DATA
-- =============================================

-- Insert Brito Tax business (will be created via API, but here for reference)
-- INSERT INTO public.businesses (name, business_type, owner_id, business_email, max_clients, subscription_tier)
-- VALUES ('Brito Tax', 'tax_services', 'OWNER_USER_ID', 'contact@britotax.com', 100, 'pro');

-- =============================================
-- BUSINESS-SPECIFIC CATEGORIES
-- =============================================

-- Function to create business default categories
CREATE OR REPLACE FUNCTION create_business_default_categories(business_id UUID, owner_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.categories (user_id, business_id, name, keywords, group_name, is_business_default, created_by_role) VALUES
    -- Tax Services Categories
    (owner_id, business_id, 'Business Income', ARRAY['revenue', 'sales', 'income', 'payment received'], 'Income', TRUE, 'business_owner'),
    (owner_id, business_id, 'Office Expenses', ARRAY['office', 'supplies', 'rent', 'utilities'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Professional Services', ARRAY['legal', 'accounting', 'consulting', 'professional'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Marketing & Advertising', ARRAY['marketing', 'advertising', 'promotion', 'website'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Travel & Meals', ARRAY['travel', 'meals', 'hotel', 'transportation'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Equipment & Software', ARRAY['equipment', 'software', 'computer', 'tools'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Insurance', ARRAY['insurance', 'liability', 'health', 'business insurance'], 'Business Expenses', TRUE, 'business_owner'),
    (owner_id, business_id, 'Taxes & Fees', ARRAY['tax', 'fee', 'license', 'permit'], 'Business Expenses', TRUE, 'business_owner'),
    
    -- Individual Client Categories (for tax preparation)
    (owner_id, business_id, 'W-2 Wages', ARRAY['w-2', 'wages', 'salary', 'payroll'], 'Personal Income', TRUE, 'business_owner'),
    (owner_id, business_id, '1099 Income', ARRAY['1099', 'contractor', 'freelance', 'self-employed'], 'Personal Income', TRUE, 'business_owner'),
    (owner_id, business_id, 'Medical Expenses', ARRAY['medical', 'doctor', 'hospital', 'pharmacy', 'health'], 'Deductions', TRUE, 'business_owner'),
    (owner_id, business_id, 'Charitable Donations', ARRAY['donation', 'charity', 'church', 'nonprofit'], 'Deductions', TRUE, 'business_owner'),
    (owner_id, business_id, 'Home Office', ARRAY['home office', 'utilities', 'internet', 'phone'], 'Deductions', TRUE, 'business_owner'),
    (owner_id, business_id, 'Education Expenses', ARRAY['tuition', 'books', 'education', 'school'], 'Deductions', TRUE, 'business_owner');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- AUDIT AND TRACKING
-- =============================================

-- Table for tracking business actions (for compliance)
CREATE TABLE IF NOT EXISTS public.business_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.business_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy for audit log
CREATE POLICY "Business owners can view their audit log" ON public.business_audit_log
    FOR SELECT USING (
        business_id IN (
            SELECT id FROM public.businesses WHERE owner_id = auth.uid()
        )
    );

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

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

-- Add updated_at triggers for new tables
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_clients_updated_at BEFORE UPDATE ON public.business_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SAMPLE DATA SETUP
-- =============================================

-- This will be handled by the application, but here's the structure:
-- 1. Create business account for "Brito Tax"
-- 2. Set up business-specific categories
-- 3. Create sample client accounts
-- 4. Establish business-client relationships
