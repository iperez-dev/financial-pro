#!/usr/bin/env python3
"""
Debug user categories issue
"""
import os
from dotenv import load_dotenv
from supabase_client import supabase, supabase_admin
from database_service import DatabaseService

# Load environment variables
load_dotenv()

def debug_categories():
    """Debug category retrieval"""
    
    print("🔍 Debugging category retrieval...")
    
    # Test with both clients
    clients = [
        ("Regular client", supabase),
        ("Admin client", supabase_admin)
    ]
    
    for client_name, client in clients:
        if not client:
            continue
            
        print(f"\n--- {client_name} ---")
        
        try:
            # Get all categories (no user filter)
            all_categories = client.table('categories').select('*').execute()
            print(f"Total categories in database: {len(all_categories.data)}")
            
            if all_categories.data:
                # Show unique user_ids
                user_ids = set(cat.get('user_id') for cat in all_categories.data)
                print(f"User IDs with categories: {list(user_ids)}")
                
                # Show sample categories
                for i, cat in enumerate(all_categories.data[:3]):
                    print(f"  {i+1}. {cat.get('name', 'Unknown')} (User: {cat.get('user_id', 'Unknown')})")
        
        except Exception as e:
            print(f"Error getting all categories: {e}")
    
    # Test specific user IDs
    test_user_ids = [
        "a8684aa8-0d40-49a4-a28d-47d7727ecfde",  # Real user from auth
        "00000000-0000-0000-0000-000000000001"   # Dev user
    ]
    
    for user_id in test_user_ids:
        print(f"\n--- Testing User ID: {user_id} ---")
        
        try:
            # Test DatabaseService method
            categories = DatabaseService.get_categories(user_id)
            print(f"DatabaseService.get_categories(): {len(categories)} categories")
            
            if categories:
                for i, cat in enumerate(categories[:3]):
                    print(f"  {i+1}. {cat.get('name', 'Unknown')} (Group: {cat.get('group_name', 'Unknown')})")
            
            # Test direct query
            direct_result = supabase.table('categories').select('*').eq('user_id', user_id).execute()
            print(f"Direct query: {len(direct_result.data)} categories")
            
        except Exception as e:
            print(f"Error testing user {user_id}: {e}")
    
    # Test the main.py function
    print(f"\n--- Testing main.py function ---")
    try:
        from main import get_categories_for_user
        
        for user_id in test_user_ids:
            categories = get_categories_for_user(user_id)
            print(f"get_categories_for_user({user_id}): {len(categories)} categories")
            
            if categories:
                for i, cat in enumerate(categories[:3]):
                    print(f"  {i+1}. {cat.get('name', 'Unknown')} (ID: {cat.get('id', 'Unknown')})")
    
    except Exception as e:
        print(f"Error testing main.py function: {e}")

if __name__ == "__main__":
    debug_categories()
