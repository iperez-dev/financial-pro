#!/usr/bin/env python3
"""
Get authentication token for real user testing
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase

# Load environment variables
load_dotenv()

def get_auth_token():
    """Authenticate with real user and get JWT token"""
    email = "ivan.web9450@gmail.com"
    password = "rK1-Mj?5}<B1"
    
    print("🔐 Authenticating with real user account...")
    
    try:
        # Sign in with email and password
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        if auth_response.user:
            print(f"✅ Authentication successful!")
            print(f"User ID: {auth_response.user.id}")
            print(f"Email: {auth_response.user.email}")
            print(f"JWT Token: {auth_response.session.access_token}")
            
            # Test getting user profile
            print(f"\n📋 Testing user profile creation...")
            from database_service import DatabaseService
            
            profile = DatabaseService.get_or_create_user_profile(
                auth_response.user.id, 
                auth_response.user.email
            )
            
            if profile:
                print(f"✅ User profile: {profile}")
                
                # Test getting categories
                print(f"\n📂 Testing categories...")
                categories = DatabaseService.get_categories(auth_response.user.id)
                print(f"✅ Found {len(categories)} categories")
                
                if len(categories) == 0:
                    print("Creating default categories...")
                    default_categories = DatabaseService.create_default_categories(auth_response.user.id)
                    print(f"✅ Created {len(default_categories)} default categories")
                    
                    # Check again
                    categories = DatabaseService.get_categories(auth_response.user.id)
                    print(f"✅ Final count: {len(categories)} categories")
                    for cat in categories[:5]:  # Show first 5
                        print(f"   - {cat.get('name', 'Unknown')} (Group: {cat.get('group_name', 'Unknown')})")
                
            else:
                print("❌ Failed to create user profile")
            
            return {
                "user_id": auth_response.user.id,
                "email": auth_response.user.email,
                "token": auth_response.session.access_token
            }
        else:
            print("❌ Authentication failed - no user returned")
            return None
            
    except Exception as e:
        print(f"❌ Authentication error: {e}")
        return None

if __name__ == "__main__":
    result = get_auth_token()
    if result:
        print(f"\n🎉 Success! You can now test the API with:")
        print(f"Authorization: Bearer {result['token']}")
        print(f"User ID: {result['user_id']}")
