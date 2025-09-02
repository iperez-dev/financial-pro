'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api, { getCategories, resetTransactionCategories, updateTransactionCategory as apiUpdateTxCategory, learnFromTransaction as apiLearn, saveZelleRecipient as apiSaveZelle, migrateCategories, getTransactionOverrides, getMerchantMappings } from '../../lib/api';
import { formatCurrency, formatFilename } from '../../lib/formatters';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import useScrollTop from '../../lib/useScrollTop';
import ScrollToTopButton from './ScrollToTopButton';

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', 
  '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C',
  '#A28BD4', '#F48FB1', '#81C784', '#FFB74D',
  '#64B5F6'
];

// formatFilename is imported from ../../lib/formatters

// Build title using transactions' month instead of filename date
const deriveMonthLabelFromTransactions = (txs) => {
  const dates = (txs || [])
    .map(t => new Date(t.date || t.transaction_date || t.posting_date))
    .filter(d => !isNaN(d));
  if (dates.length === 0) return null;
  let minDate = dates[0];
  for (const d of dates) {
    if (d < minDate) minDate = d;
  }
  const y = minDate.getFullYear();
  const m = String(minDate.getMonth() + 1).padStart(2, '0');
  return `${y}.${m}`;
};

const buildReportTitle = (filename, txs) => {
  const monthLabel = deriveMonthLabelFromTransactions(txs);
  if (!filename && monthLabel) return `Transactions (${monthLabel})`;
  if (!filename) return 'Transactions';

  const nameWithoutExt = filename.replace(/\.(csv|xlsx|xls)$/i, '');
  const activityMatch = nameWithoutExt.match(/^([A-Za-z]+)(\d+)_Activity_(\d{8})$/);
  if (activityMatch) {
    const [, bankName, accountNumber] = activityMatch;
    return `${bankName} ${accountNumber} - Activity (${monthLabel || 'Unknown'})`;
  }

  const formatted = formatFilename(filename);
  if (monthLabel) {
    if (/\(.*\)/.test(formatted)) {
      return formatted.replace(/\(.*\)/, `(${monthLabel})`);
    }
    return `${formatted} (${monthLabel})`;
  }
  return formatted;
};

