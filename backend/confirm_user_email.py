#!/usr/bin/env python3
"""
Confirm user email using admin client
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase, supabase_admin

# Load environment variables
load_dotenv()

def confirm_user_email():
    """Confirm user email using admin client"""
    email = "ivan.web9450@gmail.com"
    password = "rK1-Mj?5}<B1"
    
    print("📧 Confirming user email...")
    
    if not supabase_admin:
        print("❌ Admin client not available. Make sure SUPABASE_SERVICE_KEY is set.")
        return None
    
    try:
        # Method 1: Try to update the user's email_confirmed_at field
        print(f"\n1. Attempting to confirm email for: {email}")
        
        # First, let's find the user ID
        users_result = supabase_admin.table('auth.users').select('id, email, email_confirmed_at').eq('email', email).execute()
        
        if users_result.data:
            user = users_result.data[0]
            user_id = user['id']
            print(f"✅ Found user: {user_id}")
            print(f"Email confirmed: {user.get('email_confirmed_at', 'Not confirmed')}")
            
            if not user.get('email_confirmed_at'):
                print("Confirming email...")
                # Update email_confirmed_at
                from datetime import datetime
                confirm_result = supabase_admin.table('auth.users').update({
                    'email_confirmed_at': datetime.now().isoformat()
                }).eq('id', user_id).execute()
                
                if confirm_result.data:
                    print(f"✅ Email confirmed successfully!")
                else:
                    print("❌ Failed to confirm email via database update")
            else:
                print("✅ Email already confirmed!")
        else:
            print(f"❌ User not found: {email}")
            return None
    
    except Exception as e:
        print(f"ℹ️  Direct database update failed (expected): {e}")
    
    # Method 2: Try using Supabase admin auth methods
    try:
        print(f"\n2. Attempting admin auth confirmation...")
        
        # Try to get user by email using admin client
        admin_user_response = supabase_admin.auth.admin.get_user_by_email(email)
        
        if admin_user_response:
            print(f"✅ Found user via admin API")
            
            # Try to update user
            update_response = supabase_admin.auth.admin.update_user_by_id(
                admin_user_response.user.id,
                {"email_confirm": True}
            )
            
            if update_response:
                print(f"✅ User updated via admin API")
        
    except Exception as e:
        print(f"ℹ️  Admin API method failed: {e}")
    
    # Method 3: Try to sign in again
    print(f"\n3. Testing sign in after confirmation attempts...")
    try:
        signin_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        if signin_response.user and signin_response.session:
            print(f"✅ Sign in successful!")
            print(f"User ID: {signin_response.user.id}")
            print(f"JWT Token: {signin_response.session.access_token}")
            
            return {
                "user_id": signin_response.user.id,
                "email": signin_response.user.email,
                "token": signin_response.session.access_token
            }
        else:
            print("❌ Sign in still failing")
            
    except Exception as e:
        print(f"❌ Sign in still failing: {e}")
    
    return None

if __name__ == "__main__":
    result = confirm_user_email()
    if result:
        print(f"\n🎉 Success! User is now authenticated.")
        print(f"User ID: {result['user_id']}")
        print(f"Token: {result['token'][:50]}...")
    else:
        print(f"\n⚠️  Email confirmation may need to be done manually in Supabase dashboard")
        print(f"Or we can continue with development mode for now")
