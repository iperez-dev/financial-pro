# 🚀 Supabase Setup Guide for Financial Pro

This guide will walk you through setting up Supabase for your Financial Pro application, including database, authentication, and environment configuration.

## 📋 Prerequisites

- [x] Supabase account (sign up at [supabase.com](https://supabase.com))
- [x] Supabase dependencies installed (✅ completed)

## 🏗️ Step 1: Create Supabase Project

1. **Go to [Supabase Dashboard](https://app.supabase.com)**
2. **Click "New Project"**
3. **Fill in project details:**
   - Organization: Select or create
   - Name: `financial-pro` (or your preferred name)
   - Database Password: Generate a strong password (save this!)
   - Region: Choose closest to your location
4. **Click "Create new project"**
5. **Wait for project to be ready** (2-3 minutes)

## 🔑 Step 2: Get Your Credentials

Once your project is ready:

1. **Go to Settings → API**
2. **Copy these values:**
   - **Project URL**: `https://your-project-id.supabase.co`
   - **Anon Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (keep this secret!)

## 🗄️ Step 3: Set Up Database Schema

1. **Go to SQL Editor in Supabase Dashboard**
2. **Copy the contents of `database_schema.sql`** (created in your project root)
3. **Paste and run the SQL** to create all tables, policies, and functions
4. **Verify tables were created** in the Table Editor

### 📊 Database Structure Created:

- **`profiles`** - Extended user information
- **`categories`** - Expense categories with grouping
- **`transactions`** - All financial transactions
- **`merchant_mappings`** - Smart categorization learning
- **`zelle_recipients`** - Zelle payment mappings
- **`transaction_overrides`** - Manual category overrides
- **`file_uploads`** - Upload tracking and deduplication

## 🔐 Step 4: Configure Environment Variables

### Backend Configuration

1. **Copy `backend/env.example` to `backend/.env`:**
   ```bash
   cp backend/env.example backend/.env
   ```

2. **Edit `backend/.env` with your Supabase credentials:**
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-anon-public-key-here
   SUPABASE_SERVICE_KEY=your-service-role-key-here
   ENVIRONMENT=development
   SECRET_KEY=your-secret-key-for-jwt-signing
   FRONTEND_URL=http://localhost:3000
   ```

### Frontend Configuration

1. **Copy `frontend/env.example` to `frontend/.env.local`:**
   ```bash
   cp frontend/env.example frontend/.env.local
   ```

2. **Edit `frontend/.env.local` with your Supabase credentials:**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

## 🔒 Step 5: Configure Authentication

### Enable Email Authentication

1. **Go to Authentication → Settings**
2. **Enable "Enable email confirmations"** (recommended)
3. **Set Site URL to:** `http://localhost:3000`
4. **Add Redirect URLs:**
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000`

### Configure Email Templates (Optional)

1. **Go to Authentication → Email Templates**
2. **Customize signup confirmation email**
3. **Customize password reset email**

## 🛡️ Step 6: Row Level Security (RLS)

RLS is automatically configured in the schema to ensure:
- ✅ Users only see their own data
- ✅ All operations are user-scoped
- ✅ Data isolation between users

## 🧪 Step 7: Test the Setup

### Test Database Connection

1. **Start your backend server:**
   ```bash
   cd backend
   source venv/Scripts/activate  # or .\venv\Scripts\Activate.ps1 on Windows
   python main.py
   ```

2. **Check for connection errors** in the console

### Test Authentication Flow

1. **Start your frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Go to** `http://localhost:3000`
3. **Try to sign up a new user**
4. **Check Supabase Dashboard → Authentication** to see the new user

## 📊 Step 8: Verify Data Flow

1. **Sign up/login to your app**
2. **Upload a financial file (CSV/Excel)**
3. **Check Supabase Dashboard → Table Editor:**
   - `transactions` table should have your data
   - `categories` table should have default categories
   - `profiles` table should have your user profile

## 🔧 Troubleshooting

### Common Issues:

**❌ "Missing Supabase environment variables"**
- Check that `.env` files exist and have correct values
- Restart servers after changing environment variables

**❌ "Row Level Security policy violation"**
- User not authenticated properly
- Check JWT token in requests
- Verify RLS policies in Supabase

**❌ "relation does not exist"**
- Database schema not applied
- Re-run the SQL from `database_schema.sql`

**❌ "Invalid JWT"**
- Check SUPABASE_KEY matches your project
- Verify token format and expiration

### Debug Steps:

1. **Check Supabase Dashboard → Logs** for database errors
2. **Check browser console** for frontend errors
3. **Check backend console** for API errors
4. **Verify environment variables** are loaded correctly

## 🎯 Next Steps

Once Supabase is set up:

1. **✅ Database ready** - All tables and policies configured
2. **✅ Authentication ready** - User signup/login working
3. **✅ Environment configured** - All credentials in place

You can now:
- **Upload financial files** and see data in Supabase
- **Create user accounts** with isolated data
- **Use smart categorization** with database persistence
- **Scale to multiple users** with proper data isolation

## 🔗 Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Dashboard](https://app.supabase.com)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Supabase Python Client](https://supabase.com/docs/reference/python)

---

🎉 **Your Financial Pro app is now ready for multi-user, database-backed operation!**
