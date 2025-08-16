from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from typing import Dict, List, Any
import re

app = FastAPI(title="Financial Pro API", version="1.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expense categorization logic
def categorize_expense(description: str) -> str:
    """
    Categorize expenses based on transaction description.
    This is a simple rule-based categorization for Phase 1.
    """
    description = description.lower().strip()
    
    # Food & Dining
    food_keywords = ['restaurant', 'cafe', 'coffee', 'food', 'dining', 'pizza', 'burger', 
                     'grocery', 'supermarket', 'market', 'starbucks', 'mcdonald', 'subway']
    
    # Transportation
    transport_keywords = ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'bus', 'train', 'parking',
                         'metro', 'transit', 'car', 'vehicle', 'auto']
    
    # Shopping
    shopping_keywords = ['amazon', 'store', 'shop', 'retail', 'mall', 'target', 'walmart',
                        'clothing', 'electronics', 'purchase']
    
    # Utilities & Bills
    utilities_keywords = ['electric', 'electricity', 'water', 'gas bill', 'internet', 'phone',
                         'cable', 'utility', 'bill', 'payment']
    
    # Entertainment
    entertainment_keywords = ['movie', 'cinema', 'theater', 'netflix', 'spotify', 'game',
                             'entertainment', 'concert', 'show']
    
    # Healthcare
    healthcare_keywords = ['doctor', 'hospital', 'pharmacy', 'medical', 'health', 'clinic',
                          'dentist', 'medicine', 'prescription']
    
    # Check categories
    if any(keyword in description for keyword in food_keywords):
        return 'Food & Dining'
    elif any(keyword in description for keyword in transport_keywords):
        return 'Transportation'
    elif any(keyword in description for keyword in shopping_keywords):
        return 'Shopping'
    elif any(keyword in description for keyword in utilities_keywords):
        return 'Utilities & Bills'
    elif any(keyword in description for keyword in entertainment_keywords):
        return 'Entertainment'
    elif any(keyword in description for keyword in healthcare_keywords):
        return 'Healthcare'
    else:
        return 'Other'

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Financial Pro API is running"}

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
        
        # Add category column
        df['category'] = df['description'].apply(categorize_expense)
        
        # Calculate summary statistics
        total_expenses = float(df['amount'].sum())
        total_transactions = len(df)
        
        # Category breakdown
        category_summary = df.groupby('category')['amount'].agg(['sum', 'count']).reset_index()
        category_summary.columns = ['category', 'total_amount', 'transaction_count']
        category_summary['percentage'] = (category_summary['total_amount'] / total_expenses * 100).round(2)
        
        # Convert to list of dictionaries for JSON response
        category_data = category_summary.to_dict('records')
        
        # Transaction details
        transactions = df[['description', 'amount', 'category']].to_dict('records')
        
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
                "total_transactions": total_transactions,
                "categories": category_data
            },
            "transactions": transactions,
            "monthly_data": monthly_data,
            "message": f"Successfully processed {total_transactions} transactions"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

