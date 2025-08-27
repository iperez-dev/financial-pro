"""
Authentication middleware for Financial Pro backend
"""
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase_client import supabase, verify_user_token
import os

# Security scheme
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to get current authenticated user from JWT token
    """
    try:
        token = credentials.credentials
        user_info = verify_user_token(token)
        
        if not user_info.get("verified"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_info
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Optional dependency to get current user (for development/testing)
    Returns None if no valid token provided
    """
    try:
        if not credentials:
            return None
        
        token = credentials.credentials
        user_info = verify_user_token(token)
        
        if user_info.get("verified"):
            return user_info
        return None
    except:
        return None

# Strict auth only – always require real authentication
get_user_or_dev_mode = get_current_user
