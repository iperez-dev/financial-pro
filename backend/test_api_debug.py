#!/usr/bin/env python3
"""
Test API debug - check what user ID is being extracted
"""
import requests
import json

def test_api():
    """Test the API and see what's happening"""
    
    # Your JWT token
    token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IktTd2RsMmY5NkJpazY1c20iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2x5ZnR2ZXp1dHVwZGZpcXl3Y2l6LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhODY4NGFhOC0wZDQwLTQ5YTQtYTI4ZC00N2Q3NzI3ZWNmZGUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU1NzIxODM5LCJpYXQiOjE3NTU3MTgyMzksImVtYWlsIjoiaXZhbi53ZWI5NDUwQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJpdmFuLndlYjk0NTBAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiYTg2ODRhYTgtMGQ0MC00OWE0LWEyOGQtNDdkNzcyN2VjZmRlIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NTU3MTgyMzl9XSwic2Vzc2lvbl9pZCI6IjI2YWFiZmE4LWY0NDAtNDc1Zi1iZjVjLTBmYzRmOTRmMzkzZCIsImlzX2Fub255bW91cyI6ZmFsc2V9.TjQCIIilbJEIAAxIo8PEhD5DlxLO86QBf1hGo1JfW3I"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print("🧪 Testing API endpoints...")
    
    # Test categories endpoint
    print(f"\n1. Testing /categories")
    try:
        response = requests.get("http://localhost:8000/categories", headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test user profile endpoint
    print(f"\n2. Testing /user/profile")
    try:
        response = requests.get("http://localhost:8000/user/profile", headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test creating a category
    print(f"\n3. Testing POST /categories")
    try:
        category_data = {
            "name": "Test API Category",
            "keywords": ["test", "api"],
            "group": "Testing"
        }
        response = requests.post("http://localhost:8000/categories", headers=headers, json=category_data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test categories again after creation
    print(f"\n4. Testing /categories again")
    try:
        response = requests.get("http://localhost:8000/categories", headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api()
