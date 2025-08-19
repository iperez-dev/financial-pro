"""
Supabase client configuration for Financial Pro backend
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")

# Create Supabase client (for user operations)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Create service client (for admin operations)
if SUPABASE_SERVICE_KEY:
    supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    supabase_admin = None
    print("Warning: SUPABASE_SERVICE_KEY not set. Admin operations will not be available.")

def get_user_id_from_token(token: str) -> str:
    """
    Extract user ID from JWT token
    """
    try:
        user = supabase.auth.get_user(token)
        return user.user.id if user.user else None
    except Exception as e:
        print(f"Error getting user from token: {e}")
        return None

def verify_user_token(token: str) -> dict:
    """
    Verify JWT token and return user info
    """
    try:
        user = supabase.auth.get_user(token)
        if user.user:
            return {
                "id": user.user.id,
                "email": user.user.email,
                "verified": True
            }
        return {"verified": False}
    except Exception as e:
        print(f"Error verifying token: {e}")
        return {"verified": False}