export default function Report({ data, onDownloadPDF }) {
  const reportRef = useRef();
  const { getAuthToken } = useAuth();

  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [updatingTransaction, setUpdatingTransaction] = useState(null);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKeywords, setNewCategoryKeywords] = useState('');
  const [updateStatus, setUpdateStatus] = useState({}); // { [transactionKey]: 'success' | 'error' | null }
  const { showScrollTop, scrollToTop } = useScrollTop(300);
  const [openDropdown, setOpenDropdown] = useState(null); // Track which dropdown is open
  const [deleteModal, setDeleteModal] = useState(null); // { categoryId, categoryName } or null
  const [newCategoryModal, setNewCategoryModal] = useState({ open: false, txKey: null });
  const [newCategoryGroup, setNewCategoryGroup] = useState('Housing');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Debug logger (no-op in production)
  const isProd = process.env.NODE_ENV === 'production';
  const debug = {
    log: (...args) => { if (!isProd) console.log(...args); },
    warn: (...args) => { if (!isProd) console.warn(...args); }
  };

  // Memoize heavy derived data
  const organizedCategories = useMemo(() => organizeCategories(categories), [categories]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil((transactions?.length || 0) / pageSize)), [transactions?.length, pageSize]);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return transactions.slice(start, end);
  }, [transactions, currentPage, pageSize]);

  useEffect(() => {
    // Ensure current page is valid when data size or page size changes
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages]);

  // Helper function to show update status icons
  const showUpdateStatus = (transactionKey, status) => {
    setUpdateStatus(prev => ({ ...prev, [transactionKey]: status }));
  };

  // Show delete confirmation modal
  const showDeleteModal = (categoryId, categoryName) => {
    setDeleteModal({ categoryId, categoryName });
  };

  // Confirm and delete category
  const confirmDeleteCategory = async () => {
    if (!deleteModal) return;

    try {
      await api.deleteCategory(deleteModal.categoryId);
      if (true) {
        // Reload categories to reflect the deletion
        await loadCategories();
        console.log(`Category "${deleteModal.categoryName}" deleted successfully`);
      } else {
        console.error('Failed to delete category');
      }
    } catch (err) {
      console.error('Error deleting category:', err);
    } finally {
      setDeleteModal(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteModal(null);
  };

  // Organize categories by parent groups for hierarchical display with custom order
  function organizeCategories(categories) {
    const groups = {};
    
    // Define the exact order for groups and subcategories
    const groupOrder = [
      // EXPENSES
      'Housing', 'Utilities', 'Transportation', 'Shopping & Food', 'Child Expenses',
      'Healthcare', 'Personal Expenses', 'Financial', 'Debt', 'Other Expenses', 'Business Expenses',
      // INCOME
      'Business', 'Personal Income'
    ];

    const subcategoryOrder = {
      'Housing': ['Mortgage', 'HOA Fee', 'Property Taxes', 'Home Insurance', 'Home Repairs'],
      'Utilities': ['City Gas', 'FPL', 'Water and Sewer', 'Internet', 'Phone'],
      'Transportation': ['Car Insurance', 'Car Repairs', 'Fuel', 'Tolls'],
      'Shopping & Food': ['Groceries', 'Dining Out', 'Amazon'],
      'Child Expenses': ['Childcare', 'College Fund'],
      'Healthcare': ['Doctor Office', 'Pharmacy'],
      'Personal Expenses': ['Allowance Jenny', 'Allowance Ivan', 'Donations', 'Subscriptions'],
      'Personal Income': ['Payroll Ivan', 'Payroll Jenny', 'Other Income'],
      'Financial': ['Savings Account', 'Investment (Robinhood)'],
      'Debt': ['Credit Card Jenny', 'Credit Card Ivan', 'Student Loan', 'Car Payments'],
      'Other Expenses': ['Additional Expenses'],
      'Business Expenses': ['Software', 'Employees'],
      'Business': ['WBI']
    };

    categories.forEach(category => {
      // Extract parent and subcategory from the name
      const nameParts = category.name.split(' - ');
      if (nameParts.length === 2) {
        let [parent, subcategory] = nameParts;
        
        if (!groups[parent]) {
          groups[parent] = [];
        }
        groups[parent].push({
          ...category,
          subcategory: subcategory
        });
      } else {
        // Handle categories without parent (like "Other Expenses")
        const parent = category.name;
        console.log(`  📂 Standalone category: "${parent}"`);
        if (!groups[parent]) {
          groups[parent] = [];
        }
        groups[parent].push({
          ...category,
          subcategory: null
        });
      }
    });
    
    console.log('📋 Final groups:', Object.keys(groups));
    console.log('📋 Groups detail:', groups);

    // Sort groups according to custom order and subcategories according to their custom order
    const sortedGroups = {};
    
    groupOrder.forEach(groupName => {
      if (groups[groupName]) {
        if (subcategoryOrder[groupName]) {
          // Sort subcategories according to custom order
          const orderedSubcategories = [];
          subcategoryOrder[groupName].forEach(subName => {
            const found = groups[groupName].find(cat => 
              (cat.subcategory || cat.name) === subName
            );
            if (found) {
              orderedSubcategories.push(found);
            }
          });
          // Append any categories not in the predefined order so new categories still appear
          const existing = new Set(orderedSubcategories.map(c => (c.subcategory || c.name)));
          const leftovers = groups[groupName].filter(cat => !existing.has(cat.subcategory || cat.name));
          // Keep leftovers alphabetically by display name
          leftovers.sort((a,b) => ((a.subcategory||a.name)||'').localeCompare((b.subcategory||b.name)||''));
          sortedGroups[groupName] = [...orderedSubcategories, ...leftovers];
        } else {
          sortedGroups[groupName] = groups[groupName];
        }
      }
    });

    return sortedGroups;
  }

  if (!data || !data.summary) {
    return null;
  }

  const { summary, monthly_data } = data;

  // Initialize transactions state when data changes
  useEffect(() => {
    const loadTransactionsWithOverrides = async () => {
      if (data.transactions) {
        debug.log('Received transactions sample:', data.transactions.slice(0, 2));

        // Add fallback transaction keys and status if missing
        const transactionsWithKeys = data.transactions.map((transaction, index) => {
          let updatedTransaction = { ...transaction };

          // Add fallback transaction key if missing
          if (!transaction.transaction_key) {
            const cleanDesc = transaction.description.slice(0, 20).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
            const fallbackKey = `${cleanDesc || 'transaction'}_${Math.abs(transaction.amount).toString().replace('.', '')}_${index}`;
            debug.warn(`Missing transaction_key for transaction ${index}, using fallback: ${fallbackKey}`);
            updatedTransaction.transaction_key = fallbackKey;
          }

          // Add fallback status if missing
          if (!transaction.status) {
            debug.warn(`Missing status for transaction ${index}, using fallback: 'new'`);
            updatedTransaction.status = 'new';
          }

          return updatedTransaction;
        });

        // Load overrides and merchant mappings in parallel
        console.log('🔄 Loading overrides and merchant mappings in parallel...');
        const [overrides, merchantMappings] = await Promise.all([
          loadTransactionOverrides(),
          loadMerchantMappings()
        ]);

        // Apply overrides then auto-categorization
        let transactionsWithOverrides = applyOverridesToTransactions(transactionsWithKeys, overrides);
        transactionsWithOverrides = applyAutoCategorization(transactionsWithOverrides, merchantMappings);

        debug.log('✅ Setting transactions with overrides applied');
        setTransactions(transactionsWithOverrides);

        // Initialize status for transactions that already have saved categories
        const initialStatus = {};
        transactionsWithOverrides.forEach(transaction => {
          if (transaction.status === 'saved') {
            initialStatus[transaction.transaction_key] = 'success';
          }
        });
        setUpdateStatus(initialStatus);
      }
    };

    loadTransactionsWithOverrides();
  }, [data]);

  // Load categories for the dropdown
  useEffect(() => {
    loadCategories();
  }, []);

  // Migrate categories to new structure
  const migrateToNewCategories = async () => {
    try {
      console.log('🔄 Migrating categories to new structure...');
      const result = await migrateCategories();
      console.log('✅ Migration result:', result);
      
      // Reload categories after migration
      await loadCategories();
      
      alert(`Migration successful! ${result.categories_created} categories created.`);
    } catch (err) {
      console.error('❌ Migration failed:', err);
      alert('Migration failed. Please check the console for details.');
    }
  };

  // Reset all transaction categories (call this once to clear old categories)
  const resetAllCategories = async () => {
    try {
      await resetTransactionCategories();
      {
        console.log('All transaction categories have been reset');
        
        // Clear the update status state to remove green checkmarks
        setUpdateStatus({});
        
        // Update transactions to remove saved status and reset categories
        setTransactions(prev => 
          prev.map(t => ({
            ...t,
            category: t.status === 'income' ? t.category : 'Other', // Keep Income categories, reset others to Other
            status: t.status === 'income' ? 'income' : 'new' // Keep income status, reset others to new
          }))
        );
        
        // Clear localStorage to prevent data from persisting on page refresh
        // Get user ID from auth context or use a general key
        const userKeys = Object.keys(localStorage).filter(key => key.startsWith('financial-pro-reports-'));
        userKeys.forEach(key => {
          console.log(`Clearing localStorage key: ${key}`);
          localStorage.removeItem(key);
        });
        
        console.log('Transaction statuses have been reset and localStorage cleared');
        
        // Reload the page to ensure completely clean state
        setTimeout(() => {
          window.location.reload();
        }, 1000); // Small delay to let the user see the success message
      }
    } catch (err) {
      console.error('Error resetting categories:', err);
    }
  };

  // Scroll-to-top visibility is handled by useScrollTop hook

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.relative')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setDeleteModal(null);
        setOpenDropdown(null);
      }
    };

    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.category-dropdown')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [deleteModal, openDropdown]);

  const loadCategories = async () => {
    try {
      console.log('📂 Loading categories...');
      const data = await getCategories();
      const categoriesArray = data.categories || data;
      console.log('📂 Loaded categories:', categoriesArray.length, 'categories');
      debug.log('📂 Category names:', categoriesArray.map(c => c.name));

      setCategories(categoriesArray);
      console.log('✅ Categories loaded successfully');
    } catch (err) {
      console.error('❌ Failed to load categories:', err);
    }
  };

  const loadTransactionOverrides = async () => {
    try {
      console.log('🔄 Loading transaction overrides...');
      const response = await getTransactionOverrides();
      const overrides = response.overrides || {};
      console.log('🔄 Loaded overrides:', Object.keys(overrides).length, 'overrides');

      return overrides;
    } catch (err) {
      console.error('❌ Failed to load transaction overrides:', err);
      return {};
    }
  };

  const loadMerchantMappings = async () => {
    try {
      console.log('🔄 Loading merchant mappings...');
      const response = await getMerchantMappings();
      const mappings = response.mappings || {};
      console.log('🔄 Loaded merchant mappings:', Object.keys(mappings).length);
      return mappings;
    } catch (err) {
      console.error('❌ Failed to load merchant mappings:', err);
      return {};
    }
  };

  const applyAutoCategorization = (transactions, mappings) => {
    if (!transactions || transactions.length === 0) return transactions;
    if (!mappings || Object.keys(mappings).length === 0) return transactions;

    debug.log('🧠 Applying auto-categorization based on merchant mappings...');
    return transactions.map(t => {
      // Respect saved/manual overrides and income
      if (t.status === 'saved' || t.status === 'income') return t;

      // Only adjust uncategorized or obviously placeholder categories
      const isUncategorized = !t.category || t.category === 'Uncategorized' || t.status === 'new';
      if (!isUncategorized) return t;

      const merchant = extractMerchantName(t.description);
      let mappedCategory = mappings[merchant];

      // Fallback: match by first token if exact merchant not found
      if (!mappedCategory && merchant) {
        const firstToken = merchant.split(' ')[0];
        if (firstToken) {
          const matchKey = Object.keys(mappings).find(k => (k?.split(' ')[0] || '') === firstToken);
          if (matchKey) mappedCategory = mappings[matchKey];
        }
      }

      if (mappedCategory) {
        return { ...t, category: mappedCategory, status: 'saved' };
      }
      return t;
    });
  };

  const applyOverridesToTransactions = (transactions, overrides) => {
    debug.log('🔄 Applying overrides to transactions...');
    return transactions.map(transaction => {
      const overrideCategory = overrides[transaction.transaction_key];
      if (overrideCategory) {
        debug.log(`✅ Applying override: ${transaction.transaction_key} -> ${overrideCategory}`);
        return {
          ...transaction,
          category: overrideCategory,
          status: 'saved'
        };
      }
      return transaction;
    });
  };

  // Scroll to top handled by useScrollTop hook

  const updateTransactionCategory = async (transactionKey, newCategory) => {
    try {
      console.log('🔄 Starting category update:', { transactionKey, newCategory });
      setUpdatingTransaction(transactionKey);

      // Find the current transaction to get its description
      const currentTransaction = transactions.find(t => t.transaction_key === transactionKey);
      console.log('📋 Found transaction:', currentTransaction);
      if (!currentTransaction) {
        throw new Error('Transaction not found');
      }

      console.log('📡 Making API call to update category...');
      const result = await apiUpdateTxCategory(transactionKey, newCategory);
      console.log('📡 API response:', result);

      if (result) {
        console.log('✅ API call successful, result:', result);

        // Update the transaction state immediately
        console.log('🔄 Updating transaction state...');
        setTransactions(prev => {
          const updated = prev.map(t =>
            t.transaction_key === transactionKey
              ? { ...t, category: newCategory, status: 'saved' }
              : t
          );
          console.log('📋 Updated transaction in state:', updated.find(t => t.transaction_key === transactionKey));
          return updated;
        });

        // Learn from this transaction to update similar ones
        if (result.learned_merchant) {
          console.log('🧠 Learning from transaction...');
          await learnFromTransaction(transactionKey, currentTransaction.description, newCategory);
        } else {
          console.log('ℹ️ No merchant learning needed');
        }

        console.log('✅ Category update completed successfully');
        showUpdateStatus(transactionKey, 'success');
      } else {
        console.error('❌ API returned no result');
        showUpdateStatus(transactionKey, 'error');
      }
    } catch (err) {
      console.error('❌ Error updating transaction category:', err);
      console.error('❌ Error details:', err.message, err.stack);
      showUpdateStatus(transactionKey, 'error');
    } finally {
      console.log('🔚 Cleaning up update state');
      setUpdatingTransaction(null);
    }
  };

  const learnFromTransaction = async (transactionKey, description, category) => {
    try {
      console.log(`Learning from transaction: ${description} -> ${category}`);
      
      // Check if this is a Zelle payment
      const isZelle = isZellePayment(description);
      console.log(`Is Zelle payment: ${isZelle}`);
      
      if (isZelle) {
        // Handle Zelle payment learning
        const recipient = extractZelleRecipient(description);
        if (recipient) {
          console.log(`📱 Learning Zelle recipient: ${recipient} -> ${category}`);
          
          // Save Zelle recipient mapping
          const zelleResponse = await apiSaveZelle(recipient, category);

          if (zelleResponse.ok) {
            console.log(`✅ Zelle recipient mapping saved: ${recipient} -> ${category}`);
            
            // Update all Zelle transactions to this recipient
            setTransactions(prevTransactions => 
              prevTransactions.map(transaction => {
                if (isZellePayment(transaction.description)) {
                  const transactionRecipient = extractZelleRecipient(transaction.description);
                  if (transactionRecipient === recipient) {
                    console.log(`✅ ZELLE MATCH! Updating: ${transaction.description}`);
                    return { 
                      ...transaction, 
                      category: category,
                      status: 'saved'
                    };
                  }
                }
                return transaction;
              })
            );
          }
        }
      } else {
        // Handle regular merchant learning
        const learnResponse = await apiLearn(transactionKey, description, category);
        if (!learnResponse) {
          console.error('Failed to learn from transaction');
          return;
        }

        
        // Extract merchant name for matching similar transactions
        const merchantName = extractMerchantName(description);
        const merchantFirstToken = merchantName ? merchantName.split(' ')[0] : '';


        let matchCount = 0;
        const updatedTransactionKeys = [];
        
        // Update all transactions with similar merchant names (update any 'new' ones regardless of current category)
        setTransactions(prevTransactions =>
          prevTransactions.map(transaction => {
            // Skip Zelle payments for merchant matching
            if (isZellePayment(transaction.description)) {
              return transaction;
            }

            // Only skip transactions that are already saved or income
            if (transaction.status === 'saved' || transaction.status === 'income') {
              return transaction;
            }

            const transactionMerchant = extractMerchantName(transaction.description);
            const transactionFirstToken = transactionMerchant ? transactionMerchant.split(' ')[0] : '';

            if (transactionMerchant === merchantName || (merchantFirstToken && merchantFirstToken === transactionFirstToken)) {
              matchCount++;
              updatedTransactionKeys.push(transaction.transaction_key);
              return {
                ...transaction,
                category: category,
                status: 'saved'  // Mark as saved since it's now learned
              };
            }
            return transaction;
          })
        );

        // Mark all updated transaction keys as success to show green checkmark
        if (updatedTransactionKeys.length > 0) {
          setUpdateStatus(prev => {
            const next = { ...prev };
            updatedTransactionKeys.forEach(key => { next[key] = 'success'; });
            return next;
          });
        }
      }
      
    } catch (error) {
      console.error('Error learning from transaction:', error);
    }
  };

  // Cache for merchant extraction to avoid repeated processing
  const merchantCache = new Map();

  // Helper function to extract merchant name (simplified version of backend logic)
  const extractMerchantName = (description) => {
    if (!description) return '';

    // Check cache first
    if (merchantCache.has(description)) {
      return merchantCache.get(description);
    }

    let desc = description.trim().toUpperCase();

    // Remove dates (MM/DD patterns)
    desc = desc.replace(/\b\d{1,2}\/\d{1,2}\b/g, '');
    desc = desc.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '');

    // Remove card numbers and reference numbers (6+ digits)
    desc = desc.replace(/\b\d{6,}\b/g, '');

    // Remove common state suffixes
    desc = desc.replace(/\s+(FL|CA|NY|TX|GA|NC|SC|VA|MD|PA|NJ|CT|MA|OH|MI|IL|IN|WI|MN|IA|MO|AR|LA|MS|AL|TN|KY|WV|DE|DC|WA)\s*$/g, '');

    // Remove store numbers and location codes (improved patterns)
    desc = desc.replace(/\s*#\d+\s*/g, ' ');  // Remove #03, #05 patterns
    desc = desc.replace(/\s+\d{3,6}\s*/g, ' ');  // Remove 03655, 05924 patterns (not just at end)

    // Remove Amazon transaction IDs and similar patterns
    desc = desc.replace(/\*[A-Z0-9]{6,}/g, '');  // Remove *LH1XA4I, *0Q6L99D, *AB9Q32ZG3
    desc = desc.replace(/MKTPL\*[A-Z0-9]+/g, 'MKTPL');  // Simplify AMAZON MKTPL*XXX to AMAZON MKTPL

    // Remove common suffixes that aren't merchant names
    desc = desc.replace(/\s+AMZN\.COM\/BILL.*$/g, '');  // Remove Amzn.com/bill WA
    desc = desc.replace(/\s+MIAMI.*$/g, '');  // Remove MIAMI and everything after

    // Clean up extra spaces
    desc = desc.replace(/\s+/g, ' ').trim();

    // Special handling for known merchant patterns
    let merchant;
    if (desc.includes('CVS') && desc.includes('PHARMACY')) {
      merchant = 'CVS/PHARMACY';
    } else if (desc.includes('AMAZON')) {
      // Normalize all Amazon transactions to just "AMAZON" for consistency
      merchant = 'AMAZON';
    } else {
      // Get the main merchant name (first 2 words for consistency)
      const words = desc.split(/\s+/).filter(word => word.length > 0);
      if (words.length >= 2) {
        merchant = words.slice(0, 2).join(' ');
      } else if (words.length === 1) {
        merchant = words[0];
      } else {
        merchant = desc;
      }
    }

    const finalMerchant = merchant.trim();

    // Cache the result
    merchantCache.set(description, finalMerchant);

    return finalMerchant;
  };

  // Helper functions for Zelle payments
  const isZellePayment = (description) => {
    const d = (description || '').toLowerCase();
    return d.includes('zelle payment to') || d.includes('zelle payment from');
  };

  const extractZelleRecipient = (description) => {
    if (!isZellePayment(description)) return null;

    // Support both "to" and "from" forms
    let match = description.match(/zelle payment to\s+([^0-9]+)/i);
    if (!match) {
      match = description.match(/zelle payment from\s+([^0-9]+)/i);
    }
    if (match) {
      const raw = match[1].trim();
      const titleCase = raw.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      console.log(`📱 Extracted Zelle party: "${titleCase}"`);
      return titleCase;
    }
    return null;
  };

  // Compute custom Income Summary rows
  const computeIncomeSummaryRows = () => {
    try {
      const incomeTxs = (transactions || []).filter(t => t.status === 'income');
      if (incomeTxs.length === 0) return [];

      // Bermello Ajamil Payroll: any income containing both BERMELLO and PAYROLL
      const bermello = incomeTxs.filter(t => {
        const d = (t.description || '').toUpperCase();
        return d.includes('BERMELLO') && d.includes('PAYROLL');
      });
      const bermelloTotal = bermello.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      const bermelloCount = bermello.length;

      // Payroll Baptist: Zelle from Jennifer Ocana Garcia (positive amounts only)
      const baptist = incomeTxs.filter(t => {
        const desc = t.description || '';
        if (!isZellePayment(desc)) return false;
        const r = extractZelleRecipient(desc);
        return r === 'Jennifer Ocana Garcia' && Number(t.amount) > 0;
      });
      const baptistTotal = baptist.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      const baptistCount = baptist.length;

      // Denominator is the sum of the rows we actually show in this table (custom rows)
      const tableDenominator = bermelloTotal + baptistTotal;

      const rows = [];
      if (bermelloCount > 0) {
        rows.push({
          name: 'Bermello Ajamil Payroll',
          total_amount: bermelloTotal,
          transaction_count: bermelloCount,
          percentage: tableDenominator > 0 ? Number(((bermelloTotal / tableDenominator) * 100).toFixed(1)) : 0
        });
      }
      if (baptistCount > 0) {
        rows.push({
          name: 'Payroll Baptist',
          total_amount: baptistTotal,
          transaction_count: baptistCount,
          percentage: tableDenominator > 0 ? Number(((baptistTotal / tableDenominator) * 100).toFixed(1)) : 0
        });
      }

      return rows;
    } catch (e) {
      console.error('Error computing income summary rows:', e);
      return [];
    }
  };

  const computeIncomeTotals = () => {
    try {
      const rows = computeIncomeSummaryRows();
      const totalAmount = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const totalCount = rows.reduce((s, r) => s + (Number(r.transaction_count) || 0), 0);
      return { totalAmount, totalCount };
    } catch (e) {
      return { totalAmount: 0, totalCount: 0 };
    }
  };

  // Compute Business Income (positive transactions excluding Bermello payroll and Zelle from Jennifer)
  const computeBusinessIncomeRows = () => {
    try {
      const rowsMap = new Map();
      (transactions || []).forEach(t => {
        const amount = Number(t?.amount) || 0;
        if (amount <= 0) return; // only positive transactions

        const desc = t?.description || '';
        const upper = desc.toUpperCase();

        // Exclusions: Bermello Ajamil Payroll and Zelle from Jennifer Ocana Garcia
        const isBermelloPayroll = upper.includes('BERMELLO') && upper.includes('PAYROLL');
        if (isBermelloPayroll) return;

        if (isZellePayment(desc)) {
          const recipient = extractZelleRecipient(desc);
          if (recipient === 'Jennifer Ocana Garcia') return; // exclude Jennifer
          
          if (!recipient) {
            const key = 'ZELLE:Unknown';
            const prev = rowsMap.get(key) || { name: 'Unknown Zelle', total_amount: 0, transaction_count: 0 };
            prev.total_amount += Math.abs(amount);
            prev.transaction_count += 1;
            rowsMap.set(key, prev);
            return;
          }
          
          // Normalize business name by taking first 2-3 significant words
          const normalizeBusinessName = (name) => {
            const words = name.trim().split(/\s+/).filter(w => w.length > 0);
            
            // Remove common business suffixes and codes
            const filtered = words.filter(word => {
              const w = word.toLowerCase();
              // Skip very short codes (likely reference codes)
              if (word.length <= 3 && /^[a-z]+$/i.test(word)) return false;
              // Skip common business suffixes
              if (['inc', 'llc', 'corp', 'ltd', 'co'].includes(w)) return false;
              return true;
            });
            
            // Take first 2-3 meaningful words for grouping
            const significantWords = filtered.slice(0, 3);
            return significantWords.join(' ');
          };
          
          const normalizedName = normalizeBusinessName(recipient);
          
          // Try to find existing similar business by checking if any existing key starts with the same words
          let matchingKey = null;
          for (const [existingKey, existingEntry] of rowsMap.entries()) {
            if (existingKey.startsWith('ZELLE:')) {
              const existingNormalized = normalizeBusinessName(existingEntry.name);
              // Check if they share the same first 2 words
              const currentWords = normalizedName.split(' ');
              const existingWords = existingNormalized.split(' ');
              
              if (currentWords.length >= 2 && existingWords.length >= 2) {
                if (currentWords[0] === existingWords[0] && currentWords[1] === existingWords[1]) {
                  matchingKey = existingKey;
                  break;
                }
              }
            }
          }
          
          if (matchingKey) {
            // Add to existing group
            const prev = rowsMap.get(matchingKey);
            prev.total_amount += Math.abs(amount);
            prev.transaction_count += 1;
            debug.log(`Zelle Business Income (grouped): "${desc}" -> "${prev.name}" (${formatCurrency(amount)})`);
          } else {
            // Create new group
            const key = `ZELLE:${normalizedName}`;
            const prev = rowsMap.get(key) || { name: normalizedName, total_amount: 0, transaction_count: 0 };
            prev.total_amount += Math.abs(amount);
            prev.transaction_count += 1;
            rowsMap.set(key, prev);
            debug.log(`Zelle Business Income (new): "${desc}" -> "${normalizedName}" (${formatCurrency(amount)})`);
          }
          
          return;
        }

        // Group by merchant name for other transactions
        const merchant = extractMerchantName(desc) || 'Other Income';
        const key = `MERCHANT:${merchant}`;
        const prev = rowsMap.get(key) || { name: merchant, total_amount: 0, transaction_count: 0 };
        prev.total_amount += Math.abs(amount);
        prev.transaction_count += 1;
        rowsMap.set(key, prev);
        
        // Debug logging to see grouping
        debug.log(`Business Income: "${desc}" -> "${merchant}" (${formatCurrency(amount)})`)
      });

      const rows = Array.from(rowsMap.values());
      // Sort by total amount descending
      rows.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      
      // Debug: show final grouped results
      debug.log('Business Income Summary:', rows.map(r => `${r.name}: ${formatCurrency(r.total_amount)} (${r.transaction_count} txns)`));
      
      return rows;
    } catch (e) {
      console.error('Error computing business income rows:', e);
      return [];
    }
  };

  // Compute Business Expenses (Software and Employees subcategories)
  const computeBusinessExpenseRows = () => {
    try {
      const rowsMap = new Map();
      (transactions || []).forEach(t => {
        if (!t || t.status === 'income') return; // exclude income transactions
        
        const amount = Math.abs(Number(t?.amount) || 0);
        if (amount <= 0) return; // skip zero amounts
        
        const category = t.category || '';
        
        // Check if this is a Business Expenses category
        const isBusinessExpense = category.startsWith('Business Expenses - ') || 
                                 category === 'Business Expenses - Software' || 
                                 category === 'Business Expenses - Employees';
        
        if (!isBusinessExpense) return;
        
        const desc = t.description || '';
        
        // Extract subcategory from full category name
        let subcategory = 'Business Expenses';
        if (category.includes(' - ')) {
          subcategory = category.split(' - ')[1] || 'Business Expenses';
        }
        
        const key = `BIZEXP:${subcategory}`;
        const prev = rowsMap.get(key) || { 
          name: subcategory, 
          categoryGroup: 'Business Expenses',
          total_amount: 0, 
          transaction_count: 0 
        };
        prev.total_amount += amount;
        prev.transaction_count += 1;
        rowsMap.set(key, prev);
        
        debug.log(`Business Expense: "${desc}" (${category}) -> "${subcategory}" (${formatCurrency(amount)})`);
      });

      const rows = Array.from(rowsMap.values());
      // Sort by total amount descending
      rows.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      
      debug.log('Business Expense Summary:', rows.map(r => `${r.name}: ${formatCurrency(r.total_amount)} (${r.transaction_count} txns)`));
      
      return rows;
    } catch (e) {
      console.error('Error computing business expense rows:', e);
      return [];
    }
  };

  // Compute expense hierarchy directly from current transactions (exclude incomes)
  const computeExpenseSummary = () => {
    const groups = {};
    const parseAmount = (val) => {
      if (typeof val === 'number') return val;
      const n = Number(String(val).replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const suborder = {
      'Housing': ['Mortgage','HOA Fee','Property Taxes','Home Insurance','Home Repairs'],
      'Utilities': ['City Gas','FPL','Water and Sewer','Internet','Phone'],
      'Transportation': ['Car Insurance','Car Repairs','Fuel','Tolls'],
      'Shopping & Food': ['Groceries','Dining Out','Amazon'],
      'Child Expenses': ['Childcare','College Fund'],
      'Healthcare': ['Doctor Office','Pharmacy'],
      'Personal Expenses': ['Allowance Jenny','Allowance Ivan','Donations','Subscriptions'],
      'Financial': ['Savings Account','Investment (Robinhood)'],
      'Debt': ['Credit Card Jenny','Credit Card Ivan','Student Loan','Car Payments'],
      'Other Expenses': ['Additional Expenses']
    };
    const addTo = (grp, sub, amt) => {
      if (!groups[grp]) {
        groups[grp] = { total_amount: 0, transaction_count: 0, categories: {} };
      }
      groups[grp].total_amount += amt;
      groups[grp].transaction_count += 1;
      if (sub) {
        if (!groups[grp].categories[sub]) {
          groups[grp].categories[sub] = { total_amount: 0, transaction_count: 0 };
        }
        groups[grp].categories[sub].total_amount += amt;
        groups[grp].categories[sub].transaction_count += 1;
      }
    };

    (transactions || []).forEach(t => {
      if (!t) return;
      if (t.status === 'income') return; // exclude incomes
      const amount = parseAmount(t.amount);
      const cat = t.category || '';
      if (!cat) return;
      const parts = cat.split(' - ');
      if (parts.length === 2) {
        addTo(parts[0], parts[1], amount);
      } else {
        // Try to map standalone subcategory to a known group via current categories list first, then fallback
        const sub = cat;
        let parent = null;
        const match = (categories || []).find(c => (c?.name || '').endsWith(` - ${sub}`));
        if (match) {
          parent = (match.name || '').split(' - ')[0];
        }
        if (!parent) {
          parent = Object.keys(suborder).find(g => (suborder[g] || []).includes(sub));
        }
        if (parent) {
          addTo(parent, sub, amount);
        } else {
          // truly standalone group fallback
          addTo(cat, null, amount);
        }
      }
    });

    // Compute total absolute amount for group percent denominator
    const totalAbs = Object.values(groups).reduce((s, g) => s + Math.abs(g.total_amount || 0), 0);
    const withPercent = {};
    Object.keys(groups).forEach(grp => {
      const g = groups[grp];
      const categoriesArr = Object.keys(g.categories).map(name => ({
        category: name,
        total_amount: g.categories[name].total_amount,
        transaction_count: g.categories[name].transaction_count
      }));
      withPercent[grp] = {
        total_amount: g.total_amount,
        transaction_count: g.transaction_count,
        percentage: totalAbs > 0 ? Number(((Math.abs(g.total_amount) / totalAbs) * 100).toFixed(2)) : 0,
        categories: categoriesArr
      };
    });

    return withPercent;
  };

  const createNewCategory = async (transactionKey) => {
    if (!newCategoryName.trim()) return;

    try {
      const keywords = newCategoryKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      const fullName = `${newCategoryGroup} - ${newCategoryName.trim()}`;

      // If category already exists locally, skip API create and just assign it
      const alreadyExists = (categories || []).some(c => c.name === fullName);
      if (alreadyExists) {
        await updateTransactionCategory(transactionKey, fullName);
        setNewCategoryName('');
        setNewCategoryKeywords('');
        setNewCategoryGroup('Housing');
        setNewCategoryModal({ open: false, txKey: null });
        return;
      }

      const response = await api.createCategory(fullName, keywords, newCategoryGroup);
      // Optimistically add to categories for immediate dropdown availability
      if (response?.category) {
        setCategories(prev => {
          const exists = prev?.some(c => c.name === response.category.name);
          if (exists) return prev;
          return [...(prev || []), {
            id: String(response.category.id || `temp-${Date.now()}`),
            name: response.category.name,
            keywords: response.category.keywords || [],
            group: response.category.group || newCategoryGroup,
          }];
        });
      } else {
        setCategories(prev => {
          const exists = prev?.some(c => c.name === fullName);
          if (exists) return prev;
          return [...(prev || []), {
            id: `temp-${Date.now()}`,
            name: fullName,
            keywords,
            group: newCategoryGroup,
          }];
        });
      }
      // Update the transaction with the new category
      await updateTransactionCategory(transactionKey, fullName);
      // Refresh categories in the background (no need to block UI)
      loadCategories();

      // Reset form and close modal
      setNewCategoryName('');
      setNewCategoryKeywords('');
      setNewCategoryGroup('Housing');
      setNewCategoryModal({ open: false, txKey: null });
    } catch (err) {
      // If backend reports category exists, still proceed to assign it
      if (err?.message && String(err.message).toLowerCase().includes('category already exists')) {
        const fullName = `${newCategoryGroup} - ${newCategoryName.trim()}`;
        // Ensure it appears in dropdown immediately
        setCategories(prev => {
          const exists = prev?.some(c => c.name === fullName);
          if (exists) return prev;
          return [...(prev || []), {
            id: `temp-${Date.now()}`,
            name: fullName,
            keywords,
            group: newCategoryGroup,
          }];
        });
        await updateTransactionCategory(transactionKey, fullName);
        loadCategories();
        setNewCategoryName('');
        setNewCategoryKeywords('');
        setNewCategoryGroup('Housing');
        setNewCategoryModal({ open: false, txKey: null });
        return;
      }
      console.error('Error creating category:', err);
      showUpdateStatus(transactionKey, 'error');
    }
  };

  const handleCategoryChange = (transactionKey, value) => {
    console.log('🎯 Category change requested:', { transactionKey, value });
    console.log('🎯 Category value type:', typeof value);
    console.log('🎯 Category value length:', value.length);

    if (value === '__NEW_CATEGORY__') {
      console.log('📝 Opening new category modal');
      setNewCategoryModal({ open: true, txKey: transactionKey });
    } else {
      console.log('🔄 Updating category to:', value);
      console.log('🔄 Category value trimmed:', value.trim());
      updateTransactionCategory(transactionKey, value.trim());
    }
    setOpenDropdown(null); // Close dropdown after selection
  };

  const handleDownloadPDF = async () => {
    try {
      // Create a completely isolated container for PDF generation
      const element = reportRef.current;
      
      // Create a new iframe to isolate the content from all external CSS
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = '1200px';
      iframe.style.height = '800px';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      
      // Clone the element content
      const clonedElement = element.cloneNode(true);
      
      // Write clean HTML with only safe CSS
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              color: #000000;
              background-color: #ffffff;
              line-height: 1.4;
            }
            h1, h2, h3 {
              color: #000000;
              margin: 15px 0 10px 0;
              font-weight: bold;
            }
            h1 { font-size: 24px; }
            h2 { font-size: 20px; }
            h3 { font-size: 18px; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
            }
            th, td {
              border: 1px solid #cccccc;
              padding: 10px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .summary-grid {
              display: flex;
              gap: 20px;
              margin: 20px 0;
              flex-wrap: wrap;
            }
            .summary-card {
              border: 2px solid #3b82f6;
              border-radius: 8px;
              padding: 20px;
              min-width: 200px;
              background-color: #f8fafc;
            }
            .summary-card h3 {
              margin: 0 0 10px 0;
              color: #1e40af;
            }
            .summary-card p {
              margin: 0;
              font-size: 24px;
              font-weight: bold;
              color: #000000;
            }
            .chart-replacement {
              border: 1px solid #cccccc;
              padding: 20px;
              margin: 20px 0;
              background-color: #f9f9f9;
              text-align: center;
              font-style: italic;
              color: #666666;
            }
          </style>
        </head>
        <body>
          <div id="content"></div>
        </body>
        </html>
      `);
      iframeDoc.close();
      
      // Process the cloned content to make it PDF-friendly
      const contentDiv = iframeDoc.getElementById('content');
      
      // Build clean HTML structure using the actual data
      let htmlContent = `<h1>Financial Pro - Expense Report</h1>`;
      
      // Add summary cards using actual data
      htmlContent += '<div class="summary-grid">';
      htmlContent += `
        <div class="summary-card">
          <h3>Total Expenses</h3>
          <p>${formatCurrency(summary.total_expenses)}</p>
          <small>${summary.expense_transactions} transactions</small>
        </div>
        <div class="summary-card">
          <h3>Total Income</h3>
          <p>${formatCurrency(summary.total_income || 0)}</p>
          <small>${summary.income_transactions || 0} transactions</small>
        </div>
        <div class="summary-card">
          <h3>Net Amount</h3>
          <p>${formatCurrency((summary.total_income || 0) + summary.total_expenses)}</p>
          <small>Income - Expenses</small>
        </div>
        <div class="summary-card">
          <h3>Total Transactions</h3>
          <p>${summary.total_transactions}</p>
          <small>All transactions</small>
        </div>
      `;
      htmlContent += '</div>';
      
      // Add income summary if available
      if (summary.income_categories && summary.income_categories.length > 0) {
        htmlContent += `
          <h2>Income Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Income Type</th>
                <th>Amount</th>
                <th>Transactions</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        summary.income_categories.forEach(income => {
          htmlContent += `
            <tr>
              <td>${income.category}</td>
              <td>${formatCurrency(income.total_amount)}</td>
              <td>${income.transaction_count}</td>
              <td>${income.percentage}%</td>
            </tr>
          `;
        });
        
        htmlContent += `
            </tbody>
          </table>
        `;
      }
      
      // Add expense category summary table
      htmlContent += `
        <h2>Expense Categories by Group</h2>
      `;
      
      if (summary.grouped_categories) {
        summary.grouped_categories.forEach(group => {
          htmlContent += `
            <h3>${group.group} - ${formatCurrency(group.total_amount)} (${group.percentage}%)</h3>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Transactions</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          group.categories.forEach(category => {
            htmlContent += `
              <tr>
                <td>${category.category}</td>
                <td>${formatCurrency(category.total_amount)}</td>
                <td>${category.transaction_count}</td>
                <td>${category.percentage}%</td>
              </tr>
            `;
          });
          
          htmlContent += `
              </tbody>
            </table>
          `;
        });
      }
      
      // Add recent transactions
      htmlContent += `
        <h2>All Transactions (${transactions.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Posting Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      transactions.forEach(transaction => {
        const statusText = transaction.status === 'income' ? 'Income' : transaction.status === 'saved' ? 'Saved' : 'New';
        htmlContent += `
          <tr>
            <td>${statusText}</td>
            <td>${transaction.date || 'N/A'}</td>
            <td>${transaction.description}</td>
            <td>${transaction.category}</td>
            <td>${formatCurrency(transaction.amount)}</td>
          </tr>
        `;
      });
      
      htmlContent += `
          </tbody>
        </table>
      `;
      
      contentDiv.innerHTML = htmlContent;
      
      // Generate PDF from the clean iframe content
      const canvas = await html2canvas(iframeDoc.body, {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      // Clean up
      document.body.removeChild(iframe);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save('financial-report.pdf');
      
      if (onDownloadPDF) {
        onDownloadPDF();
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      console.error('Error details:', error.message, error.stack);
      
      // Try a simpler approach if the advanced one fails
      try {
        console.log('Attempting simplified PDF generation...');
        const element = reportRef.current;
        
        // Use a much simpler approach - just capture with minimal settings
        const canvas = await html2canvas(element, {
          scale: 1,
          useCORS: false,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          ignoreElements: (element) => {
            // Skip elements that are known to cause issues
            return element.tagName === 'SVG' || 
                   element.classList?.contains('recharts-wrapper') ||
                   element.classList?.contains('recharts-surface');
          },
          onclone: (clonedDoc) => {
            // Remove all stylesheets completely for this fallback
            const allStyles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
            allStyles.forEach(style => style.remove());
            
            // Add only the most basic styles
            const basicStyle = clonedDoc.createElement('style');
            basicStyle.textContent = `
              * { color: #000 !important; background: transparent !important; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ccc; padding: 8px; }
              th { background: #f5f5f5 !important; }
              h1, h2, h3 { color: #000 !important; margin: 10px 0; }
            `;
            clonedDoc.head.appendChild(basicStyle);
          }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save('financial-report.pdf');
        
        if (onDownloadPDF) {
          onDownloadPDF();
        }
      } catch (fallbackError) {
        console.error('Fallback PDF generation also failed:', fallbackError);
        console.error(`Error generating PDF: ${error.message || 'Unknown error'}. Please try refreshing the page and uploading your file again.`);
      }
    }
  };

  // formatCurrency and formatFilename imported from shared formatter module

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Expense Report</h2>
      </div>

      <div ref={reportRef} className="bg-white">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-red-100">Total Expenses</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.total_expenses)}</p>
                <p className="text-red-200 text-sm">{summary.expense_transactions} transactions</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-green-100">Total Income</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.total_income || 0)}</p>
                <p className="text-green-200 text-sm">{summary.income_transactions || 0} transactions</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-blue-100">Net Amount</p>
                <p className="text-2xl font-bold">{formatCurrency((summary.total_income || 0) + summary.total_expenses)}</p>
                <p className="text-blue-200 text-sm">Income - Expenses</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-purple-100">Total Transactions</p>
                <p className="text-2xl font-bold">{summary.total_transactions}</p>
                <p className="text-purple-200 text-sm">All transactions</p>
              </div>
            </div>
          </div>
        </div>



        {/* All Transactions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900">
              {buildReportTitle(data.filename, transactions)} ({transactions.length})
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Posting Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedTransactions.map((transaction, index) => (
                  <tr key={`${transaction.transaction_key || transaction.description}-${(currentPage - 1) * pageSize + index}`} className={
                    transaction.status === 'income' 
                      ? 'bg-gray-100 opacity-60' 
                      : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${transaction.status === 'income' ? 'text-gray-500' : 'text-gray-900'}`}>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        transaction.status === 'income' 
                          ? 'bg-gray-200 text-gray-600'
                          : transaction.status === 'saved' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-green-600 text-white'
                      }`}>
                        {transaction.status === 'income' ? 'Income' : transaction.status === 'saved' ? 'Saved' : 'New'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${transaction.status === 'income' ? 'text-gray-500' : 'text-gray-900'}`}>
                      {transaction.date || 'N/A'}
                    </td>
                    <td className={`px-6 py-4 text-sm max-w-md ${transaction.status === 'income' ? 'text-gray-500' : 'text-gray-900'}`}>
                      <div className="break-words">
                        {transaction.description}
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${transaction.status === 'income' ? 'text-gray-500' : 'text-gray-900'}`}>
                      {false && showNewCategoryForm === transaction.transaction_key ? (
                        <div className="space-y-2 min-w-[320px]">
                          <input
                            type="text"
                            placeholder="Category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <input
                            type="text"
                            placeholder="Keywords (comma-separated)"
                            value={newCategoryKeywords}
                            onChange={(e) => setNewCategoryKeywords(e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex space-x-1">
                            <button
                              onClick={() => createNewCategory(transaction.transaction_key)}
                              className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => {
                                setShowNewCategoryForm(null);
                                setNewCategoryName('');
                                setNewCategoryKeywords('');
                              }}
                              className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <div className="relative category-dropdown">
                            <button
                              onClick={() => {
                                console.log('Dropdown button clicked for transaction:', transaction.transaction_key);
                                const newState = openDropdown === transaction.transaction_key ? null : transaction.transaction_key;
                                console.log('Setting dropdown state to:', newState);
                                setOpenDropdown(newState);
                              }}
                              disabled={updatingTransaction === transaction.transaction_key || transaction.status === 'income'}
                              className={`text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[320px] text-left flex items-center justify-between ${
                                transaction.status === 'income'
                                  ? 'bg-gray-50 cursor-not-allowed opacity-50'
                                  : updatingTransaction === transaction.transaction_key 
                                  ? 'bg-gray-100 cursor-wait opacity-75' 
                                  : 'bg-white hover:bg-gray-100 focus:bg-white'
                              }`}
                            >
                              <span>{transaction.category ? (transaction.category.includes(' - ') ? transaction.category.split(' - ')[1] : transaction.category) : 'Select Category'}</span>
                              <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            
                            {openDropdown === transaction.transaction_key && (
                              <div className="absolute z-50 mt-1 w-full min-w-[320px] bg-white border border-gray-300 rounded shadow-lg max-h-80 overflow-y-auto">
                                <div
                                  onClick={() => {
                                    handleCategoryChange(transaction.transaction_key, '__NEW_CATEGORY__');
                                    setOpenDropdown(null);
                                  }}
                                  className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-xs text-green-600 font-medium border-b border-gray-200"
                                >
                                  + Add New Category
                                </div>
                                {(() => {
                                  const expenseGroups = ['Housing', 'Utilities', 'Transportation', 'Shopping & Food', 'Child Expenses', 'Healthcare', 'Personal Expenses', 'Financial', 'Debt', 'Other Expenses', 'Business Expenses'];
                                  const incomeGroups = ['Business', 'Personal Income'];

                                  
                                  const renderSection = (sectionName, groupNames) => (
                                    <div key={sectionName}>
                                      {/* Groups in this section */}
                                      {groupNames.map(groupName => {
                                        if (!organizedCategories[groupName]) return null;
                                        const groupCategories = organizedCategories[groupName];
                                        const displayGroupName = groupName; // Use the actual group name now
                                        
                                        return (
                                          <div key={`${sectionName}-${groupName}`}>
                                            {/* Check if this group has subcategories or is standalone */}
                                            {groupCategories.length === 1 && !groupCategories[0].subcategory ? (
                                              /* Standalone category (selectable) */
                                              <div
                                                key={groupCategories[0].id}
                                                className="flex items-center justify-between px-2 py-1 hover:bg-gray-100 cursor-pointer text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-100"
                                              >
                                                <span
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log('Clicked standalone category:', groupCategories[0].name);
                                                    handleCategoryChange(transaction.transaction_key, groupCategories[0].name);
                                                    setOpenDropdown(null);
                                                  }}
                                                  className="flex-1"
                                                >
                                                  {displayGroupName}
                                                </span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    showDeleteModal(groupCategories[0].id, groupCategories[0].name);
                                                  }}
                                                  className="ml-2 text-gray-500 hover:text-gray-700 p-1"
                                                  title={`Delete ${groupCategories[0].name}`}
                                                >
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            ) : (
                                              /* Group with subcategories */
                                              <>
                                                {/* Group Header (non-selectable) */}
                                                <div className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-100">
                                                  {displayGroupName}
                                                </div>
                                                {/* Subcategories (indented and selectable) */}
                                                {groupCategories.map((cat) => (
                                                  <div
                                                    key={cat.id}
                                                    className="flex items-center justify-between pl-6 pr-2 py-1 hover:bg-gray-100 cursor-pointer text-xs"
                                                  >
                                                    <span
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        console.log('Clicked subcategory:', cat.name);
                                                        handleCategoryChange(transaction.transaction_key, cat.name);
                                                        setOpenDropdown(null);
                                                      }}
                                                      className="flex-1"
                                                    >
                                                      {cat.subcategory || cat.name}
                                                    </span>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        showDeleteModal(cat.id, cat.name);
                                                      }}
                                                      className="ml-2 text-gray-500 hover:text-gray-700 p-1"
                                                      title={`Delete ${cat.name}`}
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                      </svg>
                                                    </button>
                                                  </div>
                                                ))}
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                  
                                  return (
                                    <>
                                      {renderSection('EXPENSES', expenseGroups)}
                                      {renderSection('INCOME', incomeGroups)}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                          {updateStatus[transaction.transaction_key] && (
                            <span className="ml-2">
                              {updateStatus[transaction.transaction_key] === 'success' ? (
                                <div className="w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${transaction.status === 'income' ? 'text-gray-500' : 'text-gray-900'}`}>
                      {formatCurrency(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-gray-600">
              Page {currentPage} of {totalPages} · Showing {paginatedTransactions.length} of {transactions.length}
            </div>
            <div className="flex items-center space-x-2">
              <button
                className="px-2 py-1 text-xs border rounded disabled:opacity-50"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                Prev
              </button>
              <button
                className="px-2 py-1 text-xs border rounded disabled:opacity-50"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
              <select
                className="text-xs border rounded px-1 py-1"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) || 50)}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>

        </div>

        {/* Income Summary */}
        {summary.income_categories && summary.income_categories.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Income Summary</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Income Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transactions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Preferred custom rows first */}
                  {computeIncomeSummaryRows().map((row, idx) => (
                    <tr key={`custom-${row.name}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {row.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                        {formatCurrency(row.total_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.transaction_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.percentage}%
                      </td>
                    </tr>
                  ))}
                  {/* Total Income row */}
                  {(() => {
                    const { totalAmount, totalCount } = computeIncomeTotals();
                    const custom = computeIncomeSummaryRows();
                    const customSum = custom.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
                    const customCount = custom.reduce((s, r) => s + (Number(r.transaction_count) || 0), 0);
                    const remainingAmount = Math.max(0, totalAmount - customSum);
                    const remainingCount = Math.max(0, totalCount - customCount);
                    const percent = totalAmount > 0 ? Number(((totalAmount / totalAmount) * 100).toFixed(1)) : 0;
                    return (
                      <tr key="total-income" className="bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          Total Income
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                          {totalCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                          {percent}%
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Expense Summary - single hierarchical table */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Expense Summary</h3>
          {/* New Category Modal */}
          {newCategoryModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Add New Category</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Category Group</label>
                    <select
                      className="w-full text-sm border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newCategoryGroup}
                      onChange={e => setNewCategoryGroup(e.target.value)}
                    >
                      {['Housing','Utilities','Transportation','Shopping & Food','Child Expenses','Healthcare','Personal Expenses','Financial','Debt','Other Expenses'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Category Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Streaming Services"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Keywords (optional, comma-separated)</label>
                    <input
                      type="text"
                      placeholder="netflix, spotify, hulu"
                      value={newCategoryKeywords}
                      onChange={(e) => setNewCategoryKeywords(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mt-5 flex justify-end space-x-2">
                  <button
                    onClick={() => setNewCategoryModal({ open: false, txKey: null })}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createNewCategory(newCategoryModal.txKey)}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700"
                  >
                    Create Category
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  if (!summary.grouped_categories) return null;

                  // Build quick lookup from live transactions to ensure accurate totals
                  const liveMapRaw = computeExpenseSummary();
                  const groupMap = new Map(Object.entries(liveMapRaw));

                  // Desired expense groups and subcategory order (match dropdown)
                  const expenseGroups = ['Housing','Utilities','Transportation','Shopping & Food','Child Expenses','Healthcare','Personal Expenses','Financial','Debt','Other Expenses'];
                  const suborder = {
                    'Housing': ['Mortgage','HOA Fee','Property Taxes','Home Insurance','Home Repairs'],
                    'Utilities': ['City Gas','FPL','Water and Sewer','Internet','Phone'],
                    'Transportation': ['Car Insurance','Car Repairs','Fuel','Tolls'],
                    'Shopping & Food': ['Groceries','Dining Out','Amazon'],
                    'Child Expenses': ['Childcare','College Fund'],
                    'Healthcare': ['Doctor Office','Pharmacy'],
                    'Personal Expenses': ['Allowance Jenny','Allowance Ivan','Donations','Subscriptions'],
                    'Financial': ['Savings Account','Investment (Robinhood)'],
                    'Debt': ['Credit Card Jenny','Credit Card Ivan','Student Loan','Car Payments'],
                    'Other Expenses': ['Additional Expenses'],
                    'Business Expenses': ['Software','Employees']
                  };

                  const rows = [];
                  let rowIndex = 0;

                  expenseGroups.forEach(groupName => {
                    const g = groupMap.get(groupName);
                    // Group header row
                    const groupPct = Number((g?.percentage || 0).toFixed(2));
                    rows.push(
                      <tr key={`grp-${groupName}`} className={(() => { rowIndex++; return 'bg-gray-50'; })()}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-900">{groupName}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">{formatCurrency(g?.total_amount || 0)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">{g?.transaction_count || 0}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">{groupPct}%</td>
                      </tr>
                    );

                    // Subcategory rows in desired order
                    const subs = suborder[groupName] || [];
                    const used = new Set();
                    subs.forEach(sub => {
                      const c = (g?.categories || []).find(cat => (cat.category || '') === sub);
                      used.add(sub);
                      rows.push(
                        <tr key={`sub-${groupName}-${sub}`} className={(rowIndex++ && true) ? 'bg-white' : 'bg-white'}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 pl-12">{sub}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(c?.total_amount || 0)}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{c?.transaction_count || 0}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900"></td>
                        </tr>
                      );
                    });
                    // Render any additional categories under this group (newly created)
                    const extraCats = (g?.categories || []).filter(cat => !used.has(cat.category || ''))
                      .sort((a,b) => (a.category||'').localeCompare(b.category||''));
                    extraCats.forEach(cat => {
                      rows.push(
                        <tr key={`sub-${groupName}-${cat.category}`} className={(rowIndex++ && true) ? 'bg-white' : 'bg-white'}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 pl-12">{cat.category}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(cat.total_amount || 0)}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{cat.transaction_count || 0}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900"></td>
                        </tr>
                      );
                    });
                  });

                  // Total Expenses row (sum of all groups shown)
                  const totals = Array.from(groupMap.values()).reduce((acc, g) => {
                    acc.amount += (g?.total_amount || 0);
                    acc.count += (g?.transaction_count || 0);
                    return acc;
                  }, { amount: 0, count: 0 });
                  rows.push(
                    <tr key="total-expenses" className="bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-900">Total Expenses</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">{formatCurrency(totals.amount)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">{totals.count}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-bold">100%</td>
                    </tr>
                  );

                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Business Income Table */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Business Income</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const rows = computeBusinessIncomeRows();
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">No business income found.</td>
                      </tr>
                    );
                  }
                  
                  const totalAmount = rows.reduce((sum, row) => sum + (row.total_amount || 0), 0);
                  const totalTransactions = rows.reduce((sum, row) => sum + (row.transaction_count || 0), 0);
                  
                  const allRows = [
                    ...rows.map((row, idx) => (
                      <tr key={`biz-income-${row.name}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{formatCurrency(row.total_amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.transaction_count}</td>
                      </tr>
                    )),
                    // Total row
                    <tr key="biz-income-total" className="bg-gray-50 border-t-2 border-gray-300">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Total Business Income</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{formatCurrency(totalAmount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{totalTransactions}</td>
                    </tr>
                  ];
                  
                  return allRows;
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Business Expense Table */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Business Expense</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category Group</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const rows = computeBusinessExpenseRows();
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">No business expenses found.</td>
                      </tr>
                    );
                  }
                  
                  const totalAmount = rows.reduce((sum, row) => sum + (row.total_amount || 0), 0);
                  const totalTransactions = rows.reduce((sum, row) => sum + (row.transaction_count || 0), 0);
                  
                  const allRows = [
                    ...rows.map((row, idx) => (
                      <tr key={`biz-expense-${row.name}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.categoryGroup}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{formatCurrency(row.total_amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.transaction_count}</td>
                      </tr>
                    )),
                    // Total row
                    <tr key="biz-expense-total" className="bg-gray-50 border-t-2 border-gray-300">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Total</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Business Expenses</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{formatCurrency(totalAmount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{totalTransactions}</td>
                    </tr>
                  ];
                  
                  return allRows;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Delete Category</h3>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                Are you sure you want to delete the category <span className="font-semibold text-gray-900">"{deleteModal.categoryName}"</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && <ScrollToTopButton onClick={scrollToTop} />}
    </div>
  );
}
