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
    Process uploaded Excel file and return categorized expense data
    """
    try:
        # Validate file type
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
        
        # Read the Excel file
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Validate required columns (flexible column names)
        required_columns = ['description', 'amount']
        df_columns_lower = [col.lower() for col in df.columns]
        
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
                    for alt in ['desc', 'transaction', 'details', 'memo', 'note']:
                        for i, col in enumerate(df_columns_lower):
                            if alt in col:
                                column_mapping[req_col] = df.columns[i]
                                found = True
                                break
                        if found:
                            break
                elif req_col == 'amount':
                    for alt in ['value', 'cost', 'price', 'total', 'sum']:
                        for i, col in enumerate(df_columns_lower):
                            if alt in col:
                                column_mapping[req_col] = df.columns[i]
                                found = True
                                break
                        if found:
                            break
            
            if not found:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Required column '{req_col}' not found. Please ensure your Excel file has columns for description and amount."
                )
        
        # Rename columns for consistency
        df = df.rename(columns=column_mapping)
        
        # Clean and process data
        df = df.dropna(subset=['description', 'amount'])
        
        # Ensure amount is numeric
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        df = df.dropna(subset=['amount'])
        
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

