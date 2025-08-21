#!/usr/bin/env python3
"""
Setup user account for testing
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase

# Load environment variables
load_dotenv()

def setup_user_account():
    """Sign up or sign in user account"""
    email = "ivan.web9450@gmail.com"
    password = "rK1-Mj?5}<B1"
    
    print("👤 Setting up user account...")
    
    # Try to sign up first (in case user doesn't exist)
    print(f"\n1. Attempting to sign up user: {email}")
    try:
        signup_response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })
        
        if signup_response.user:
            print(f"✅ User signed up successfully!")
            print(f"User ID: {signup_response.user.id}")
            print(f"Email: {signup_response.user.email}")
            print(f"Email confirmed: {signup_response.user.email_confirmed_at}")
            
            if signup_response.session:
                print(f"JWT Token: {signup_response.session.access_token}")
                return {
                    "user_id": signup_response.user.id,
                    "email": signup_response.user.email,
                    "token": signup_response.session.access_token
                }
            else:
                print("⚠️  User created but no session - may need email confirmation")
        else:
            print("❌ Sign up failed - no user returned")
            
    except Exception as e:
        print(f"ℹ️  Sign up error (user may already exist): {e}")
    
    # Try to sign in
    print(f"\n2. Attempting to sign in user: {email}")
    try:
        signin_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        if signin_response.user:
            print(f"✅ User signed in successfully!")
            print(f"User ID: {signin_response.user.id}")
            print(f"Email: {signin_response.user.email}")
            
            if signin_response.session:
                print(f"JWT Token: {signin_response.session.access_token}")
                
                # Test database operations
                print(f"\n3. Testing database operations...")
                from database_service import DatabaseService
                
                user_id = signin_response.user.id
                
                # Create user profile
                profile = DatabaseService.get_or_create_user_profile(user_id, signin_response.user.email)
                if profile:
                    print(f"✅ User profile: {profile.get('email', 'Unknown')}")
                
                # Get/create categories
                categories = DatabaseService.get_categories(user_id)
                print(f"✅ Found {len(categories)} existing categories")
                
                if len(categories) == 0:
                    print("Creating default categories...")
                    default_categories = DatabaseService.create_default_categories(user_id)
                    print(f"✅ Created {len(default_categories)} default categories")
                
                return {
                    "user_id": user_id,
                    "email": signin_response.user.email,
                    "token": signin_response.session.access_token
                }
            else:
                print("❌ Sign in successful but no session")
        else:
            print("❌ Sign in failed - no user returned")
            
    except Exception as e:
        print(f"❌ Sign in error: {e}")
    
    return None

if __name__ == "__main__":
    result = setup_user_account()
    if result:
        print(f"\n🎉 Success! You can now test the API with:")
        print(f"curl -Headers @{{\"Authorization\"=\"Bearer {result['token'][:50]}...\"}} http://localhost:8000/categories")
        print(f"\nUser ID: {result['user_id']}")
    else:
        print(f"\n❌ Failed to setup user account")
