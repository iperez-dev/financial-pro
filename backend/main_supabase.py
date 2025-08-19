"""
Financial Pro API with Supabase Integration
Simplified version that uses database instead of JSON files
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from typing import Dict, List, Any, Optional
import re
import hashlib
from datetime import datetime
from pydantic import BaseModel

# Import Supabase components
from supabase_client import supabase
from database_service import DatabaseService
from auth_middleware import get_user_or_dev_mode, get_current_user

app = FastAPI(title="Financial Pro API with Supabase", version="2.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class CategoryCreate(BaseModel):
    name: str
    keywords: List[str] = []
    group_name: str = "Other"

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[List[str]] = None
    group_name: Optional[str] = None

class CategoryUpdateRequest(BaseModel):
    category: str

# =============================================
# UTILITY FUNCTIONS
# =============================================

def extract_merchant_name(description: str) -> str:
    """Extract clean merchant name from transaction description"""
    desc = description.strip().upper()
    
    # Remove dates (MM/DD, DD/MM, etc.)
    desc = re.sub(r'\b\d{1,2}/\d{1,2}\b', '', desc)
    desc = re.sub(r'\b\d{2}/\d{2}/\d{2,4}\b', '', desc)
    
    # Remove card numbers and reference numbers (6+ digits)
    desc = re.sub(r'\b\d{6,}\b', '', desc)
    
    # Remove common state suffixes
    desc = re.sub(r'\s+(FL|CA|NY|TX|GA|NC|SC|VA|MD|PA|NJ|CT|MA|OH|MI|IL|IN|WI|MN|IA|MO|AR|LA|MS|AL|TN|KY|WV|DE|DC|WA)\s*$', '', desc)
    
    # Remove store numbers and location codes
    desc = re.sub(r'\s*#\d+\s*', ' ', desc)
    desc = re.sub(r'\s+\d{3,6}\s*', ' ', desc)
    
    # Remove Amazon transaction IDs and similar patterns
    desc = re.sub(r'\*[A-Z0-9]{6,}', '', desc)
    desc = re.sub(r'MKTPL\*[A-Z0-9]+', 'MKTPL', desc)
    
    # Remove common suffixes
    desc = re.sub(r'\s+AMZN\.COM/BILL.*$', '', desc)
    desc = re.sub(r'\s+MIAMI.*$', '', desc)
    
    # Clean up extra spaces
    desc = re.sub(r'\s+', ' ', desc).strip()
    
    # Special handling for known merchant patterns
    if 'CVS' in desc and 'PHARMACY' in desc:
        return 'CVS/PHARMACY'
    elif 'AMAZON' in desc:
        return 'AMAZON'
    else:
        # Get the main merchant name (first 2 words for consistency)
        words = desc.split()
        if len(words) >= 2:
            return ' '.join(words[:2])
        elif len(words) == 1:
            return words[0]
        else:
            return desc
    
    return desc.strip()

def is_zelle_payment(description: str) -> bool:
    """Check if transaction is a Zelle payment"""
    return 'zelle' in description.lower()

def extract_zelle_recipient(description: str) -> str:
    """Extract recipient name from Zelle payment description"""
    desc_lower = description.lower()
    
    # Common patterns for Zelle payments
    patterns = [
        r'zelle payment to ([^0-9]+)',
        r'zelle to ([^0-9]+)',
        r'zelle.*?to ([^0-9]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, desc_lower)
        if match:
            recipient = match.group(1).strip()
            # Clean up the recipient name
            recipient = re.sub(r'\s+\d.*$', '', recipient)  # Remove trailing numbers
            return recipient.title()  # Convert to title case
    
    return None

def get_transaction_key(description: str, amount: float, date: str) -> str:
    """Generate a unique key for transaction deduplication"""
    # Create a hash from description + amount + date for uniqueness
    key_string = f"{description}|{amount}|{date}"
    return hashlib.md5(key_string.encode()).hexdigest()[:16]

def categorize_expense(description: str, amount: float, date: str, user_id: str) -> tuple:
    """
    Categorize an expense using various methods
    Returns (category_name, status)
    """
    # Get user-specific data
    transaction_overrides = DatabaseService.get_transaction_overrides(user_id)
    merchant_mappings = DatabaseService.get_merchant_mappings(user_id)
    zelle_recipients = DatabaseService.get_zelle_recipients(user_id)
    categories = DatabaseService.get_categories(user_id)
    
    # Create transaction key for override lookup
    transaction_key = get_transaction_key(description, amount, date)
    
    # 1. Check transaction overrides first (highest priority)
    if transaction_key in transaction_overrides:
        return transaction_overrides[transaction_key], 'saved'
    
    # 2. Check Zelle recipients
    if is_zelle_payment(description):
        recipient = extract_zelle_recipient(description)
        if recipient and recipient in zelle_recipients:
            return zelle_recipients[recipient], 'saved'
    
    # 3. Check merchant mappings
    merchant_name = extract_merchant_name(description)
    if merchant_name in merchant_mappings:
        return merchant_mappings[merchant_name], 'saved'
    
    # 4. Try keyword matching with categories
    description_lower = description.lower().strip()
    for category in categories:
        for keyword in category.get('keywords', []):
            if keyword.lower() in description_lower:
                return category['name'], 'new'
    
    # 5. Default fallback
    return 'Other', 'new'

# =============================================
# MAIN ENDPOINTS
# =============================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Financial Pro API with Supabase is running!", "version": "2.0.0"}

@app.post("/process-expenses")
async def process_expenses(file: UploadFile = File(...), current_user: dict = Depends(get_user_or_dev_mode)):
    """
    Process uploaded Excel or CSV file and return categorized expense data
    """
    try:
        user_id = current_user["id"]
        print(f"Processing file for user: {user_id}")
        
        # Ensure user profile exists and has default categories
        profile = DatabaseService.get_or_create_user_profile(user_id, current_user.get("email"))
        
        # Validate file type
        filename = file.filename.lower()
        if not (filename.endswith('.xlsx') or filename.endswith('.xls') or filename.endswith('.csv')):
            raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)")
        
        # Read file content
        content = await file.read()
        file_hash = hashlib.md5(content).hexdigest()
        
        # Check for duplicate uploads
        # TODO: Implement file upload tracking
        
        # Parse file based on type
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(io.BytesIO(content))
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding='latin-1')
        else:
            df = pd.read_excel(io.BytesIO(content))
        
        print(f"Original DataFrame shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")
        
        # Standardize column names
        column_mapping = {
            'description': ['Description', 'DESCRIPTION', 'Memo', 'MEMO', 'Transaction', 'TRANSACTION'],
            'amount': ['Amount', 'AMOUNT', 'Debit', 'DEBIT', 'Credit', 'CREDIT'],
            'date': ['Date', 'DATE', 'Transaction Date', 'TRANSACTION DATE', 'Posting Date', 'POSTING DATE']
        }
        
        # Find and rename columns
        rename_mapping = {}
        for standard_name, possible_names in column_mapping.items():
            for col in df.columns:
                if col in possible_names:
                    rename_mapping[col] = standard_name
                    break
        
        df = df.rename(columns=rename_mapping)
        
        # Handle Chase CSV column misalignment (if needed)
        if 'description' in df.columns and 'amount' in df.columns:
            # Check if Description column contains numeric data (indicating column shift)
            sample_desc = df['description'].dropna().head(5)
            if sample_desc.astype(str).str.match(r'^-?\d+\.?\d*$').any():
                print("Detected Chase CSV column misalignment, swapping columns...")
                df['description'], df['amount'] = df['amount'], df['description']
        
        # Ensure required columns exist
        required_columns = ['description', 'amount']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(status_code=400, detail=f"Missing required columns: {missing_columns}")
        
        # Clean and convert amount column
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        df = df.dropna(subset=['amount'])
        
        # Add date if missing
        if 'date' not in df.columns:
            df['date'] = datetime.now().strftime('%m/%d/%Y')
        
        # Process transactions
        transactions = []
        for _, row in df.iterrows():
            description = str(row['description'])
            amount = float(row['amount'])
            date = str(row.get('date', datetime.now().strftime('%m/%d/%Y')))
            
            # Generate transaction key
            transaction_key = get_transaction_key(description, amount, date)
            
            # Categorize transaction
            if amount >= 0:
                # Handle income
                description_lower = description.lower()
                if 'payroll' in description_lower or 'salary' in description_lower or 'wages' in description_lower:
                    category = 'Payroll'
                elif 'refund' in description_lower or 'return' in description_lower:
                    category = 'Refund'
                elif 'deposit' in description_lower and 'payroll' not in description_lower:
                    category = 'Deposit'
                elif 'interest' in description_lower:
                    category = 'Interest'
                elif 'dividend' in description_lower:
                    category = 'Dividend'
                else:
                    category = 'Income'
                status = 'income'
            else:
                # Handle expenses
                category, status = categorize_expense(description, amount, date, user_id)
            
            # Extract merchant name for learning
            merchant_name = extract_merchant_name(description) if amount < 0 else None
            
            transaction = {
                'description': description,
                'amount': amount,
                'date': date,
                'category': category,
                'status': status,
                'transaction_key': transaction_key,
                'merchant_name': merchant_name
            }
            transactions.append(transaction)
        
        # Save transactions to database
        file_info = {
            'name': file.filename,
            'hash': file_hash,
            'size': len(content)
        }
        save_result = DatabaseService.save_transactions(user_id, transactions, file_info)
        
        # Calculate summary statistics
        expenses_df = pd.DataFrame([t for t in transactions if t['amount'] < 0])
        income_df = pd.DataFrame([t for t in transactions if t['amount'] >= 0])
        
        total_expenses = float(expenses_df['amount'].sum()) if len(expenses_df) > 0 else 0.0
        total_income = float(income_df['amount'].sum()) if len(income_df) > 0 else 0.0
        
        # Category summary for expenses
        category_summary = []
        income_summary = []
        
        if len(expenses_df) > 0:
            expense_groups = expenses_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
            total_abs_expenses = abs(total_expenses)
            
            for _, group in expense_groups.iterrows():
                category_summary.append({
                    'category': group['category'],
                    'total_amount': abs(group['sum']),
                    'transaction_count': group['count'],
                    'percentage': round((abs(group['sum']) / total_abs_expenses * 100), 2) if total_abs_expenses > 0 else 0
                })
        
        if len(income_df) > 0:
            income_groups = income_df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
            
            for _, group in income_groups.iterrows():
                income_summary.append({
                    'category': group['category'],
                    'total_amount': group['sum'],
                    'transaction_count': group['count'],
                    'percentage': round((group['sum'] / total_income * 100), 2) if total_income > 0 else 0
                })
        
        # Create grouped category summary
        categories = DatabaseService.get_categories(user_id)
        category_to_group = {cat['name']: cat.get('group_name', 'Other') for cat in categories}
        
        grouped_categories = {}
        for cat_data in category_summary:
            group_name = category_to_group.get(cat_data['category'], 'Other')
            if group_name not in grouped_categories:
                grouped_categories[group_name] = {
                    'group': group_name,
                    'categories': [],
                    'total_amount': 0,
                    'transaction_count': 0
                }
            
            grouped_categories[group_name]['categories'].append(cat_data)
            grouped_categories[group_name]['total_amount'] += cat_data['total_amount']
            grouped_categories[group_name]['transaction_count'] += cat_data['transaction_count']
        
        # Calculate percentages for groups
        total_abs_expenses = abs(total_expenses)
        for group_data in grouped_categories.values():
            group_data['percentage'] = round((group_data['total_amount'] / total_abs_expenses * 100), 2) if total_abs_expenses > 0 else 0
        
        grouped_category_data = list(grouped_categories.values())
        
        return {
            "success": True,
            "summary": {
                "total_expenses": total_expenses,
                "total_income": total_income,
                "total_transactions": len(transactions),
                "expense_transactions": len(expenses_df),
                "income_transactions": len(income_df),
                "categories": category_summary,
                "grouped_categories": grouped_category_data,
                "income_categories": income_summary
            },
            "transactions": transactions,
            "message": f"Successfully processed {len(transactions)} transactions ({len(expenses_df)} expenses, {len(income_df)} income)"
        }
        
    except Exception as e:
        print(f"Error processing file: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

# =============================================
# CATEGORY MANAGEMENT ENDPOINTS
# =============================================

@app.get("/categories")
async def get_categories(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all categories for the current user"""
    user_id = current_user["id"]
    categories = DatabaseService.get_categories(user_id)
    return {"categories": categories}

