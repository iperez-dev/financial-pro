"""
Database service functions for Financial Pro
Replaces JSON file operations with Supabase database operations
"""
from supabase_client import supabase
from typing import List, Dict, Optional, Any
import uuid
from datetime import datetime

class DatabaseService:
    """Service class for all database operations"""
    
    # =============================================
    # CATEGORIES OPERATIONS
    # =============================================
    
    @staticmethod
    def get_categories(user_id: str) -> List[Dict]:
        """Get all categories for a user"""
        try:
            result = supabase.table('categories').select('*').eq('user_id', user_id).execute()
            return result.data
        except Exception as e:
            print(f"Error getting categories: {e}")
            return []
    
    @staticmethod
    def create_category(user_id: str, name: str, keywords: List[str] = None, group_name: str = "Other") -> Dict:
        """Create a new category"""
        try:
            category_data = {
                'user_id': user_id,
                'name': name,
                'keywords': keywords or [],
                'group_name': group_name,
                'is_default': False
            }
            result = supabase.table('categories').insert(category_data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error creating category: {e}")
            return None
    
    @staticmethod
    def update_category(user_id: str, category_id: str, updates: Dict) -> Dict:
        """Update a category"""
        try:
            result = supabase.table('categories').update(updates).eq('id', category_id).eq('user_id', user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error updating category: {e}")
            return None
    
    @staticmethod
    def delete_category(user_id: str, category_id: str) -> bool:
        """Delete a category"""
        try:
            result = supabase.table('categories').delete().eq('id', category_id).eq('user_id', user_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting category: {e}")
            return False
    
    @staticmethod
    def create_default_categories(user_id: str) -> List[Dict]:
        """Create default categories for a new user"""
        default_categories = [
            # Housing
            {'name': 'Mortgage', 'keywords': ['mortgage', 'home loan', 'principal', 'interest'], 'group_name': 'Housing'},
            {'name': 'HOA', 'keywords': ['hoa', 'homeowners association', 'association'], 'group_name': 'Housing'},
            
            # Utilities
            {'name': 'City Gas', 'keywords': ['city gas', 'gas company', 'natural gas'], 'group_name': 'Utilities'},
            {'name': 'FPL', 'keywords': ['fpl', 'florida power', 'electric', 'electricity'], 'group_name': 'Utilities'},
            {'name': 'Internet', 'keywords': ['internet', 'wifi', 'broadband', 'comcast', 'xfinity'], 'group_name': 'Utilities'},
            {'name': 'Phone', 'keywords': ['phone', 'mobile', 'cell', 'verizon', 'att', 't-mobile'], 'group_name': 'Utilities'},
            
            # Transportation
            {'name': 'Toll', 'keywords': ['toll', 'turnpike', 'sunpass', 'ezpass'], 'group_name': 'Transportation'},
            {'name': 'Gas Station', 'keywords': ['gas', 'fuel', 'shell', 'bp', 'exxon', 'chevron'], 'group_name': 'Transportation'},
            {'name': 'Car Insurance', 'keywords': ['car insurance', 'auto insurance', 'geico', 'progressive'], 'group_name': 'Transportation'},
            
            # Financial
            {'name': 'Student Loan', 'keywords': ['student loan', 'education loan', 'navient', 'sallie mae'], 'group_name': 'Financial'},
            {'name': 'Credit Card Jenny', 'keywords': ['jenny credit', 'jenny card'], 'group_name': 'Financial'},
            {'name': 'Credit Card Ivan', 'keywords': ['ivan credit', 'ivan card'], 'group_name': 'Financial'},
            
            # Personal
            {'name': 'ChildCare', 'keywords': ['childcare', 'daycare', 'babysitter', 'nanny'], 'group_name': 'Personal'},
        ]
        
        created_categories = []
        for cat_data in default_categories:
            cat_data['user_id'] = user_id
            cat_data['is_default'] = True
            try:
                result = supabase.table('categories').insert(cat_data).execute()
                if result.data:
                    created_categories.extend(result.data)
            except Exception as e:
                print(f"Error creating default category {cat_data['name']}: {e}")
        
        return created_categories
    
    # =============================================
    # TRANSACTIONS OPERATIONS
    # =============================================
    
    @staticmethod
    def save_transactions(user_id: str, transactions: List[Dict], file_info: Dict = None) -> Dict:
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
            result = supabase.table('transactions').upsert(db_transactions, on_conflict='user_id,transaction_key').execute()
            
            return {
                'success': True,
                'inserted': len(result.data) if result.data else 0,
                'transactions': result.data
            }
        except Exception as e:
            print(f"Error saving transactions: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_transactions(user_id: str, limit: int = None) -> List[Dict]:
        """Get transactions for a user"""
        try:
            query = supabase.table('transactions').select('*').eq('user_id', user_id).order('transaction_date', desc=True)
            if limit:
                query = query.limit(limit)
            result = query.execute()
            return result.data
        except Exception as e:
            print(f"Error getting transactions: {e}")
            return []
    
    # =============================================
    # MERCHANT MAPPINGS OPERATIONS
    # =============================================
    
    @staticmethod
    def get_merchant_mappings(user_id: str) -> Dict[str, str]:
        """Get merchant mappings for a user"""
        try:
            result = supabase.table('merchant_mappings').select('merchant_name, category_name').eq('user_id', user_id).execute()
            return {mapping['merchant_name']: mapping['category_name'] for mapping in result.data}
        except Exception as e:
            print(f"Error getting merchant mappings: {e}")
            return {}
    
    @staticmethod
    def save_merchant_mapping(user_id: str, merchant_name: str, category_name: str, category_id: str = None) -> bool:
        """Save a merchant mapping"""
        try:
            mapping_data = {
                'user_id': user_id,
                'merchant_name': merchant_name,
                'category_name': category_name,
                'category_id': category_id
            }
            result = supabase.table('merchant_mappings').upsert(mapping_data, on_conflict='user_id,merchant_name').execute()
            return True
        except Exception as e:
            print(f"Error saving merchant mapping: {e}")
            return False
    
    # =============================================
    # ZELLE RECIPIENTS OPERATIONS
    # =============================================
    
    @staticmethod
    def get_zelle_recipients(user_id: str) -> Dict[str, str]:
        """Get Zelle recipient mappings for a user"""
        try:
            result = supabase.table('zelle_recipients').select('recipient_name, category_name').eq('user_id', user_id).execute()
            return {mapping['recipient_name']: mapping['category_name'] for mapping in result.data}
        except Exception as e:
            print(f"Error getting Zelle recipients: {e}")
            return {}
    
    @staticmethod
    def save_zelle_recipient(user_id: str, recipient_name: str, category_name: str, category_id: str = None) -> bool:
        """Save a Zelle recipient mapping"""
        try:
            mapping_data = {
                'user_id': user_id,
                'recipient_name': recipient_name,
                'category_name': category_name,
                'category_id': category_id
            }
            result = supabase.table('zelle_recipients').upsert(mapping_data, on_conflict='user_id,recipient_name').execute()
            return True
        except Exception as e:
            print(f"Error saving Zelle recipient: {e}")
            return False
    
    @staticmethod
    def create_default_zelle_recipients(user_id: str) -> bool:
        """Create default Zelle recipient mappings"""
        default_recipients = [
            {'recipient_name': 'Doris', 'category_name': 'Phone'},
            {'recipient_name': 'Yamilka Maikel', 'category_name': 'ChildCare'}
        ]
        
        for recipient in default_recipients:
            recipient['user_id'] = user_id
            try:
                supabase.table('zelle_recipients').insert(recipient).execute()
            except Exception as e:
                print(f"Error creating default Zelle recipient {recipient['recipient_name']}: {e}")
        
        return True
    
    # =============================================
    # TRANSACTION OVERRIDES OPERATIONS
    # =============================================
    
    @staticmethod
    def get_transaction_overrides(user_id: str) -> Dict[str, str]:
        """Get transaction overrides for a user"""
        try:
            result = supabase.table('transaction_overrides').select('transaction_key, category_name').eq('user_id', user_id).execute()
            return {override['transaction_key']: override['category_name'] for override in result.data}
        except Exception as e:
            print(f"Error getting transaction overrides: {e}")
            return {}
    
    @staticmethod
    def save_transaction_override(user_id: str, transaction_key: str, category_name: str, category_id: str = None) -> bool:
        """Save a transaction override"""
        try:
            override_data = {
                'user_id': user_id,
                'transaction_key': transaction_key,
                'category_name': category_name,
                'category_id': category_id,
                'override_reason': 'manual'
            }
            result = supabase.table('transaction_overrides').upsert(override_data, on_conflict='user_id,transaction_key').execute()
            return True
        except Exception as e:
            print(f"Error saving transaction override: {e}")
            return False
    
    # =============================================
    # BUSINESS OPERATIONS
    # =============================================
    
    @staticmethod
    def create_business(owner_id: str, business_name: str, business_email: str = None) -> Dict:
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
            result = supabase.table('businesses').insert(business_data).execute()
            
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
    def get_business_info(owner_id: str) -> Dict:
        """Get business information for owner"""
        try:
            result = supabase.table('businesses').select('*').eq('owner_id', owner_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error getting business info: {e}")
            return None
    
    @staticmethod
    def get_business_clients(business_id: str) -> List[Dict]:
        """Get all clients for a business"""
        try:
            result = supabase.table('business_client_summary').select('*').eq('business_id', business_id).execute()
            return result.data
        except Exception as e:
            print(f"Error getting business clients: {e}")
            return []
    
    @staticmethod
    def add_business_client(business_id: str, client_name: str, client_email: str, client_phone: str = None) -> Dict:
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
            result = supabase.table('business_clients').insert(client_data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error adding business client: {e}")
            return None

    # =============================================
    # USER PROFILE OPERATIONS
    # =============================================
    
    @staticmethod
    def get_or_create_user_profile(user_id: str, email: str = None, user_role: str = 'individual') -> Dict:
        """Get user profile or create if doesn't exist"""
        try:
            # Try to get existing profile
            result = supabase.table('profiles').select('*').eq('id', user_id).execute()
            
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
            result = supabase.table('profiles').insert(profile_data).execute()
            
            if result.data:
                # Create default categories and Zelle recipients for individual users
                if user_role == 'individual':
                    DatabaseService.create_default_categories(user_id)
                    DatabaseService.create_default_zelle_recipients(user_id)
                return result.data[0]
            
            return None
        except Exception as e:
            print(f"Error getting/creating user profile: {e}")
            return None
    
    @staticmethod
    def update_user_profile(user_id: str, updates: Dict) -> Dict:
        """Update user profile"""
        try:
            result = supabase.table('profiles').update(updates).eq('id', user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error updating user profile: {e}")
            return None
