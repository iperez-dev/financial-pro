from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from typing import Dict, List, Any
import re
import json
import os
from pydantic import BaseModel

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

# Categories file path
CATEGORIES_FILE = "categories.json"
TRANSACTION_OVERRIDES_FILE = "transaction_overrides.json"
MERCHANT_MAPPINGS_FILE = "merchant_mappings.json"
ZELLE_RECIPIENTS_FILE = "zelle_recipients.json"

# Default categories
DEFAULT_CATEGORIES = [
    {"id": "mortgage", "name": "Mortgage", "keywords": ["mortgage", "home loan"], "group": "Housing"},
    {"id": "hoa", "name": "HOA", "keywords": ["hoa", "homeowners", "association"], "group": "Housing"},
    {"id": "city_gas", "name": "City Gas", "keywords": ["city gas", "gas utility", "natural gas"], "group": "Utilities"},
    {"id": "fpl", "name": "FPL", "keywords": ["fpl", "florida power", "electric"], "group": "Utilities"},
    {"id": "internet", "name": "Internet", "keywords": ["internet", "wifi", "broadband", "comcast", "xfinity"], "group": "Utilities"},
    {"id": "phone", "name": "Phone", "keywords": ["phone", "mobile", "cell", "verizon", "att", "t-mobile"], "group": "Utilities"},
    {"id": "toll", "name": "Toll", "keywords": ["toll", "sunpass", "ezpass", "turnpike"], "group": "Transportation"},
    {"id": "gas_station", "name": "Gas Station", "keywords": ["gas station", "shell", "bp", "exxon", "chevron", "fuel"], "group": "Transportation"},
    {"id": "student_loan", "name": "Student Loan", "keywords": ["student loan", "education", "navient", "sallie mae"], "group": "Education"},
    {"id": "car_insurance", "name": "Car Insurance", "keywords": ["car insurance", "auto insurance", "geico", "state farm", "progressive"], "group": "Insurance"},
    {"id": "credit_card_jenny", "name": "Credit Card Jenny", "keywords": ["jenny", "credit card jenny"], "group": "Credit Cards"},
    {"id": "credit_card_ivan", "name": "Credit Card Ivan", "keywords": ["ivan", "credit card ivan"], "group": "Credit Cards"},
    {"id": "childcare", "name": "ChildCare", "keywords": ["childcare", "daycare", "babysitter", "nanny"], "group": "Family"}
]