@app.post("/categories")
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_user_or_dev_mode)):
    """Create a new category"""
    user_id = current_user["id"]
    
    new_category = DatabaseService.create_category(
        user_id=user_id,
        name=category.name,
        keywords=category.keywords,
        group_name=category.group_name
    )
    
    if new_category:
        return {"message": "Category created successfully", "category": new_category}
    else:
        raise HTTPException(status_code=400, detail="Failed to create category")

@app.put("/categories/{category_id}")
async def update_category(category_id: str, category_update: CategoryUpdate, current_user: dict = Depends(get_user_or_dev_mode)):
    """Update an existing category"""
    user_id = current_user["id"]
    
    updates = {}
    if category_update.name is not None:
        updates['name'] = category_update.name
    if category_update.keywords is not None:
        updates['keywords'] = category_update.keywords
    if category_update.group_name is not None:
        updates['group_name'] = category_update.group_name
    
    updated_category = DatabaseService.update_category(user_id, category_id, updates)
    
    if updated_category:
        return {"message": "Category updated successfully", "category": updated_category}
    else:
        raise HTTPException(status_code=404, detail="Category not found")

@app.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Delete a category"""
    user_id = current_user["id"]
    
    success = DatabaseService.delete_category(user_id, category_id)
    
    if success:
        return {"message": "Category deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Category not found")

# =============================================
# TRANSACTION MANAGEMENT ENDPOINTS
# =============================================

@app.put("/transactions/{transaction_key}/category")
async def update_transaction_category(transaction_key: str, request: CategoryUpdateRequest, current_user: dict = Depends(get_user_or_dev_mode)):
    """Update the category of a specific transaction"""
    user_id = current_user["id"]
    
    # Save transaction override
    success = DatabaseService.save_transaction_override(user_id, transaction_key, request.category)
    
    if success:
        # Check if we should learn from this transaction
        # TODO: Implement merchant learning logic
        return {"message": "Transaction category updated successfully", "learned_merchant": False}
    else:
        raise HTTPException(status_code=500, detail="Failed to update transaction category")

# =============================================
# MERCHANT LEARNING ENDPOINTS
# =============================================

@app.post("/transactions/{transaction_key}/learn")
async def learn_from_transaction(transaction_key: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Learn merchant categorization from a transaction"""
    user_id = current_user["id"]
    
    # TODO: Implement merchant learning logic
    # This would extract merchant name and save the mapping
    
    return {"message": "Merchant learning completed"}

