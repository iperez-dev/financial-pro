# 🛠️ Development Mode Guide

## Quick Start with Development Mode

Development mode allows you to bypass authentication for faster testing and development.

### 🚀 How to Use Development Mode

**Option 1: Use the Bypass Button (Recommended)**
1. Start your servers:
   ```bash
   # Terminal 1 - Backend
   cd backend
   python main.py
   
   # Terminal 2 - Frontend  
   cd frontend
   npm run dev
   ```

2. Visit: http://localhost:3000

3. On the login screen, click: **"🛠️ Skip Authentication (Development Mode)"**

4. You'll be logged in as a development user automatically!

**Option 2: Backend Environment Variable**
- Your `backend/.env` already has `ENVIRONMENT=development`
- This enables development mode on the backend API

### 🎯 What Development Mode Does

**Frontend (Client-Side):**
- ✅ **Bypasses Supabase Auth** - No need to create accounts
- ✅ **Mock User Created** - Uses `dev-user-123` with `dev@example.com`
- ✅ **Visual Indicator** - Shows "🛠️ DEV MODE" badge in header
- ✅ **Easy Toggle** - Logout clears dev mode, returns to auth screen

**Backend (Server-Side):**
- ✅ **No JWT Validation** - Accepts requests without real authentication
- ✅ **Mock User ID** - All data saved under `dev-user-123`
- ✅ **Full Database Access** - All features work normally
- ✅ **Persistent Data** - Your test data is saved in Supabase

### 🔄 Development Workflow

**1. Start Development:**
```bash
# Start both servers
cd backend && python main.py &
cd frontend && npm run dev &
```

**2. Access App:**
- Visit: http://localhost:3000
- Click: "Skip Authentication (Development Mode)"
- See: "🛠️ DEV MODE" badge in header

**3. Test Features:**
- Upload financial files
- Categorize transactions  
- Create/edit categories
- All data persists in database under dev user

**4. Switch to Real Auth:**
- Click "Logout" to exit dev mode
- Returns to real authentication screen
- Can test real signup/login flow

### 🎨 Visual Indicators

**Development Mode Active:**
- 🟡 **Yellow badge** in header: "🛠️ DEV MODE"
- 👤 **User email**: "dev@example.com"
- 🔄 **Logout button** clears dev mode

**Production Mode:**
- 🔐 **Login/Signup forms** required
- ✉️ **Real email addresses** for users
- 🛡️ **Full JWT authentication** enforced

### 🔧 Technical Details

**Mock User Data:**
```javascript
{
  id: 'dev-user-123',
  email: 'dev@example.com', 
  user_metadata: { full_name: 'Development User' }
}
```

**Storage:**
- **Frontend**: Uses `localStorage.setItem('dev-mode', 'true')`
- **Backend**: Checks `ENVIRONMENT=development` in `.env`
- **Database**: All dev data stored under user ID `dev-user-123`

**API Requests:**
- **Dev Mode**: Sends `Authorization: Bearer dev-token-123`
- **Backend**: Recognizes dev token and uses mock user
- **Database**: All operations scoped to dev user ID

### 🚨 Important Notes

**Development Only:**
- ⚠️ **Never use in production** - No real security
- 🔒 **Change ENVIRONMENT to "production"** for deployment
- 🧹 **Clear dev data** before production use

**Data Isolation:**
- ✅ **Dev data separate** - Won't interfere with real users
- 🗑️ **Easy cleanup** - Delete user `dev-user-123` from database
- 🔄 **Reset anytime** - Logout and re-enter dev mode

### 🎯 Perfect for Testing

**File Upload Testing:**
- Test CSV and Excel file processing
- Verify categorization logic
- Check transaction deduplication

**UI/UX Testing:**
- Test all user interface components
- Verify responsive design
- Check error handling

**Feature Development:**
- Develop new features without auth friction
- Test database operations
- Debug API endpoints

### 🔄 Switching Between Modes

**Enter Dev Mode:**
1. Visit login screen
2. Click "Skip Authentication (Development Mode)"
3. See dev mode indicator in header

**Exit Dev Mode:**
1. Click "Logout" button
2. Returns to authentication screen
3. Can now test real auth or re-enter dev mode

**Check Current Mode:**
- Look for "🛠️ DEV MODE" badge in header
- Check user email: `dev@example.com` = dev mode
- Browser console: `localStorage.getItem('dev-mode')`

---

🎉 **Development mode makes testing your Financial Pro app fast and easy!**
