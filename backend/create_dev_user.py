#!/usr/bin/env python3
"""
Create a development user profile for testing
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase_admin
from database_service import DatabaseService

# Load environment variables
load_dotenv()

def create_dev_user():
    """Create a development user in the auth.users table"""
    dev_user_id = "00000000-0000-0000-0000-000000000001"
    dev_email = "dev@example.com"
    
    print("🧪 Creating development user...")
    
    if not supabase_admin:
        print("❌ Admin client not available. Make sure SUPABASE_SERVICE_KEY is set.")
        return
    
    # Step 1: Create user in auth.users table (using admin client)
    print(f"\n1. Creating user in auth.users table...")
    try:
        # Check if user already exists
        existing_user = supabase_admin.table('auth.users').select('id').eq('id', dev_user_id).execute()
        
        if existing_user.data:
            print(f"✅ User already exists in auth.users: {dev_user_id}")
        else:
            # Create user in auth.users table
            user_data = {
                'id': dev_user_id,
                'email': dev_email,
                'email_confirmed_at': '2025-01-20T00:00:00Z',
                'created_at': '2025-01-20T00:00:00Z',
                'updated_at': '2025-01-20T00:00:00Z',
                'role': 'authenticated',
                'aud': 'authenticated'
            }
            
            result = supabase_admin.table('auth.users').insert(user_data).execute()
            if result.data:
                print(f"✅ Created user in auth.users: {result.data[0]['id']}")
            else:
                print("❌ Failed to create user in auth.users")
                return
    
    except Exception as e:
        print(f"❌ Error with auth.users: {e}")
        print("ℹ️  This is expected - we can't directly insert into auth.users")
        print("ℹ️  Let's try creating just the profile instead...")
    
    # Step 2: Create user profile
    print(f"\n2. Creating user profile...")
    try:
        profile = DatabaseService.get_or_create_user_profile(dev_user_id, dev_email)
        if profile:
            print(f"✅ User profile created/found: {profile}")
        else:
            print("❌ Failed to create user profile")
    except Exception as e:
        print(f"❌ Error creating user profile: {e}")
    
    # Step 3: Try to create categories again
    print(f"\n3. Testing category creation...")
    try:
        categories = DatabaseService.get_categories(dev_user_id)
        print(f"✅ Found {len(categories)} categories for user")
        
        if len(categories) == 0:
            print("Creating default categories...")
            default_categories = DatabaseService.create_default_categories(dev_user_id)
            print(f"✅ Created {len(default_categories)} default categories")
        
    except Exception as e:
        print(f"❌ Error with categories: {e}")

if __name__ == "__main__":
    create_dev_user()
