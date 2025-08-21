#!/usr/bin/env python3
"""
Test script to debug category creation
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase
from database_service import DatabaseService

# Load environment variables
load_dotenv()

def test_category_creation():
    """Test creating a category directly"""
    user_id = "00000000-0000-0000-0000-000000000001"
    
    print("🧪 Testing category creation...")
    
    # Test 1: Check if we can connect to Supabase
    print("\n1. Testing Supabase connection...")
    try:
        result = supabase.table('categories').select('count', count='exact').execute()
        print(f"✅ Supabase connection successful. Total categories: {result.count}")
    except Exception as e:
        print(f"❌ Supabase connection failed: {e}")
        return
    
    # Test 2: Try to get existing categories
    print(f"\n2. Getting existing categories for user {user_id}...")
    try:
        categories = DatabaseService.get_categories(user_id)
        print(f"✅ Found {len(categories)} existing categories")
        for cat in categories:
            print(f"   - {cat.get('name', 'Unknown')} (ID: {cat.get('id', 'Unknown')})")
    except Exception as e:
        print(f"❌ Error getting categories: {e}")
    
    # Test 3: Try to create a single category
    print(f"\n3. Creating a test category for user {user_id}...")
    try:
        new_category = DatabaseService.create_category(
            user_id=user_id,
            name="Test Category",
            keywords=["test", "debug"],
            group_name="Testing"
        )
        if new_category:
            print(f"✅ Category created successfully: {new_category}")
        else:
            print("❌ Category creation returned None")
    except Exception as e:
        print(f"❌ Error creating category: {e}")
    
    # Test 4: Try to create default categories
    print(f"\n4. Creating default categories for user {user_id}...")
    try:
        default_categories = DatabaseService.create_default_categories(user_id)
        print(f"✅ Created {len(default_categories)} default categories")
        for cat in default_categories:
            print(f"   - {cat.get('name', 'Unknown')} (ID: {cat.get('id', 'Unknown')})")
    except Exception as e:
        print(f"❌ Error creating default categories: {e}")
    
    # Test 5: Check final category count
    print(f"\n5. Final category check for user {user_id}...")
    try:
        categories = DatabaseService.get_categories(user_id)
        print(f"✅ Final count: {len(categories)} categories")
        for cat in categories:
            print(f"   - {cat.get('name', 'Unknown')} (Group: {cat.get('group_name', 'Unknown')})")
    except Exception as e:
        print(f"❌ Error getting final categories: {e}")

if __name__ == "__main__":
    test_category_creation()
