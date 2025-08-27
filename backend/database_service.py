"""
Database service functions for Financial Pro
Replaces JSON file operations with Supabase database operations
"""
from supabase_client import supabase, supabase_admin, get_user_client
from typing import List, Dict, Optional, Any
import uuid
import os
from datetime import datetime

def get_client(user_token: Optional[str] = None):
    """
    Return a Supabase client.
    - If a user_token is provided, return a client authenticated as that user (RLS enforced).
    - If no token, return the anonymous client.
    - Admin client should be used only by explicit, restricted server tasks (not via this helper).
    - Otherwise return the anonymous client.
    """
    if user_token:
        return get_user_client(user_token)
    return supabase

class DatabaseService:
    """Service class for all database operations"""
    
    # =============================================
    # CATEGORIES OPERATIONS
    # =============================================
    
    @staticmethod
    def get_categories(user_id: str, user_token: Optional[str] = None) -> List[Dict]:
        """Get all categories for a user"""
        try:
            client = get_client(user_token)
            result = client.table('categories').select('*').eq('user_id', user_id).execute()
            return result.data
        except Exception as e:
            print(f"Error getting categories: {e}")
            return []
    
    @staticmethod
    def create_category(user_id: str, name: str, keywords: List[str] = None, group_name: str = "Other", user_token: Optional[str] = None) -> Dict:
        """Create a new category"""
        try:
            client = get_client(user_token)
            category_data = {
                'user_id': user_id,
                'name': name,
                'keywords': keywords or [],
                'group_name': group_name,
                'is_default': False
            }
            result = client.table('categories').insert(category_data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error creating category: {e}")
            return None
    
    @staticmethod
    def update_category(user_id: str, category_id: str, updates: Dict, user_token: Optional[str] = None) -> Dict:
        """Update a category"""
        try:
            client = get_client(user_token)
            result = client.table('categories').update(updates).eq('id', category_id).eq('user_id', user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error updating category: {e}")
            return None
    
    @staticmethod
    def delete_category(user_id: str, category_id: str, user_token: Optional[str] = None) -> bool:
        """Delete a category"""
        try:
            client = get_client(user_token)
            client.table('categories').delete().eq('id', category_id).eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting category: {e}")
            return False
    
    @staticmethod
    def create_default_categories(user_id: str, user_token: Optional[str] = None) -> List[Dict]:
        """Create default categories for a new user with complete structure"""
        default_categories = [
            # EXPENSES - Housing
            {'name': 'Housing - Mortgage', 'keywords': ['mortgage', 'home loan', 'principal', 'interest'], 'group_name': 'Housing'},
            {'name': 'Housing - HOA Fee', 'keywords': ['hoa', 'homeowners association', 'association fee', 'community fee'], 'group_name': 'Housing'},
            {'name': 'Housing - Property Taxes', 'keywords': ['property tax', 'real estate tax', 'county tax', 'tax collector'], 'group_name': 'Housing'},
            {'name': 'Housing - Home Insurance', 'keywords': ['home insurance', 'homeowners insurance', 'property insurance'], 'group_name': 'Housing'},
            {'name': 'Housing - Home Repairs', 'keywords': ['home repair', 'maintenance', 'contractor', 'plumber', 'electrician', 'hvac'], 'group_name': 'Housing'},
            
            # EXPENSES - Utilities
            {'name': 'Utilities - City Gas', 'keywords': ['city gas', 'gas company', 'natural gas', 'gas utility'], 'group_name': 'Utilities'},
            {'name': 'Utilities - FPL', 'keywords': ['fpl', 'florida power', 'electric', 'electricity', 'power company'], 'group_name': 'Utilities'},
            {'name': 'Utilities - Water and Sewer', 'keywords': ['water', 'sewer', 'water utility', 'water department'], 'group_name': 'Utilities'},
            {'name': 'Utilities - Internet', 'keywords': ['internet', 'wifi', 'broadband', 'comcast', 'xfinity', 'spectrum'], 'group_name': 'Utilities'},
            {'name': 'Utilities - Phone', 'keywords': ['phone', 'mobile', 'cell', 'verizon', 'att', 't-mobile', 'sprint'], 'group_name': 'Utilities'},
            
            # EXPENSES - Transportation
            {'name': 'Transportation - Car Insurance', 'keywords': ['car insurance', 'auto insurance', 'geico', 'progressive', 'state farm'], 'group_name': 'Transportation'},
            {'name': 'Transportation - Car Repairs', 'keywords': ['car repair', 'auto repair', 'mechanic', 'service', 'maintenance'], 'group_name': 'Transportation'},
            {'name': 'Transportation - Fuel', 'keywords': ['gas', 'fuel', 'shell', 'bp', 'exxon', 'chevron', 'gasoline', 'gas station'], 'group_name': 'Transportation'},
            {'name': 'Transportation - Tolls', 'keywords': ['toll', 'turnpike', 'sunpass', 'ezpass', 'toll road'], 'group_name': 'Transportation'},
            
            # EXPENSES - Shopping & Food
            {'name': 'Shopping & Food - Groceries', 'keywords': ['grocery', 'supermarket', 'walmart', 'target', 'publix', 'kroger', 'food'], 'group_name': 'Shopping & Food'},
            {'name': 'Shopping & Food - Dining Out', 'keywords': ['restaurant', 'dining', 'food delivery', 'takeout', 'uber eats', 'doordash', 'grubhub'], 'group_name': 'Shopping & Food'},
            {'name': 'Shopping & Food - Amazon', 'keywords': ['amazon', 'amzn', 'amazon.com', 'amazon prime'], 'group_name': 'Shopping & Food'},
            
            # EXPENSES - Child Expenses
            {'name': 'Child Expenses - Childcare', 'keywords': ['childcare', 'daycare', 'babysitter', 'nanny', 'child care'], 'group_name': 'Child Expenses'},
            {'name': 'Child Expenses - College Fund', 'keywords': ['college fund', '529', 'education savings', 'college savings'], 'group_name': 'Child Expenses'},
            
            # EXPENSES - Healthcare
            {'name': 'Healthcare - Doctor Office', 'keywords': ['doctor', 'medical', 'physician', 'clinic', 'hospital', 'health'], 'group_name': 'Healthcare'},
            {'name': 'Healthcare - Pharmacy', 'keywords': ['pharmacy', 'cvs', 'walgreens', 'prescription', 'medication'], 'group_name': 'Healthcare'},
            
            # EXPENSES - Personal Expenses
            {'name': 'Personal Expenses - Allowance Jenny', 'keywords': ['allowance jenny', 'jenny allowance'], 'group_name': 'Personal Expenses'},
            {'name': 'Personal Expenses - Allowance Ivan', 'keywords': ['allowance ivan', 'ivan allowance'], 'group_name': 'Personal Expenses'},
            {'name': 'Personal Expenses - Donations', 'keywords': ['donation', 'charity', 'church', 'nonprofit', 'giving'], 'group_name': 'Personal Expenses'},
            {'name': 'Personal Expenses - Subscriptions', 'keywords': ['subscription', 'netflix', 'spotify', 'streaming', 'monthly service'], 'group_name': 'Personal Expenses'},
            
            # EXPENSES - Financial
            {'name': 'Financial - Savings Account', 'keywords': ['savings', 'savings account', 'transfer to savings'], 'group_name': 'Financial'},
            {'name': 'Financial - Investment (Robinhood)', 'keywords': ['robinhood', 'investment', 'stock', 'trading', 'brokerage'], 'group_name': 'Financial'},
            
            # EXPENSES - Debt
            {'name': 'Debt - Credit Card Jenny', 'keywords': ['jenny credit', 'jenny card', 'cc jenny'], 'group_name': 'Debt'},
            {'name': 'Debt - Credit Card Ivan', 'keywords': ['ivan credit', 'ivan card', 'cc ivan'], 'group_name': 'Debt'},
            {'name': 'Debt - Student Loan', 'keywords': ['student loan', 'education loan', 'navient', 'sallie mae'], 'group_name': 'Debt'},
            {'name': 'Debt - Car Payments', 'keywords': ['car payment', 'auto loan', 'vehicle payment', 'car loan'], 'group_name': 'Debt'},
            
            # EXPENSES - Other
            {'name': 'Other Expenses - Additional Expenses', 'keywords': ['additional', 'extra', 'supplemental', 'bonus', 'supplementary'], 'group_name': 'Other Expenses'},

            # EXPENSES - Business Expenses
            {'name': 'Business Expenses - Software', 'keywords': ['software', 'saas', 'subscription software', 'adobe', 'microsoft', 'quickbooks', 'xero'], 'group_name': 'Business Expenses'},
            {'name': 'Business Expenses - Employees', 'keywords': ['employee', 'payroll', 'salary', 'wage', 'staff', 'contractor'], 'group_name': 'Business Expenses'},

            # INCOME - Business
            {'name': 'Business - WBI', 'keywords': ['wbi', 'business income', 'work income'], 'group_name': 'Business'},
            
            # INCOME - Personal Income
            {'name': 'Personal Income - Payroll Ivan', 'keywords': ['payroll ivan', 'ivan salary', 'ivan paycheck'], 'group_name': 'Personal Income'},
            {'name': 'Personal Income - Payroll Jenny', 'keywords': ['payroll jenny', 'jenny salary', 'jenny paycheck'], 'group_name': 'Personal Income'},
            {'name': 'Personal Income - Other Income', 'keywords': ['income', 'deposit', 'payment received', 'refund'], 'group_name': 'Personal Income'},
        ]
        
        created_categories = []
        client = get_client(user_token)
        for cat_data in default_categories:
            cat_data['user_id'] = user_id
            cat_data['is_default'] = True
            try:
                result = client.table('categories').insert(cat_data).execute()
                if result.data:
                    created_categories.extend(result.data)
            except Exception as e:
                print(f"Error creating default category {cat_data['name']}: {e}")
        
        return created_categories
    
    @staticmethod
    def migrate_user_categories_to_new_structure(user_id: str, user_token: Optional[str] = None) -> Dict:
        """Migrate existing user's categories to the new structure"""
        try:
            client = get_client(user_token)
            
            # Delete all existing categories for this user
            client.table('categories').delete().eq('user_id', user_id).execute()
            
            # Create new categories with the proper structure
            created_categories = DatabaseService.create_default_categories(user_id, user_token)
            
            return {
                'success': True,
                'message': f'Successfully migrated to new category structure. Created {len(created_categories)} categories.',
                'categories_created': len(created_categories)
            }
            
        except Exception as e:
            print(f"Error migrating categories: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    # =============================================
    # TRANSACTIONS OPERATIONS
    # =============================================
    
    @staticmethod
    def save_transactions(user_id: str, transactions: List[Dict], file_info: Dict = None, user_token: Optional[str] = None) -> Dict:
        """Save transactions to database"""
        try:
            # Prepare transactions for database
            db_transactions = []
            for trans in transactions:
                db_trans = {
                    'user_id': user_id,
                    'description': trans.get('description', ''),
                    'amount': float(trans.get('amount', 0)),
                    'transaction_date': trans.get('date'),
                    'posting_date': trans.get('date'),  # Use same date if posting_date not available
                    'category_name': trans.get('category', 'Uncategorized'),
                    'status': trans.get('status', 'new'),
                    'transaction_key': trans.get('transaction_key', str(uuid.uuid4())),
                    'merchant_name': trans.get('merchant_name'),
                    'is_learned': trans.get('is_learned', False),
                    'file_name': file_info.get('name') if file_info else None,
                    'file_hash': file_info.get('hash') if file_info else None
                }
                db_transactions.append(db_trans)
            
            # Insert transactions (use upsert to handle duplicates)
            client = get_client(user_token)
            result = client.table('transactions').upsert(db_transactions, on_conflict='user_id,transaction_key').execute()
            
            return {
                'success': True,
                'inserted': len(result.data) if result.data else 0,
                'transactions': result.data
            }
        except Exception as e:
            print(f"Error saving transactions: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_transactions(user_id: str, limit: int = None, user_token: Optional[str] = None) -> List[Dict]:
        """Get transactions for a user"""
        try:
            client = get_client(user_token)
            query = client.table('transactions').select('*').eq('user_id', user_id).order('transaction_date', desc=True)
            if limit:
                query = query.limit(limit)
            result = query.execute()
            return result.data
        except Exception as e:
            print(f"Error getting transactions: {e}")
            return []

    @staticmethod
    def update_transaction_category(user_id: str, transaction_key: str, category_name: str, user_token: Optional[str] = None) -> bool:
        """Persist a transaction's category directly on the transactions table as the source of truth"""
        try:
            # Try to resolve category_id by name (optional)
            category_id = None
            try:
                client = get_client(user_token)
                cat_result = client.table('categories').select('id').eq('user_id', user_id).eq('name', category_name).limit(1).execute()
                if cat_result.data:
                    category_id = cat_result.data[0]['id']
            except Exception as _:
                pass

            update_payload: Dict[str, Any] = {
                'category_name': category_name,
                'status': 'saved'
            }
            if category_id:
                update_payload['category_id'] = category_id
            else:
                # If we can't resolve the category id, clear it to avoid stale references
                update_payload['category_id'] = None

            client.table('transactions').update(update_payload) \
                .eq('user_id', user_id) \
                .eq('transaction_key', transaction_key) \
                .execute()
            return True
        except Exception as e:
            print(f"Error updating transaction category: {e}")
            return False
    
    # =============================================
    # MERCHANT MAPPINGS OPERATIONS
    # =============================================
    
    @staticmethod
    def get_merchant_mappings(user_id: str, user_token: Optional[str] = None) -> Dict[str, str]:
        """Get merchant mappings for a user"""
        try:
            client = get_client(user_token)
            result = client.table('merchant_mappings').select('merchant_name, category_name').eq('user_id', user_id).execute()
            return {mapping['merchant_name']: mapping['category_name'] for mapping in result.data}
        except Exception as e:
            print(f"Error getting merchant mappings: {e}")
            return {}
    
    @staticmethod
    def save_merchant_mapping(user_id: str, merchant_name: str, category_name: str, category_id: str = None, user_token: Optional[str] = None) -> bool:
        """Save a merchant mapping"""
        try:
            mapping_data = {
                'user_id': user_id,
                'merchant_name': merchant_name,
                'category_name': category_name,
                'category_id': category_id
            }
            client = get_client(user_token)
            client.table('merchant_mappings').upsert(mapping_data, on_conflict='user_id,merchant_name').execute()
            return True
        except Exception as e:
            print(f"Error saving merchant mapping: {e}")
            return False
    
    # =============================================
    # ZELLE RECIPIENTS OPERATIONS
    # =============================================
    
    @staticmethod
    def get_zelle_recipients(user_id: str, user_token: Optional[str] = None) -> Dict[str, str]:
        """Get Zelle recipient mappings for a user"""
        try:
            client = get_client(user_token)
            result = client.table('zelle_recipients').select('recipient_name, category_name').eq('user_id', user_id).execute()
            return {mapping['recipient_name']: mapping['category_name'] for mapping in result.data}
        except Exception as e:
            print(f"Error getting Zelle recipients: {e}")
            return {}
    
    @staticmethod
    def save_zelle_recipient(user_id: str, recipient_name: str, category_name: str, category_id: str = None, user_token: Optional[str] = None) -> bool:
        """Save a Zelle recipient mapping"""
        try:
            mapping_data = {
                'user_id': user_id,
                'recipient_name': recipient_name,
                'category_name': category_name,
                'category_id': category_id
            }
            client = get_client(user_token)
            client.table('zelle_recipients').upsert(mapping_data, on_conflict='user_id,recipient_name').execute()
            return True
        except Exception as e:
            print(f"Error saving Zelle recipient: {e}")
            return False
    
    @staticmethod
    def create_default_zelle_recipients(user_id: str, user_token: Optional[str] = None) -> bool:
        """Create default Zelle recipient mappings"""
        default_recipients = [
            {'recipient_name': 'Doris', 'category_name': 'Phone'},
            {'recipient_name': 'Yamilka Maikel', 'category_name': 'ChildCare'}
        ]
        
        for recipient in default_recipients:
            recipient['user_id'] = user_id
            try:
                client = get_client(user_token)
                client.table('zelle_recipients').insert(recipient).execute()
            except Exception as e:
                print(f"Error creating default Zelle recipient {recipient['recipient_name']}: {e}")
        
        return True
    
    # =============================================
    # TRANSACTION OVERRIDES OPERATIONS
    # =============================================
    
    @staticmethod
    def get_transaction_overrides(user_id: str, user_token: Optional[str] = None) -> Dict[str, str]:
        """Get transaction overrides for a user"""
        try:
            client = get_client(user_token)
            # Align with schema: new_category_name stores the override target
            result = client.table('transaction_overrides').select('transaction_key, new_category_name').eq('user_id', user_id).execute()
            return {override['transaction_key']: override['new_category_name'] for override in result.data}
        except Exception as e:
            print(f"Error getting transaction overrides: {e}")
            return {}
    
    @staticmethod
    def save_transaction_override(user_id: str, transaction_key: str, category_name: str, category_id: str = None, user_token: Optional[str] = None) -> bool:
        """Save a transaction override"""
        try:
            override_data = {
                'user_id': user_id,
                'transaction_key': transaction_key,
                # Align with schema column names for the new category
                'new_category_name': category_name,
                'new_category_id': category_id,
                'override_reason': 'manual'
            }
            client = get_client(user_token)
            client.table('transaction_overrides').upsert(override_data, on_conflict='user_id,transaction_key').execute()
            return True
        except Exception as e:
            print(f"Error saving transaction override: {e}")
            return False
    
    @staticmethod
    def clear_all_transaction_overrides(user_id: str, user_token: Optional[str] = None) -> bool:
        """Clear all transaction overrides for a user"""
        try:
            client = get_client(user_token)
            client.table('transaction_overrides').delete().eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error clearing transaction overrides: {e}")
            return False
    
    @staticmethod
    def clear_all_merchant_mappings(user_id: str, user_token: Optional[str] = None) -> bool:
        """Clear all merchant mappings for a user"""
        try:
            client = get_client(user_token)
            client.table('merchant_mappings').delete().eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error clearing merchant mappings: {e}")
            return False
    
    @staticmethod
    def clear_all_zelle_recipients(user_id: str, user_token: Optional[str] = None) -> bool:
        """Clear all Zelle recipient mappings for a user"""
        try:
            client = get_client(user_token)
            client.table('zelle_recipients').delete().eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error clearing Zelle recipients: {e}")
            return False
    
    @staticmethod
    def reset_all_transaction_categories(user_id: str, user_token: Optional[str] = None) -> bool:
        """Reset all transaction categories and status to default values"""
        try:
            client = get_client(user_token)
            # Update all transactions to reset categories and status
            # Keep income transactions as they are, reset others to 'Other' and 'new'
            client.table('transactions').update({
                'category_name': 'Other',
                'category_id': None,
                'status': 'new',
                'is_learned': False
            }).eq('user_id', user_id).neq('status', 'income').execute()
            
            return True
        except Exception as e:
            print(f"Error resetting transaction categories: {e}")
            return False
    
    @staticmethod
    def delete_all_transactions(user_id: str, user_token: Optional[str] = None) -> bool:
        """Delete all transactions for a user (nuclear option)"""
        try:
            client = get_client(user_token)
            client.table('transactions').delete().eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting all transactions: {e}")
            return False
    
    # =============================================
    # BUSINESS OPERATIONS
    # =============================================
    
    @staticmethod
    def create_business(owner_id: str, business_name: str, business_email: str = None, user_token: Optional[str] = None) -> Dict:
        """Create a new business account"""
        try:
            business_data = {
                'name': business_name,
                'owner_id': owner_id,
                'business_email': business_email,
                'business_type': 'tax_services',
                'max_clients': 50,
                'subscription_tier': 'basic'
            }
            client = get_client(user_token)
            result = client.table('businesses').insert(business_data).execute()
            
            if result.data:
                business = result.data[0]
                # Create business default categories
                # TODO: Implement create_business_default_categories function
                return business
            return None
        except Exception as e:
            print(f"Error creating business: {e}")
            return None
    
    @staticmethod
    def get_business_info(owner_id: str, user_token: Optional[str] = None) -> Dict:
        """Get business information for owner"""
        try:
            client = get_client(user_token)
            result = client.table('businesses').select('*').eq('owner_id', owner_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error getting business info: {e}")
            return None
    
    @staticmethod
    def get_business_clients(business_id: str, user_token: Optional[str] = None) -> List[Dict]:
        """Get all clients for a business"""
        try:
            client = get_client(user_token)
            result = client.table('business_client_summary').select('*').eq('business_id', business_id).execute()
            return result.data
        except Exception as e:
            print(f"Error getting business clients: {e}")
            return []
    
    @staticmethod
    def add_business_client(business_id: str, client_name: str, client_email: str, client_phone: str = None, user_token: Optional[str] = None) -> Dict:
        """Add a new client to a business"""
        try:
            # For now, we'll create a placeholder client entry
            # In a full implementation, this would send an invitation email
            client_data = {
                'business_id': business_id,
                'client_id': f"pending-{client_email}",  # Temporary ID until user signs up
                'client_name': client_name,
                'client_email': client_email,
                'client_phone': client_phone,
                'is_active': False  # Will be activated when user accepts invitation
            }
            client = get_client(user_token)
            result = client.table('business_clients').insert(client_data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error adding business client: {e}")
            return None

    # =============================================
    # USER PROFILE OPERATIONS
    # =============================================
    
    @staticmethod
    def get_or_create_user_profile(user_id: str, email: str = None, user_role: str = 'individual', user_token: Optional[str] = None) -> Dict:
        """Get user profile or create if doesn't exist"""
        try:
            # Try to get existing profile
            client = get_client(user_token)
            result = client.table('profiles').select('*').eq('id', user_id).execute()
            
            if result.data:
                return result.data[0]
            
            # Create new profile
            profile_data = {
                'id': user_id,
                'email': email,
                'user_role': user_role,
                'is_active': True,
                'created_at': datetime.now().isoformat()
            }
            result = client.table('profiles').insert(profile_data).execute()
            
            if result.data:
                # Create default categories and Zelle recipients for individual users
                if user_role == 'individual':
                    DatabaseService.create_default_categories(user_id, user_token)
                    DatabaseService.create_default_zelle_recipients(user_id, user_token)
                return result.data[0]
            
            return None
        except Exception as e:
            print(f"Error getting/creating user profile: {e}")
            return None
    
    @staticmethod
    def update_user_profile(user_id: str, updates: Dict, user_token: Optional[str] = None) -> Dict:
        """Update user profile"""
        try:
            client = get_client(user_token)
            result = client.table('profiles').update(updates).eq('id', user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error updating user profile: {e}")
            return None