# Category management functions
def load_categories():
    """Load categories from JSON file or create default ones"""
    if os.path.exists(CATEGORIES_FILE):
        try:
            with open(CATEGORIES_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    
    # Create default categories file
    save_categories(DEFAULT_CATEGORIES)
    return DEFAULT_CATEGORIES

def save_categories(categories):
    """Save categories to JSON file"""
    with open(CATEGORIES_FILE, 'w') as f:
        json.dump(categories, f, indent=2)

def get_category_by_id(category_id: str):
    """Get category by ID"""
    categories = load_categories()
    return next((cat for cat in categories if cat['id'] == category_id), None)

def load_transaction_overrides():
    """Load transaction category overrides from JSON file"""
    if os.path.exists(TRANSACTION_OVERRIDES_FILE):
        try:
            with open(TRANSACTION_OVERRIDES_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_transaction_overrides(overrides):
    """Save transaction category overrides to JSON file"""
    with open(TRANSACTION_OVERRIDES_FILE, 'w') as f:
        json.dump(overrides, f, indent=2)

def load_merchant_mappings():
    """Load merchant-to-category mappings from JSON file"""
    if os.path.exists(MERCHANT_MAPPINGS_FILE):
        try:
            with open(MERCHANT_MAPPINGS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_merchant_mappings(mappings):
    """Save merchant-to-category mappings to JSON file"""
    with open(MERCHANT_MAPPINGS_FILE, 'w') as f:
        json.dump(mappings, f, indent=2)

def load_zelle_recipients():
    """Load Zelle recipient-to-category mappings from JSON file"""
    if os.path.exists(ZELLE_RECIPIENTS_FILE):
        try:
            with open(ZELLE_RECIPIENTS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    
    # Default Zelle recipient mappings
    default_mappings = {
        "Doris": "Phone",
        "Yamilka Maikel": "ChildCare"
    }
    save_zelle_recipients(default_mappings)
    return default_mappings

def save_zelle_recipients(mappings):
    """Save Zelle recipient-to-category mappings to JSON file"""
    with open(ZELLE_RECIPIENTS_FILE, 'w') as f:
        json.dump(mappings, f, indent=2)

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
def categorize_expense(description: str, amount: float = None, date: str = None) -> tuple:
    """
    Categorize expense based on overrides, Zelle recipients, merchant matching, keywords, or fallback to hash distribution
    Returns tuple of (category_name, status) where status is 'saved', 'override', or 'new'
    """
    # Check for manual overrides first
    if amount is not None:
        transaction_key = get_transaction_key(description, amount, date)
        overrides = load_transaction_overrides()
        if transaction_key in overrides:
            return overrides[transaction_key], 'saved'  # Manual overrides are considered 'saved'
    
    # Check for Zelle payments (special handling)
    if is_zelle_payment(description):
        recipient = extract_zelle_recipient(description)
        if recipient:
            zelle_mappings = load_zelle_recipients()
            if recipient in zelle_mappings:
                print(f"📱 Zelle payment to {recipient} categorized as {zelle_mappings[recipient]}")
                return zelle_mappings[recipient], 'saved'  # Zelle recipient matches are 'saved'
    
    # Check for merchant matching (skip for Zelle payments)
    if not is_zelle_payment(description):
        merchant_name = extract_merchant_name(description)
        merchant_mappings = load_merchant_mappings()
        if merchant_name in merchant_mappings:
            return merchant_mappings[merchant_name], 'saved'  # Merchant matches are 'saved'
    
    categories = load_categories()
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

# Category management endpoints
@app.get("/categories")
async def get_categories():
    """Get all categories"""
    categories = load_categories()
    return {"categories": categories}

@app.post("/categories")
async def create_category(category: CategoryCreate):
    """Create a new category"""
    categories = load_categories()
    
    # Generate ID from name
    category_id = category.name.lower().replace(' ', '_').replace('-', '_')
    
    # Check if category already exists
    if any(cat['id'] == category_id for cat in categories):
        raise HTTPException(status_code=400, detail="Category already exists")
    
    new_category = {
        "id": category_id,
        "name": category.name,
        "keywords": category.keywords
    }
    
    categories.append(new_category)
    save_categories(categories)
    
    return {"message": "Category created successfully", "category": new_category}

@app.put("/categories/{category_id}")
async def update_category(category_id: str, category_update: CategoryUpdate):
    """Update an existing category"""
    categories = load_categories()
    
    # Find category
    category_index = next((i for i, cat in enumerate(categories) if cat['id'] == category_id), None)
    if category_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Update category
    if category_update.name is not None:
        categories[category_index]['name'] = category_update.name
    if category_update.keywords is not None:
        categories[category_index]['keywords'] = category_update.keywords
    
    save_categories(categories)
    
    return {"message": "Category updated successfully", "category": categories[category_index]}

@app.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a category"""
    categories = load_categories()
    
    # Find and remove category
    category_index = next((i for i, cat in enumerate(categories) if cat['id'] == category_id), None)
    if category_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    deleted_category = categories.pop(category_index)
    save_categories(categories)
    
    return {"message": "Category deleted successfully", "category": deleted_category}

# Transaction category management endpoints
@app.put("/transactions/category")
async def update_transaction_category(update: TransactionCategoryUpdate):
    """Update category for a specific transaction"""
    try:
        # For now, we'll use a simple approach where transaction_id is the index
        # In a real app, you'd have proper transaction IDs
        overrides = load_transaction_overrides()
        
        # Store the override using transaction_id as key for now
        # This will be improved when we add proper transaction keys
        overrides[str(update.transaction_id)] = update.category
        save_transaction_overrides(overrides)
        
        return {"message": "Transaction category updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating transaction category: {str(e)}")

@app.post("/transactions/{transaction_key}/category")
async def set_transaction_category(transaction_key: str, category: str):
    """Set category for a specific transaction using transaction key"""
    try:
        overrides = load_transaction_overrides()
        overrides[transaction_key] = category
        save_transaction_overrides(overrides)
        
        return {"message": "Transaction category set successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting transaction category: {str(e)}")

@app.put("/transactions/{transaction_key}/category")
async def update_transaction_category_by_key(transaction_key: str, category_data: CategoryUpdateRequest):
    """Update category for a specific transaction using transaction key and learn from it"""
    try:
        print(f"Received PUT request for transaction_key: {transaction_key}")
        print(f"Category data: {category_data}")
        
        category = category_data.category
        print(f"Extracted category: {category}")
        
        # Save the specific transaction override
        overrides = load_transaction_overrides()
        overrides[transaction_key] = category
        save_transaction_overrides(overrides)
        
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
async def learn_from_transaction(transaction_key: str, request_data: dict):
    """Learn merchant pattern from a transaction and update similar transactions"""
    try:
        description = request_data.get('description', '')
        category = request_data.get('category', '')
        
        if not description or not category:
            raise HTTPException(status_code=400, detail="Description and category are required")
        
        print(f"Learning from transaction: {description} -> {category}")
        
        # Extract merchant name
        merchant_name = extract_merchant_name(description)
        print(f"Extracted merchant name: {merchant_name}")
        
        # Save merchant mapping
        merchant_mappings = load_merchant_mappings()
        merchant_mappings[merchant_name] = category
        save_merchant_mappings(merchant_mappings)
        
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
async def remove_transaction_category_override(transaction_key: str):
    """Remove category override for a specific transaction"""
    try:
        overrides = load_transaction_overrides()
        if transaction_key in overrides:
            del overrides[transaction_key]
            save_transaction_overrides(overrides)
            return {"message": "Transaction category override removed successfully"}
        else:
            raise HTTPException(status_code=404, detail="Transaction override not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing transaction category override: {str(e)}")

@app.post("/process-expenses")
async def process_expenses(file: UploadFile = File(...)):
    """
    Process uploaded Excel or CSV file and return categorized expense data
    """
    try:
        # Log file details for debugging
        print(f"Received file: {file.filename}, Content-Type: {file.content_type}")
        
        # Validate file type (case-insensitive)
        filename_lower = file.filename.lower()
        if not filename_lower.endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)")
        
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
                    raise HTTPException(status_code=400, detail=f"Error reading CSV file: {str(csv_error)}")
        else:
            # Read Excel file
            df = pd.read_excel(io.BytesIO(contents))
        
        # Debug: Print the columns found in the file
        print(f"Columns found in file: {list(df.columns)}")
        
        # Debug: Print sample data from each column to understand the structure
        print("Sample data from each column:")
        for col in df.columns:
            print(f"  {col}: {df[col].head(3).tolist()}")
        
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
                    detail=f"Required column '{req_col}' not found. Available columns: {available_columns}. Please ensure your file has columns for description and amount."
                )
        
        # Special handling for misaligned Chase CSV files
        # Based on debugging, the actual data structure is:
        # Details: dates, Posting Date: descriptions, Description: amounts, Amount: types, Type: balances
        if 'Description' in df.columns and 'Posting Date' in df.columns:
            # Check if Description column contains numeric data (actual amounts)
            desc_sample = df['Description'].head(5)
            if desc_sample.dtype in ['float64', 'int64'] or all(isinstance(x, (int, float)) for x in desc_sample.dropna()):
                print("Detected misaligned Chase CSV - using Description column for amounts and Posting Date for descriptions")
                column_mapping = {
                    'description': 'Posting Date',  # Descriptions are in Posting Date column
                    'amount': 'Description'         # Amounts are in Description column
                }
        
        print(f"Column mapping: {column_mapping}")
        # Create reverse mapping to rename the found columns to lowercase standard names
        rename_mapping = {v: k for k, v in column_mapping.items()}
        print(f"Rename mapping: {rename_mapping}")
        df = df.rename(columns=rename_mapping)
        print(f"Columns after renaming: {list(df.columns)}")
        
        # Clean and process data
        print(f"DataFrame shape before cleaning: {df.shape}")
        df = df.dropna(subset=['description', 'amount'])
        print(f"DataFrame shape after cleaning: {df.shape}")
        
        # Ensure amount is numeric
        print(f"Sample amount values before conversion: {df['amount'].head().tolist()}")
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        print(f"Sample amount values after conversion: {df['amount'].head().tolist()}")
        print(f"Number of NaN values in amount: {df['amount'].isna().sum()}")
        df = df.dropna(subset=['amount'])
        print(f"DataFrame shape after numeric conversion: {df.shape}")
        
        # Add category column with amount and date information - ONLY for negative amounts (expenses)
        def categorize_with_context(row):
            # Only categorize negative amounts (expenses), positive amounts are income
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
            category, status = categorize_expense(row['description'], row['amount'], date_val)
            return category
        
        def get_status_with_context(row):
            # Only categorize negative amounts (expenses), positive amounts are income
            if row['amount'] >= 0:
                return 'income'  # Mark positive amounts as income
            
            date_val = row.get('date', None) if 'date' in df.columns else None
            category, status = categorize_expense(row['description'], row['amount'], date_val)
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
        
        print(f"Total transactions: {total_transactions}")
        print(f"Expense transactions: {expense_transactions}")
        print(f"Income transactions: {income_transactions}")
        print(f"Total expenses: ${total_expenses:.2f}")
        print(f"Total income: ${total_income:.2f}")
        
        # Category breakdown based on expenses only
        category_summary = expenses_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
        category_summary.columns = ['category', 'total_amount', 'transaction_count']
        
        # Use absolute values for display and percentage calculation
        total_abs_expenses = float(expenses_df['amount'].abs().sum())
        category_summary['total_amount'] = category_summary['total_amount'].abs()
        category_summary['percentage'] = (
            category_summary['total_amount'] / total_abs_expenses * 100
        ).round(2)
        
        # Convert to list of dictionaries for JSON response
        category_data = category_summary.to_dict('records')
        
        # Income breakdown by income type
        income_summary = None
        income_data = []
        if len(income_df) > 0:
            income_summary = income_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
            income_summary.columns = ['category', 'total_amount', 'transaction_count']
            
            # Calculate percentages for income types
            income_summary['percentage'] = (
                income_summary['total_amount'] / total_income * 100
            ).round(2)
            
            # Convert to list of dictionaries for JSON response
            income_data = income_summary.to_dict('records')
        
        # Create grouped category summary
        def create_grouped_summary(category_data):
            categories = load_categories()
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
                # For Chase CSV, the 'Details' column contains dates, 'Posting Date' contains descriptions
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
            print(f"Generated key for '{row['description'][:30]}...': {key}")
            return key
        
        print(f"DataFrame columns before adding transaction_key: {list(df.columns)}")
        df['transaction_key'] = df.apply(add_transaction_key, axis=1)
        print(f"DataFrame columns after adding transaction_key: {list(df.columns)}")
        transaction_columns.append('transaction_key')
        
        print(f"Transaction columns: {transaction_columns}")
        print(f"Sample transaction keys: {df['transaction_key'].head(3).tolist()}")
        
        print(f"About to select columns: {transaction_columns}")
        print(f"Available DataFrame columns: {list(df.columns)}")
        
        transactions = df[transaction_columns].to_dict('records')
        
        # Debug: Print first transaction to verify structure
        if transactions:
            print(f"First transaction structure: {transactions[0]}")
            print(f"First transaction keys: {list(transactions[0].keys())}")
        
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
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

# Zelle recipient management endpoints
@app.get("/zelle-recipients")
async def get_zelle_recipients():
    """Get all Zelle recipient mappings"""
    try:
        recipients = load_zelle_recipients()
        return {"recipients": recipients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading Zelle recipients: {str(e)}")

@app.post("/zelle-recipients")
async def add_zelle_recipient(recipient_data: dict):
    """Add or update a Zelle recipient mapping"""
    try:
        recipient_name = recipient_data.get('recipient')
        category = recipient_data.get('category')
        
        if not recipient_name or not category:
            raise HTTPException(status_code=400, detail="Recipient name and category are required")
        
        recipients = load_zelle_recipients()
        recipients[recipient_name] = category
        save_zelle_recipients(recipients)
        
        return {"message": "Zelle recipient mapping added successfully", "recipient": recipient_name, "category": category}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding Zelle recipient: {str(e)}")

@app.delete("/zelle-recipients/{recipient_name}")
async def delete_zelle_recipient(recipient_name: str):
    """Delete a Zelle recipient mapping"""
    try:
        recipients = load_zelle_recipients()
        if recipient_name in recipients:
            del recipients[recipient_name]
            save_zelle_recipients(recipients)
            return {"message": "Zelle recipient mapping deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Zelle recipient not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting Zelle recipient: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