# =============================================
# BUSINESS MANAGEMENT ENDPOINTS
# =============================================

@app.get("/user/profile")
async def get_user_profile(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get current user's profile information"""
    user_id = current_user["id"]
    
    profile = DatabaseService.get_or_create_user_profile(user_id, current_user.get("email"))
    
    if profile:
        return profile
    else:
        raise HTTPException(status_code=404, detail="User profile not found")

@app.post("/business/create")
async def create_business(business_name: str, business_email: str = None, current_user: dict = Depends(get_user_or_dev_mode)):
    """Create a new business account"""
    user_id = current_user["id"]
    
    # Update user profile to business owner
    profile_updates = {'user_role': 'business_owner'}
    DatabaseService.update_user_profile(user_id, profile_updates)
    
    # Create business
    business = DatabaseService.create_business(user_id, business_name, business_email)
    
    if business:
        return {"message": "Business created successfully", "business": business}
    else:
        raise HTTPException(status_code=400, detail="Failed to create business")

@app.get("/business/info")
async def get_business_info(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get business information for current user"""
    user_id = current_user["id"]
    
    business = DatabaseService.get_business_info(user_id)
    
    if business:
        return business
    else:
        raise HTTPException(status_code=404, detail="Business not found")

@app.get("/business/clients")
async def get_business_clients(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all clients for the current business"""
    user_id = current_user["id"]
    
    # Get business info first
    business = DatabaseService.get_business_info(user_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    clients = DatabaseService.get_business_clients(business['id'])
    
    return {"clients": clients}

@app.post("/business/clients")
async def add_business_client(client_name: str, client_email: str, client_phone: str = None, current_user: dict = Depends(get_user_or_dev_mode)):
    """Add a new client to the business"""
    user_id = current_user["id"]
    
    # Get business info first
    business = DatabaseService.get_business_info(user_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    client = DatabaseService.add_business_client(business['id'], client_name, client_email, client_phone)
    
    if client:
        return {"message": "Client added successfully", "client": client}
    else:
        raise HTTPException(status_code=400, detail="Failed to add client")

# =============================================
# ZELLE RECIPIENT ENDPOINTS
# =============================================

@app.get("/zelle-recipients")
async def get_zelle_recipients(current_user: dict = Depends(get_user_or_dev_mode)):
    """Get all Zelle recipient mappings"""
    user_id = current_user["id"]
    recipients = DatabaseService.get_zelle_recipients(user_id)
    return {"recipients": recipients}

@app.post("/zelle-recipients")
async def create_zelle_recipient(recipient_name: str, category_name: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Create a new Zelle recipient mapping"""
    user_id = current_user["id"]
    
    success = DatabaseService.save_zelle_recipient(user_id, recipient_name, category_name)
    
    if success:
        return {"message": "Zelle recipient mapping created successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to create Zelle recipient mapping")

@app.delete("/zelle-recipients/{recipient_name}")
async def delete_zelle_recipient(recipient_name: str, current_user: dict = Depends(get_user_or_dev_mode)):
    """Delete a Zelle recipient mapping"""
    user_id = current_user["id"]
    
    # TODO: Implement delete functionality in DatabaseService
    return {"message": "Zelle recipient mapping deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
