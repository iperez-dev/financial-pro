from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from typing import Dict, List, Any, Optional
import re
import json
import os
from pydantic import BaseModel
import hashlib
from datetime import datetime

# Import Supabase components
from supabase_client import supabase
from database_service import DatabaseService
from auth_middleware import get_user_or_dev_mode, get_current_user

app = FastAPI(title="Financial Pro API", version="1.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class Category(BaseModel):
    id: str
    name: str
    keywords: List[str] = []
    group: str = "Other"

class CategoryCreate(BaseModel):
    name: str
    keywords: List[str] = []
    group: str = "Other"

class CategoryUpdate(BaseModel):
    name: str = None
    keywords: List[str] = None
    group: str = None

class TransactionCategoryUpdate(BaseModel):
    transaction_id: int
    category: str

class CategoryUpdateRequest(BaseModel):
    category: str

# Database-based category management
# Categories are now stored in the database and managed per user

def _get_categories_for_user(user_id: str) -> List[Dict]:
    """Fetch categories from database and map to response shape used by the frontend."""
    categories = DatabaseService.get_categories(user_id)
    if not categories:
        DatabaseService.create_default_categories(user_id)
        categories = DatabaseService.get_categories(user_id)
    return [
        {
            "id": str(cat.get("id")),
            "name": cat.get("name"),
            "keywords": cat.get("keywords", []),
            "group": cat.get("group_name", "Other"),
        }
        for cat in categories or []
    ]

def _get_transaction_override(user_id: str, transaction_key: str):
    overrides = DatabaseService.get_transaction_overrides(user_id)
    if transaction_key in overrides:
        return {"new_category_name": overrides.get(transaction_key)}
    return None

def _save_transaction_override(user_id: str, transaction_key: str, category_name: str) -> bool:
    cats = _get_categories_for_user(user_id)
    cat = next((c for c in cats if c["name"] == category_name), None)
    if not cat:
        return False
    return DatabaseService.save_transaction_override(user_id, transaction_key, category_name, cat.get("id"))

def _get_merchant_mapping(user_id: str, merchant_name: str):
    mappings = DatabaseService.get_merchant_mappings(user_id)
    if merchant_name in mappings:
        return {"category_name": mappings.get(merchant_name)}
    return None

def _save_merchant_mapping(user_id: str, merchant_name: str, category_name: str) -> bool:
    cats = _get_categories_for_user(user_id)
    cat = next((c for c in cats if c["name"] == category_name), None)
    return DatabaseService.save_merchant_mapping(user_id, merchant_name, category_name, cat.get("id") if cat else None)

def _get_zelle_map(user_id: str) -> Dict[str, str]:
    return DatabaseService.get_zelle_recipients(user_id)

def _save_zelle_recipient(user_id: str, recipient_name: str, category_name: str) -> bool:
    cats = _get_categories_for_user(user_id)
    cat = next((c for c in cats if c["name"] == category_name), None)
    return DatabaseService.save_zelle_recipient(user_id, recipient_name, category_name, cat.get("id") if cat else None)

def extract_zelle_recipient(description: str) -> str:
    """Extract recipient name from Zelle payment description"""
    import re
    
    print(f"🔍 Checking for Zelle payment: '{description}'")
    
    # Check if this is a Zelle payment
    if not re.search(r'zelle payment to', description.lower()):
        return None
    
    print(f"✅ Zelle payment detected")
    
    # Extract recipient name - pattern: "Zelle payment to [Name] [phone/numbers]"
    # Example: "Zelle payment to Doris 25858144732"
    # Example: "Zelle payment to Yamilka Maikel 25858181820"
    
    match = re.search(r'zelle payment to\s+([^0-9]+)', description.lower())
    if match:
        recipient = match.group(1).strip().title()  # Convert to Title Case
        print(f"📱 Extracted Zelle recipient: '{recipient}'")
        return recipient
    
    return None

def is_zelle_payment(description: str) -> bool:
    """Check if transaction is a Zelle payment"""
    return 'zelle payment to' in description.lower()

def extract_merchant_name(description: str) -> str:
    """Extract merchant name from transaction description for intelligent matching"""
    import re
    
    print(f"🔍 Backend extracting merchant from: '{description}'")
    
    # Clean the description
    desc = description.strip().upper()
    print(f"Step 1 - Uppercase: '{desc}'")
    
    # Remove common patterns that aren't part of merchant name
    # Remove dates (MM/DD, DD/MM, etc.)
    desc = re.sub(r'\b\d{1,2}/\d{1,2}\b', '', desc)
    desc = re.sub(r'\b\d{2}/\d{2}/\d{2,4}\b', '', desc)
    print(f"Step 2 - Remove dates: '{desc}'")
    
    # Remove card numbers and reference numbers (6+ digits)
    desc = re.sub(r'\b\d{6,}\b', '', desc)
    print(f"Step 3 - Remove long numbers: '{desc}'")
    
    # Remove common state suffixes
    desc = re.sub(r'\s+(FL|CA|NY|TX|GA|NC|SC|VA|MD|PA|NJ|CT|MA|OH|MI|IL|IN|WI|MN|IA|MO|AR|LA|MS|AL|TN|KY|WV|DE|DC|WA)\s*$', '', desc)
    print(f"Step 4 - Remove states: '{desc}'")
    
    # Remove store numbers and location codes (improved patterns)
    desc = re.sub(r'\s*#\d+\s*', ' ', desc)  # Remove #03, #05 patterns
    desc = re.sub(r'\s+\d{3,6}\s*', ' ', desc)  # Remove 03655, 05924 patterns (not just at end)
    print(f"Step 5 - Remove store numbers: '{desc}'")
    
    # Remove Amazon transaction IDs and similar patterns
    desc = re.sub(r'\*[A-Z0-9]{6,}', '', desc)  # Remove *LH1XA4I, *0Q6L99D, *AB9Q32ZG3
    desc = re.sub(r'MKTPL\*[A-Z0-9]+', 'MKTPL', desc)  # Simplify AMAZON MKTPL*XXX to AMAZON MKTPL
    print(f"Step 6 - Remove transaction IDs: '{desc}'")
    
    # Remove common suffixes that aren't merchant names
    desc = re.sub(r'\s+AMZN\.COM/BILL.*$', '', desc)  # Remove Amzn.com/bill WA
    desc = re.sub(r'\s+MIAMI.*$', '', desc)  # Remove MIAMI and everything after
    print(f"Step 7 - Remove common suffixes: '{desc}'")
    
    # Clean up extra spaces
    desc = re.sub(r'\s+', ' ', desc).strip()
    print(f"Step 8 - Clean spaces: '{desc}'")
    
    # Special handling for known merchant patterns
    if 'CVS' in desc and 'PHARMACY' in desc:
        merchant = 'CVS/PHARMACY'
    elif 'AMAZON' in desc:
        # Normalize all Amazon transactions to just "AMAZON" for consistency
        merchant = 'AMAZON'
    else:
        # Get the main merchant name (first 2 words for consistency)
        words = desc.split()
        if len(words) >= 2:
            merchant = ' '.join(words[:2])
        elif len(words) == 1:
            merchant = words[0]
        else:
            merchant = desc
    
    print(f"Final backend merchant name: '{merchant}'")
    return merchant.strip()

def get_transaction_key(description: str, amount: float, date: str = None) -> str:
    """Generate a unique, URL-safe key for a transaction"""
    import hashlib
    
    # Create a string to hash
    key_parts = [str(description).strip(), str(amount)]
    if date:
        key_parts.append(str(date))
    
    # Create a hash of the transaction data for uniqueness
    transaction_string = "|".join(key_parts)
    hash_object = hashlib.md5(transaction_string.encode())
    hash_hex = hash_object.hexdigest()
    
    # Create a readable prefix from description (first 20 chars, URL-safe)
    clean_desc = ''.join(c for c in description[:20] if c.isalnum() or c in '-_').strip()
    if not clean_desc:
        clean_desc = "transaction"
    
    # Combine readable prefix with hash for uniqueness
    return f"{clean_desc}_{hash_hex[:8]}"

# Expense categorization logic
def categorize_expense(user_id: str, description: str, amount: float = None, date: str = None) -> tuple:
    """
    Categorize expense based on overrides, Zelle recipients, merchant matching, keywords, or fallback to hash distribution
    Returns tuple of (category_name, status) where status is 'saved', 'override', or 'new'
    """
    # Check for manual overrides first
    if amount is not None:
        transaction_key = get_transaction_key(description, amount, date)
        override = _get_transaction_override(user_id, transaction_key)
        if override:
            return override["new_category_name"], 'saved'  # Manual overrides are considered 'saved'
    
    # Check for Zelle payments (special handling)
    if is_zelle_payment(description):
        recipient = extract_zelle_recipient(description)
        if recipient:
            zelle_mappings = _get_zelle_map(user_id)
            if recipient in zelle_mappings:
                print(f"📱 Zelle payment to {recipient} categorized as {zelle_mappings[recipient]}")
                return zelle_mappings[recipient], 'saved'  # Zelle recipient matches are 'saved'
    
    # Check for merchant matching (skip for Zelle payments)
    if not is_zelle_payment(description):
        merchant_name = extract_merchant_name(description)
        merchant_mapping = _get_merchant_mapping(user_id, merchant_name)
        if merchant_mapping:
            return merchant_mapping["category_name"], 'saved'  # Merchant matches are 'saved'
    
    categories = _get_categories_for_user(user_id)
    description_lower = description.lower().strip()
    
    # Try keyword matching
    for category in categories:
        for keyword in category.get('keywords', []):
            if keyword.lower() in description_lower:
                return category['name'], 'saved'  # Keyword matches are 'saved'
    
    # Fallback to hash-based distribution to ensure all categories appear
    category_names = [cat['name'] for cat in categories]
    if category_names:
        hash_value = hash(description_lower) % len(category_names)
        return category_names[hash_value], 'new'  # Hash-based assignments are 'new'
    
    return "Uncategorized", 'new'

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Financial Pro API is running"}

@app.get("/debug")
async def debug_endpoint(current_user: dict = Depends(get_user_or_dev_mode)):
    """Debug endpoint to check user and categories"""
    try:
        user_id = current_user["id"]
        
        # Get categories using different methods
        categories_main = _get_categories_for_user(user_id)
        categories_db = DatabaseService.get_categories(user_id)
        
        return {
            "user_id": user_id,
            "user_email": current_user.get("email"),
            "environment": os.getenv("ENVIRONMENT", "production"),
            "categories_main_count": len(categories_main),
            "categories_db_count": len(categories_db),
            "sample_categories": categories_main[:3] if categories_main else [],
            "database_service_sample": categories_db[:3] if categories_db else []
        }
    except Exception as e:
        return {"error": str(e), "user": current_user}

# Category management endpoints
@app.get("/categories")
async def get_categories(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all categories for the current user"""
    try:
        user_id = current_user["id"]
        categories = _get_categories_for_user(user_id)
        return {"categories": categories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting categories: {str(e)}")

@app.post("/categories")
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_user_or_dev_mode)):
    """Create a new category for the current user"""
    try:
        user_id = current_user["id"]
        
        # Check if category already exists
        existing_category = next((c for c in _get_categories_for_user(user_id) if c["name"] == category.name), None)
        if existing_category:
            raise HTTPException(status_code=400, detail="Category already exists")
        
        # Create new category in database
        new_category = DatabaseService.create_category(
            user_id, 
            category.name, 
            category.keywords, 
            category.group
        )
        
        if not new_category:
            raise HTTPException(status_code=500, detail="Failed to create category")
        
        # Convert to legacy format for response
        response_category = {
            "id": str(new_category["id"]),
            "name": new_category["name"],
            "keywords": new_category.get("keywords", []),
            "group": new_category.get("group_name", "Other")
        }
        
        return {"message": "Category created successfully", "category": response_category}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating category: {str(e)}")

@app.put("/categories/{category_id}")
async def update_category(category_id: str, category_update: CategoryUpdate, current_user: dict = Depends(get_user_or_dev_mode)):
    """Update an existing category (DB-backed)"""
    try:
        user_id = current_user["id"]
        updates: Dict[str, Any] = {}
        if category_update.name is not None:
            updates['name'] = category_update.name
        if category_update.keywords is not None:
            updates['keywords'] = category_update.keywords
        if category_update.group is not None:
            updates['group_name'] = category_update.group
        if not updates:
            return {"message": "No changes provided"}
        updated = DatabaseService.update_category(user_id, category_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Category not found or update failed")
        # Map to frontend shape
        response_category = {
            "id": str(updated.get("id")),
            "name": updated.get("name"),
            "keywords": updated.get("keywords", []),
            "group": updated.get("group_name", "Other"),
        }
        return {"message": "Category updated successfully", "category": response_category}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating category: {str(e)}")

@app.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Delete a category (DB-backed)"""
    try:
        user_id = current_user["id"]
        success = DatabaseService.delete_category(user_id, category_id)
        if not success:
            raise HTTPException(status_code=404, detail="Category not found or delete failed")
        return {"message": "Category deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting category: {str(e)}")

@app.post("/transactions/reset-categories")
async def reset_all_transaction_categories(current_user: dict = Depends(get_user_or_dev_mode)):
    """Reset categories and learned data in the database for the current user"""
    try:
        user_id = current_user["id"]
        # Clear overrides, merchant mappings, zelle recipients and reset transactions via DatabaseService
        DatabaseService.clear_all_transaction_overrides(user_id)
        DatabaseService.clear_all_merchant_mappings(user_id)
        DatabaseService.clear_all_zelle_recipients(user_id)
        DatabaseService.reset_all_transaction_categories(user_id)
        return {"message": "All transaction categories and learned mappings have been reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting categories: {str(e)}")

# Transaction category management endpoints
@app.put("/transactions/category")
async def update_transaction_category(update: TransactionCategoryUpdate, current_user: dict = Depends(get_user_or_dev_mode)):
    """Update category for a specific transaction (DB-backed)."""
    try:
        user_id = current_user["id"]
        # The legacy endpoint isn't used by the UI, but wire it to DB to avoid JSON usage
        success = DatabaseService.update_transaction_category(user_id, str(update.transaction_id), update.category)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update transaction category")
        return {"message": "Transaction category updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating transaction category: {str(e)}")

@app.post("/transactions/{transaction_key}/category")
async def set_transaction_category(transaction_key: str, category: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Set category for a specific transaction using transaction key (DB-backed)."""
    try:
        user_id = current_user["id"]
        success = DatabaseService.update_transaction_category(user_id, transaction_key, category)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to set transaction category")
        return {"message": "Transaction category set successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting transaction category: {str(e)}")

@app.put("/transactions/{transaction_key}/category")
async def update_transaction_category_by_key(transaction_key: str, category_data: CategoryUpdateRequest, current_user: dict = Depends(get_user_or_dev_mode)):
    """Update category for a specific transaction using transaction key and learn from it"""
    try:
        print(f"Received PUT request for transaction_key: {transaction_key}")
        print(f"Category data: {category_data}")
        
        user_id = current_user["id"]
        category = category_data.category
        print(f"Extracted category: {category}")
        
        # Save the specific transaction override
        success = _save_transaction_override(user_id, transaction_key, category)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save transaction override")
        
        print(f"Successfully updated category for {transaction_key} to {category}")
        return {
            "message": "Transaction category updated successfully", 
            "transaction_key": transaction_key, 
            "category": category,
            "learned_merchant": True  # Signal that we should update similar transactions
        }
    except Exception as e:
        print(f"Error updating transaction category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating transaction category: {str(e)}")

@app.post("/transactions/{transaction_key}/learn")
async def learn_from_transaction(transaction_key: str, request_data: dict, current_user: dict = Depends(get_user_or_dev_mode)):
    """Learn merchant pattern from a transaction and update similar transactions"""
    try:
        user_id = current_user["id"]
        description = request_data.get('description', '')
        category = request_data.get('category', '')
        
        if not description or not category:
            raise HTTPException(status_code=400, detail="Description and category are required")
        
        print(f"Learning from transaction: {description} -> {category}")
        
        # Extract merchant name
        merchant_name = extract_merchant_name(description)
        print(f"Extracted merchant name: {merchant_name}")
        
        # Save merchant mapping
        success = _save_merchant_mapping(user_id, merchant_name, category)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save merchant mapping")
        
        print(f"Saved merchant mapping: {merchant_name} -> {category}")
        
        return {
            "message": "Merchant pattern learned successfully",
            "merchant": merchant_name,
            "category": category
        }
    except Exception as e:
        print(f"Error learning from transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error learning from transaction: {str(e)}")

@app.delete("/transactions/{transaction_key}/category")
async def remove_transaction_category_override(transaction_key: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Remove category override for a specific transaction (DB-backed)"""
    try:
        user_id = current_user["id"]
        from supabase_client import supabase
        result = supabase.table('transaction_overrides').delete().eq('user_id', user_id).eq('transaction_key', transaction_key).execute()
        if result.data is None or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Transaction override not found")
        return {"message": "Transaction category override removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing transaction category override: {str(e)}")

@app.post("/process-expenses")
async def process_expenses(file: UploadFile = File(...), current_user: dict = Depends(get_user_or_dev_mode)):
    """
    Process uploaded Excel or CSV file and return categorized expense data
    """
    try:
        print(f"Received file: {file.filename}, Content-Type: {file.content_type}")
        return await process_single_file_internal(file, current_user)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

async def process_single_file_internal(file: UploadFile, current_user: dict) -> dict:
    """Internal function to process a single file - used by both single and multi-file endpoints"""
    # Log file details for debugging
    print(f"Processing file: {file.filename}, Content-Type: {file.content_type}")
    user_id = current_user["id"]
    
    # Validate file type (case-insensitive)
    filename_lower = file.filename.lower()
    if not filename_lower.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail=f"Invalid file type for {file.filename}. Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)")
    
    # Read the file based on its type
    contents = await file.read()
    
    if filename_lower.endswith('.csv'):
        # Read CSV file
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except Exception as csv_error:
            # Try with different encoding if UTF-8 fails
            try:
                df = pd.read_csv(io.BytesIO(contents), encoding='latin-1')
            except Exception as encoding_error:
                raise HTTPException(status_code=400, detail=f"Error reading CSV file {file.filename}: {str(csv_error)}")
    else:
        # Read Excel file
        df = pd.read_excel(io.BytesIO(contents))
    
    # [All the existing processing logic from process_expenses endpoint would go here]
    # For brevity, I'll use the existing logic and return the same structure
    
    # This is a simplified version - you'd copy all the processing logic from the existing endpoint
    # Validate required columns (flexible column names)
    required_columns = ['description', 'amount']
    df_columns_lower = [col.lower().strip() for col in df.columns]
    
    # Map common column variations
    column_mapping = {}
    for req_col in required_columns:
        found = False
        for i, col in enumerate(df_columns_lower):
            if req_col in col or col in req_col:
                column_mapping[req_col] = df.columns[i]
                found = True
                break
        if not found:
            # Try alternative names
            if req_col == 'description':
                for alt in ['desc', 'transaction', 'details', 'memo', 'note', 'merchant', 'payee', 'vendor']:
                    for i, col in enumerate(df_columns_lower):
                        if alt in col or col in alt:
                            column_mapping[req_col] = df.columns[i]
                            found = True
                            break
                    if found:
                        break
            elif req_col == 'amount':
                # First try common amount column names
                for alt in ['value', 'cost', 'price', 'total', 'sum', 'debit', 'credit']:
                    for i, col in enumerate(df_columns_lower):
                        if alt in col or col in alt:
                            # Check if this column actually contains numeric data
                            sample_values = df.iloc[:5, i].astype(str).str.replace('$', '').str.replace(',', '')
                            numeric_count = sum(1 for val in sample_values if val.replace('-', '').replace('.', '').isdigit())
                            if numeric_count >= 2:  # At least 2 numeric values in first 5 rows
                                column_mapping[req_col] = df.columns[i]
                                found = True
                                break
                    if found:
                        break
                
                # If still not found, check Details column for amounts (common in Chase files)
                if not found:
                    for i, col in enumerate(df_columns_lower):
                        if 'detail' in col:
                            column_mapping[req_col] = df.columns[i]
                            found = True
                            break
        
        if not found:
            available_columns = ', '.join(df.columns)
            raise HTTPException(
                status_code=400, 
                detail=f"Required column '{req_col}' not found in {file.filename}. Available columns: {available_columns}. Please ensure your file has columns for description and amount."
            )
    
    # Special handling for misaligned Chase CSV files
    if 'Description' in df.columns and 'Posting Date' in df.columns:
        # Check if Description column contains numeric data (actual amounts)
        desc_sample = df['Description'].head(5)
        if desc_sample.dtype in ['float64', 'int64'] or all(isinstance(x, (int, float)) for x in desc_sample.dropna()):
            print(f"Detected misaligned Chase CSV in {file.filename} - using Description column for amounts and Posting Date for descriptions")
            column_mapping = {
                'description': 'Posting Date',  # Descriptions are in Posting Date column
                'amount': 'Description'         # Amounts are in Description column
            }
    
    # Create reverse mapping to rename the found columns to lowercase standard names
    rename_mapping = {v: k for k, v in column_mapping.items()}
    df = df.rename(columns=rename_mapping)
    
    # Clean and process data
    df = df.dropna(subset=['description', 'amount'])
    
    # Ensure amount is numeric
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
    df = df.dropna(subset=['amount'])
    
    # Add category column with amount and date information
    def categorize_with_context(row):
        if row['amount'] >= 0:
            # Categorize different types of income
            description_lower = row['description'].lower()
            if 'payroll' in description_lower or 'salary' in description_lower or 'wages' in description_lower:
                return 'Payroll'
            elif 'refund' in description_lower or 'return' in description_lower:
                return 'Refund'
            elif 'deposit' in description_lower and 'payroll' not in description_lower:
                return 'Deposit'
            elif 'interest' in description_lower:
                return 'Interest'
            elif 'dividend' in description_lower:
                return 'Dividend'
            else:
                return 'Income'  # Generic income category
        
        date_val = row.get('date', None) if 'date' in df.columns else None
        category, status = categorize_expense(user_id, row['description'], row['amount'], date_val)
        return category
    
    def get_status_with_context(row):
        if row['amount'] >= 0:
            return 'income'  # Mark positive amounts as income
        
        date_val = row.get('date', None) if 'date' in df.columns else None
        category, status = categorize_expense(user_id, row['description'], row['amount'], date_val)
        return status
    
    df['category'] = df.apply(categorize_with_context, axis=1)
    df['status'] = df.apply(get_status_with_context, axis=1)
    
    # Calculate summary statistics - separate income from expenses
    expenses_df = df[df['amount'] < 0].copy()  # Only negative amounts (expenses)
    income_df = df[df['amount'] >= 0].copy()   # Only positive amounts (income)
    
    total_expenses = float(expenses_df['amount'].sum())  # negative total expenses
    total_income = float(income_df['amount'].sum()) if len(income_df) > 0 else 0.0  # positive total income
    total_transactions = len(df)
    expense_transactions = len(expenses_df)
    income_transactions = len(income_df)
    
    # Category breakdown based on expenses only
    category_summary = expenses_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
    category_summary.columns = ['category', 'total_amount', 'transaction_count']
    
    # Use absolute values for display and percentage calculation
    total_abs_expenses = float(expenses_df['amount'].abs().sum())
    category_summary['total_amount'] = category_summary['total_amount'].abs()
    category_summary['percentage'] = (
        category_summary['total_amount'] / total_abs_expenses * 100
    ).round(2) if total_abs_expenses > 0 else 0
    
    # Convert to list of dictionaries for JSON response
    category_data = category_summary.to_dict('records')
    
    # Income breakdown by income type
    income_data = []
    if len(income_df) > 0:
        income_summary = income_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
        income_summary.columns = ['category', 'total_amount', 'transaction_count']
        
        # Calculate percentages for income types
        income_summary['percentage'] = (
            income_summary['total_amount'] / total_income * 100
        ).round(2) if total_income > 0 else 0
        
        # Convert to list of dictionaries for JSON response
        income_data = income_summary.to_dict('records')
    
    # Create grouped category summary
    def create_grouped_summary(category_data):
        categories = _get_categories_for_user(user_id)
        category_to_group = {cat['name']: cat.get('group', 'Other') for cat in categories}
        
        # Group categories by their group classification
        grouped_data = {}
        for cat_data in category_data:
            group = category_to_group.get(cat_data['category'], 'Other')
            if group not in grouped_data:
                grouped_data[group] = {
                    'group': group,
                    'total_amount': 0,
                    'transaction_count': 0,
                    'categories': []
                }
            
            grouped_data[group]['total_amount'] += cat_data['total_amount']
            grouped_data[group]['transaction_count'] += cat_data['transaction_count']
            grouped_data[group]['categories'].append(cat_data)
        
        # Calculate percentages for groups
        total_amount = sum(group['total_amount'] for group in grouped_data.values())
        for group in grouped_data.values():
            group['percentage'] = round((group['total_amount'] / total_amount * 100), 2) if total_amount > 0 else 0
        
        return list(grouped_data.values())
    
    grouped_category_data = create_grouped_summary(category_data)
    
    # Transaction details - include date if available
    transaction_columns = ['description', 'amount', 'category', 'status']
    
    # Check if we have date information and add it
    date_column = None
    for col in df.columns:
        if 'date' in col.lower() or col.lower() in ['details']:
            if col.lower() == 'details':
                date_column = col
                break
            elif 'date' in col.lower():
                date_column = col
                break
    
    if date_column:
        transaction_columns.insert(0, 'date')
        df['date'] = df[date_column]
        # Format dates for better display
        try:
            df['date'] = pd.to_datetime(df['date']).dt.strftime('%m/%d/%Y')
        except:
            # If date parsing fails, keep original format
            pass
    
    # Add transaction keys for editing
    def add_transaction_key(row):
        date_val = row.get('date', None) if 'date' in df.columns else None
        key = get_transaction_key(row['description'], row['amount'], date_val)
        return key
    
    df['transaction_key'] = df.apply(add_transaction_key, axis=1)
    transaction_columns.append('transaction_key')
    
    transactions = df[transaction_columns].to_dict('records')
    
    # Monthly breakdown (if date column exists)
    monthly_data = []
    date_columns = [col for col in df.columns if 'date' in col.lower()]
    if date_columns:
        try:
            df['date'] = pd.to_datetime(df[date_columns[0]])
            df['month_year'] = df['date'].dt.to_period('M').astype(str)
            monthly_summary = df.groupby('month_year')['amount'].sum().reset_index()
            monthly_data = monthly_summary.to_dict('records')
        except:
            # If date parsing fails, continue without monthly data
            pass
    
    return {
        "success": True,
        "filename": file.filename,
        "summary": {
            "total_expenses": total_expenses,
            "total_income": total_income,
            "total_transactions": total_transactions,
            "expense_transactions": expense_transactions,
            "income_transactions": income_transactions,
            "categories": category_data,
            "grouped_categories": grouped_category_data,
            "income_categories": income_data
        },
        "transactions": transactions,
        "monthly_data": monthly_data,
        "message": f"Successfully processed {total_transactions} transactions ({expense_transactions} expenses, {income_transactions} income)"
    }

@app.post("/process-multiple-expenses")
async def process_multiple_expenses(files: List[UploadFile] = File(...), current_user: dict = Depends(get_user_or_dev_mode)):
    """
    Process multiple uploaded Excel or CSV files and return individual reports plus summary
    """
    try:
        if len(files) == 0:
            raise HTTPException(status_code=400, detail="No files provided")
        
        print(f"Processing {len(files)} files")
        
        reports = []
        all_expenses = 0.0
        all_income = 0.0
        all_transactions = 0
        all_expense_transactions = 0
        all_income_transactions = 0
        
        # Process each file individually
        for file in files:
            try:
                print(f"Processing file: {file.filename}")
                result = await process_single_file_internal(file, current_user)
                reports.append(result)
                
                # Accumulate totals
                all_expenses += result['summary']['total_expenses']
                all_income += result['summary']['total_income']
                all_transactions += result['summary']['total_transactions']
                all_expense_transactions += result['summary']['expense_transactions']
                all_income_transactions += result['summary']['income_transactions']
                
            except Exception as file_error:
                print(f"Error processing file {file.filename}: {file_error}")
                # Continue with other files, but include error info
                reports.append({
                    "success": False,
                    "filename": file.filename,
                    "error": str(file_error),
                    "summary": {
                        "total_expenses": 0,
                        "total_income": 0,
                        "total_transactions": 0,
                        "expense_transactions": 0,
                        "income_transactions": 0,
                        "categories": [],
                        "grouped_categories": [],
                        "income_categories": []
                    },
                    "transactions": [],
                    "monthly_data": [],
                    "message": f"Error processing {file.filename}: {str(file_error)}"
                })
        
        # Calculate net amount for summary
        net_amount = all_income - abs(all_expenses)
        
        # Create combined summary
        summary = {
            "total_expenses": all_expenses,
            "total_income": all_income,
            "net_amount": net_amount,
            "total_transactions": all_transactions,
            "expense_transactions": all_expense_transactions,
            "income_transactions": all_income_transactions
        }
        
        return {
            "success": True,
            "reports": reports,
            "summary": summary,
            "total_files": len(files),
            "successful_files": len([r for r in reports if r.get('success', False)]),
            "message": f"Successfully processed {len([r for r in reports if r.get('success', False)])} out of {len(files)} files"
        }
        
    except Exception as e:
        print(f"Error processing multiple files: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing files: {str(e)}")

# Zelle recipient management endpoints
@app.get("/zelle-recipients")
async def get_zelle_recipients(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all Zelle recipient mappings for the current user"""
    try:
        user_id = current_user["id"]
        recipients = _get_zelle_map(user_id)
        return {"recipients": recipients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading Zelle recipients: {str(e)}")

@app.post("/zelle-recipients")
async def add_zelle_recipient(recipient_data: dict, current_user: dict = Depends(get_user_or_dev_mode)):
    """Add or update a Zelle recipient mapping for the current user"""
    try:
        user_id = current_user["id"]
        recipient_name = recipient_data.get('recipient')
        category = recipient_data.get('category')
        
        if not recipient_name or not category:
            raise HTTPException(status_code=400, detail="Recipient name and category are required")
        
        success = _save_zelle_recipient(user_id, recipient_name, category)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save Zelle recipient mapping")
        
        return {"message": "Zelle recipient mapping added successfully", "recipient": recipient_name, "category": category}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding Zelle recipient: {str(e)}")

@app.delete("/zelle-recipients/{recipient_name}")
async def delete_zelle_recipient(recipient_name: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Delete a Zelle recipient mapping (DB-backed)"""
    try:
        user_id = current_user["id"]
        # Implement delete by setting is_active=false or deleting the row
        # Here we'll delete the row
        from supabase_client import supabase
        result = supabase.table('zelle_recipients').delete().eq('user_id', user_id).eq('recipient_name', recipient_name).execute()
        if result.data is None or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Zelle recipient not found")
        return {"message": "Zelle recipient mapping deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting Zelle recipient: {str(e)}")

# User profile endpoints
@app.get("/user/profile")
async def get_user_profile(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get current user's profile information"""
    try:
        user_id = current_user["id"]
        
        # For development mode, return mock profile
        if current_user.get("email") == "dev@example.com":
            return {
                "id": user_id,
                "email": current_user.get("email"),
                "full_name": "Development User",
                "user_role": "individual",
                "business_id": None,
                "is_active": True
            }
        
        # For real users, try to get profile from database service
        # If DatabaseService is not available, return basic profile
        try:
            from database_service import DatabaseService
            profile = DatabaseService.get_or_create_user_profile(user_id, current_user.get("email"))
            if profile:
                return profile
        except ImportError:
            # DatabaseService not available, return basic profile
            pass
        
        # Fallback: return basic profile based on user data
        return {
            "id": user_id,
            "email": current_user.get("email"),
            "full_name": current_user.get("user_metadata", {}).get("full_name", "User"),
            "user_role": "individual",
            "business_id": None,
            "is_active": True
        }
        
    except Exception as e:
        print(f"Error getting user profile: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting user profile: {str(e)}")

# Business endpoints (basic implementations)
@app.post("/business/create")
async def create_business(request_data: dict, current_user: dict = Depends(get_user_or_dev_mode)):
    """Create a new business account"""
    try:
        business_name = request_data.get("business_name")
        business_email = request_data.get("business_email")
        
        if not business_name:
            raise HTTPException(status_code=400, detail="Business name is required")
        
        # For now, return success message
        # In a full implementation, this would create business in database
        return {
            "message": "Business created successfully", 
            "business": {
                "id": f"biz_{current_user['id']}",
                "name": business_name,
                "email": business_email,
                "owner_id": current_user["id"]
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating business: {str(e)}")

@app.get("/business/info")
async def get_business_info(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get business information for current user"""
    try:
        # For now, return mock business info
        # In a full implementation, this would query the database
        return {
            "id": f"biz_{current_user['id']}",
            "name": "Sample Business",
            "email": current_user.get("email"),
            "owner_id": current_user["id"],
            "created_at": "2025-01-18T00:00:00Z"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting business info: {str(e)}")

@app.get("/business/clients")
async def get_business_clients(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all clients for the current business"""
    try:
        # For now, return empty clients list
        # In a full implementation, this would query the database
        return {"clients": []}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting business clients: {str(e)}")

@app.post("/business/clients")
async def add_business_client(client_data: dict, current_user: dict = Depends(get_user_or_dev_mode)):
    """Add a new client to the business"""
    try:
        name = client_data.get("name")
        email = client_data.get("email")
        phone = client_data.get("phone", "")
        
        if not name or not email:
            raise HTTPException(status_code=400, detail="Name and email are required")
        
        # For now, return success message
        # In a full implementation, this would add client to database
        return {
            "message": "Client added successfully",
            "client": {
                "id": f"client_{len(name)}",
                "name": name,
                "email": email,
                "phone": phone,
                "business_id": f"biz_{current_user['id']}"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding client: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

