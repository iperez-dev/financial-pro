'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api, { getCategories, resetTransactionCategories, updateTransactionCategory as apiUpdateTxCategory, learnFromTransaction as apiLearn, saveZelleRecipient as apiSaveZelle } from '../../lib/api';
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
  const organizeCategories = (categories) => {
    const groups = {};
    
    // Define the exact order for groups and subcategories
    const groupOrder = [
      // EXPENSES
      'Housing', 'Utilities', 'Transportation', 'Shopping & Food', 'Child Expenses', 
      'Healthcare', 'Personal Expenses', 'Financial', 'Debt', 'Other Expenses',
      // INCOME  
      'Business', 'Jobs', 'Other Income'
    ];

    const subcategoryOrder = {
      'Housing': ['Mortgage', 'HOA Fee', 'Property Taxes', 'Home Insurance', 'Home Repairs'],
      'Utilities': ['City Gas', 'FPL', 'Water and Sewer', 'Internet', 'Phone'],
      'Transportation': ['Car Insurance', 'Car Repairs', 'Fuel', 'Tolls'],
      'Shopping & Food': ['Groceries', 'Dining Out', 'Amazon'],
      'Child Expenses': ['Childcare', 'College Fund'],
      'Healthcare': ['Doctor Office', 'Pharmacy'],
      'Personal Expenses': ['Allowance Jenny', 'Allowance Ivan', 'Donations', 'Subscriptions'],
      'Financial': ['Savings Account', 'Investment (Robinhood)'],
      'Debt': ['Credit Card Jenny', 'Credit Card Ivan', 'Student Loan', 'Car Payments'],
      'Business': ['WBI'],
      'Jobs': ['Payroll Ivan', 'Payroll Jenny']
    };

    categories.forEach(category => {
      // Extract parent and subcategory from the name
      const nameParts = category.name.split(' - ');
      if (nameParts.length === 2) {
        let [parent, subcategory] = nameParts;
        
        // Handle Personal categories - separate by type
        if (parent === 'Personal') {
          const isJobCategory = category.name.includes('Payroll');
          const isOtherIncomeCategory = category.name.includes('Other Income');
          if (isJobCategory) {
            parent = 'Jobs';
          } else if (isOtherIncomeCategory) {
            parent = 'Other Income';
          } else {
            parent = 'Personal Expenses';
          }
        }
        
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
        if (!groups[parent]) {
          groups[parent] = [];
        }
        groups[parent].push({
          ...category,
          subcategory: null
        });
      }
    });

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
          sortedGroups[groupName] = orderedSubcategories;
        } else {
          sortedGroups[groupName] = groups[groupName];
        }
      }
    });

    return sortedGroups;
  };

  if (!data || !data.summary) {
    return null;
  }

  const { summary, monthly_data } = data;

  // Initialize transactions state when data changes
  useEffect(() => {
    if (data.transactions) {
      console.log('Received transactions:', data.transactions.slice(0, 2)); // Log first 2 transactions
      
      // Add fallback transaction keys and status if missing
      const transactionsWithKeys = data.transactions.map((transaction, index) => {
        let updatedTransaction = { ...transaction };
        
        // Add fallback transaction key if missing
        if (!transaction.transaction_key) {
          const cleanDesc = transaction.description.slice(0, 20).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
          const fallbackKey = `${cleanDesc || 'transaction'}_${Math.abs(transaction.amount).toString().replace('.', '')}_${index}`;
          console.warn(`Missing transaction_key for transaction ${index}, using fallback: ${fallbackKey}`);
          updatedTransaction.transaction_key = fallbackKey;
        }
        
        // Add fallback status if missing
        if (!transaction.status) {
          console.warn(`Missing status for transaction ${index}, using fallback: 'new'`);
          updatedTransaction.status = 'new';
        }
        
        return updatedTransaction;
      });
      
      setTransactions(transactionsWithKeys);
      
      // Initialize status for transactions that already have saved categories
      const initialStatus = {};
      transactionsWithKeys.forEach(transaction => {
        if (transaction.status === 'saved') {
          initialStatus[transaction.transaction_key] = 'success';
        }
      });
      setUpdateStatus(initialStatus);
    }
  }, [data]);

  // Load categories for the dropdown
  useEffect(() => {
    loadCategories();
  }, []);

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

  // Handle scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollTop(scrollTop > 300); // Show button after scrolling 300px
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      if (event.key === 'Escape' && deleteModal) {
        setDeleteModal(null);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [deleteModal]);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data.categories || data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  // Scroll to top handled by useScrollTop hook

  const updateTransactionCategory = async (transactionKey, newCategory) => {
    try {
      console.log('Updating transaction:', { transactionKey, newCategory });
      setUpdatingTransaction(transactionKey);
      
      // Find the current transaction to get its description
      const currentTransaction = transactions.find(t => t.transaction_key === transactionKey);
      if (!currentTransaction) {
        throw new Error('Transaction not found');
      }
      
      const result = await apiUpdateTxCategory(transactionKey, newCategory);
      if (result) {
        console.log('Success:', result);
        
        // Learn from this transaction to update similar ones
        if (result.learned_merchant) {
          await learnFromTransaction(transactionKey, currentTransaction.description, newCategory);
        } else {
          // Just update the current transaction if no learning occurred
          setTransactions(prev => 
            prev.map(t => 
              t.transaction_key === transactionKey 
                ? { ...t, category: newCategory, status: 'saved' }
                : t
            )
          );
        }
        
        showUpdateStatus(transactionKey, 'success');
      } else {
        const errorData = await response.text();
        console.error('Failed to update transaction category:', response.status, errorData);
        showUpdateStatus(transactionKey, 'error');
      }
    } catch (err) {
      console.error('Error updating transaction category:', err);
      showUpdateStatus(transactionKey, 'error');
    } finally {
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
        console.log('Learning successful:', learnResponse);
        
        // Extract merchant name for matching similar transactions
        const merchantName = extractMerchantName(description);
        console.log(`Extracted merchant from "${description}": "${merchantName}"`);
        
        // Debug: Check all transactions for matches
        let matchCount = 0;
        const updatedTransactions = [];
        
        // Update all transactions with similar merchant names
        setTransactions(prevTransactions => 
          prevTransactions.map(transaction => {
            // Skip Zelle payments for merchant matching
            if (isZellePayment(transaction.description)) {
              return transaction;
            }
            
            const transactionMerchant = extractMerchantName(transaction.description);
            console.log(`Comparing "${transactionMerchant}" with "${merchantName}" for transaction: ${transaction.description}`);
            
            if (transactionMerchant === merchantName) {
              matchCount++;
              console.log(`✅ MATCH FOUND! Updating transaction: ${transaction.description}`);
              updatedTransactions.push(transaction.description);
              return { 
                ...transaction, 
                category: category,
                status: 'saved'  // Mark as saved since it's now learned
              };
            }
            return transaction;
          })
        );
        
        console.log(`Total matches found: ${matchCount}`);
        console.log(`Updated transactions:`, updatedTransactions);
      }
      
    } catch (error) {
      console.error('Error learning from transaction:', error);
    }
  };

  // Helper function to extract merchant name (simplified version of backend logic)
  const extractMerchantName = (description) => {
    if (!description) return '';
    
    console.log(`🔍 Extracting merchant from: "${description}"`);
    
    let desc = description.trim().toUpperCase();
    console.log(`Step 1 - Uppercase: "${desc}"`);
    
    // Remove dates (MM/DD patterns)
    desc = desc.replace(/\b\d{1,2}\/\d{1,2}\b/g, '');
    desc = desc.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '');
    console.log(`Step 2 - Remove dates: "${desc}"`);
    
    // Remove card numbers and reference numbers (6+ digits)
    desc = desc.replace(/\b\d{6,}\b/g, '');
    console.log(`Step 3 - Remove long numbers: "${desc}"`);
    
    // Remove common state suffixes
    desc = desc.replace(/\s+(FL|CA|NY|TX|GA|NC|SC|VA|MD|PA|NJ|CT|MA|OH|MI|IL|IN|WI|MN|IA|MO|AR|LA|MS|AL|TN|KY|WV|DE|DC|WA)\s*$/g, '');
    console.log(`Step 4 - Remove states: "${desc}"`);
    
    // Remove store numbers and location codes (improved patterns)
    desc = desc.replace(/\s*#\d+\s*/g, ' ');  // Remove #03, #05 patterns
    desc = desc.replace(/\s+\d{3,6}\s*/g, ' ');  // Remove 03655, 05924 patterns (not just at end)
    console.log(`Step 5 - Remove store numbers: "${desc}"`);
    
    // Remove Amazon transaction IDs and similar patterns
    desc = desc.replace(/\*[A-Z0-9]{6,}/g, '');  // Remove *LH1XA4I, *0Q6L99D, *AB9Q32ZG3
    desc = desc.replace(/MKTPL\*[A-Z0-9]+/g, 'MKTPL');  // Simplify AMAZON MKTPL*XXX to AMAZON MKTPL
    console.log(`Step 6 - Remove transaction IDs: "${desc}"`);
    
    // Remove common suffixes that aren't merchant names
    desc = desc.replace(/\s+AMZN\.COM\/BILL.*$/g, '');  // Remove Amzn.com/bill WA
    desc = desc.replace(/\s+MIAMI.*$/g, '');  // Remove MIAMI and everything after
    console.log(`Step 7 - Remove common suffixes: "${desc}"`);
    
    // Clean up extra spaces
    desc = desc.replace(/\s+/g, ' ').trim();
    console.log(`Step 8 - Clean spaces: "${desc}"`);
    
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
    
    console.log(`Final merchant name: "${merchant}"`);
    return merchant.trim();
  };

  // Helper functions for Zelle payments
  const isZellePayment = (description) => {
    return description.toLowerCase().includes('zelle payment to');
  };

  const extractZelleRecipient = (description) => {
    if (!isZellePayment(description)) return null;
    
    console.log(`🔍 Extracting Zelle recipient from: "${description}"`);
    
    // Extract recipient name - pattern: "Zelle payment to [Name] [phone/numbers]"
    const match = description.match(/zelle payment to\s+([^0-9]+)/i);
    if (match) {
      const recipient = match[1].trim();
      // Convert to Title Case for consistency
      const titleCaseRecipient = recipient.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      console.log(`📱 Extracted Zelle recipient: "${titleCaseRecipient}"`);
      return titleCaseRecipient;
    }
    
    return null;
  };

  const createNewCategory = async (transactionKey) => {
    if (!newCategoryName.trim()) return;

    try {
      const keywords = newCategoryKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await api.createCategory(newCategoryName.trim(), keywords);
      if (response) {
        // Reload categories
        await loadCategories();
        
        // Update the transaction with the new category
        await updateTransactionCategory(transactionKey, newCategoryName.trim());
        
        // Reset form
        setNewCategoryName('');
        setNewCategoryKeywords('');
        setShowNewCategoryForm(null);
      } else {
        const errorData = await response.json();
        showUpdateStatus(transactionKey, 'error');
      }
    } catch (err) {
      console.error('Error creating category:', err);
      showUpdateStatus(transactionKey, 'error');
    }
  };

  const handleCategoryChange = (transactionKey, value) => {
    if (value === '__NEW_CATEGORY__') {
      setShowNewCategoryForm(transactionKey);
    } else {
      updateTransactionCategory(transactionKey, value);
    }
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
        <div className="flex items-center space-x-3">
          <button
            onClick={resetAllCategories}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center space-x-2"
            title="Clear all saved category assignments but keep transactions"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Reset Categories</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download PDF</span>
          </button>
        </div>
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
              {formatFilename(data.filename)} ({transactions.length})
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
                {transactions.map((transaction, index) => (
                  <tr key={index} className={
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
                      {showNewCategoryForm === transaction.transaction_key ? (
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
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === transaction.transaction_key ? null : transaction.transaction_key)}
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
                              <div className="absolute z-10 mt-1 w-full min-w-[320px] bg-white border border-gray-300 rounded shadow-lg max-h-80 overflow-y-auto">
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
                                  const organizedCategories = organizeCategories(categories);
                                  const expenseGroups = ['Housing', 'Utilities', 'Transportation', 'Shopping & Food', 'Child Expenses', 'Healthcare', 'Personal Expenses', 'Financial', 'Debt', 'Other Expenses'];
                                  const incomeGroups = ['Business', 'Jobs', 'Other Income'];
                                  
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
                                                  onClick={() => {
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
                                                      onClick={() => {
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
                          {updatingTransaction === transaction.transaction_key && (
                            <span className="ml-2 text-xs text-gray-500">Saving...</span>
                          )}
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

        </div>

        {/* Income Summary */}
        {summary.income_categories && summary.income_categories.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Income Summary</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">
                      Income Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">
                      Transactions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {summary.income_categories.map((income, index) => (
                    <tr key={income.category} className={index % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {income.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                        {formatCurrency(income.total_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {income.transaction_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {income.percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Category Summary - moved below transactions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Expense Categories by Group</h3>
          <div className="space-y-6">
            {summary.grouped_categories && summary.grouped_categories.map((group, groupIndex) => (
              <div key={groupIndex} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-lg font-medium text-gray-800">{group.group}</h4>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {formatCurrency(group.total_amount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {group.percentage}% • {group.transaction_count} transactions
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transactions
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Percentage
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {group.categories.map((category, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                            {category.category}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(category.total_amount)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                            {category.transaction_count}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                            {category.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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
