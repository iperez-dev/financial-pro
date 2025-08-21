#!/usr/bin/env python3
"""
Fix development mode by creating profile directly
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase_admin

# Load environment variables
load_dotenv()

def fix_dev_mode():
    """Create profile for development user"""
    dev_user_id = "00000000-0000-0000-0000-000000000001"
    dev_email = "dev@example.com"
    
    print("🔧 Fixing development mode...")
    
    if not supabase_admin:
        print("❌ Admin client not available.")
        return False
    
    try:
        # Create profile directly (bypassing foreign key constraint temporarily)
        print(f"\n1. Creating profile for dev user: {dev_user_id}")
        
        profile_data = {
            'id': dev_user_id,
            'email': dev_email,
            'full_name': 'Development User',
            'user_role': 'individual',
            'is_active': True,
            'created_at': '2025-01-20T00:00:00Z'
        }
        
        # Check if profile exists
        existing_profile = supabase_admin.table('profiles').select('*').eq('id', dev_user_id).execute()
        
        if existing_profile.data:
            print(f"✅ Profile already exists: {existing_profile.data[0]}")
        else:
            # Insert profile
            result = supabase_admin.table('profiles').insert(profile_data).execute()
            if result.data:
                print(f"✅ Profile created: {result.data[0]}")
            else:
                print("❌ Failed to create profile")
                return False
        
        # Create default categories
        print(f"\n2. Creating default categories...")
        from database_service import DatabaseService
        
        categories = DatabaseService.get_categories(dev_user_id)
        print(f"Found {len(categories)} existing categories")
        
        if len(categories) == 0:
            default_categories = DatabaseService.create_default_categories(dev_user_id)
            print(f"✅ Created {len(default_categories)} default categories")
            
            # Verify
            categories = DatabaseService.get_categories(dev_user_id)
            print(f"✅ Final verification: {len(categories)} categories")
            for cat in categories[:3]:  # Show first 3
                print(f"   - {cat.get('name', 'Unknown')} (Group: {cat.get('group_name', 'Unknown')})")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = fix_dev_mode()
    if success:
        print(f"\n🎉 Development mode fixed!")
        print(f"You can now test with: curl -Headers @{{\"Authorization\"=\"Bearer fake-token\"}} http://localhost:8000/categories")
    else:
        print(f"\n❌ Failed to fix development mode")
