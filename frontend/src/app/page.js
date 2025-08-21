'use client';

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import FileUpload from './components/FileUpload';
import Report from './components/Report';
import MultiReport from './components/MultiReport';
import BusinessDashboard from './components/BusinessDashboard';
import AccountTypeSelection from './components/AccountTypeSelection';
import IndividualAuthForm from './components/IndividualAuthForm';
import BusinessAuthForm from './components/BusinessAuthForm';
import Sidebar from './components/Sidebar';


function FinancialProApp() {
  const { user, userProfile, loading, logout, getAuthToken, isBusinessOwner, isIndividual } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [multiReportData, setMultiReportData] = useState(null);
  const [allReports, setAllReports] = useState([]); // Store all accumulated reports
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authFlow, setAuthFlow] = useState('account-selection'); // 'account-selection', 'individual-auth', 'business-auth'
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [currentPage, setCurrentPage] = useState('reports'); // Default to reports page
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load saved reports from localStorage on component mount
  useEffect(() => {
    if (user) {
      const savedReports = localStorage.getItem(`financial-pro-reports-${user.id}`);
      if (savedReports) {
        try {
          const parsedReports = JSON.parse(savedReports);
          setAllReports(parsedReports);
          
          // If there are saved reports, create multiReportData to display them
          if (parsedReports.length > 0) {
            const combinedData = createCombinedReportData(parsedReports);
            setMultiReportData(combinedData);
            // Clear single report data since we have multiple
            setReportData(null);
            // Upload area will be hidden automatically since reports exist
          }
        } catch (error) {
          console.error('Error loading saved reports:', error);
          localStorage.removeItem(`financial-pro-reports-${user.id}`);
        }
      }
    }
  }, [user]);

  // Save reports to localStorage whenever allReports changes
  useEffect(() => {
    if (user && allReports.length > 0) {
      localStorage.setItem(`financial-pro-reports-${user.id}`, JSON.stringify(allReports));
    }
  }, [allReports, user]);

  // Handle scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollTop(scrollTop > 300); // Show button after scrolling 300px
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Create combined report data from multiple reports
  const createCombinedReportData = (reports) => {
    const successfulReports = reports.filter(report => report.success);
    
    if (successfulReports.length === 0) {
      return null;
    }

    // Calculate combined summary
    let totalExpenses = 0;
    let totalIncome = 0;
    let totalTransactions = 0;
    let expenseTransactions = 0;
    let incomeTransactions = 0;

    successfulReports.forEach(report => {
      totalExpenses += report.summary.total_expenses;
      totalIncome += report.summary.total_income;
      totalTransactions += report.summary.total_transactions;
      expenseTransactions += report.summary.expense_transactions;
      incomeTransactions += report.summary.income_transactions;
    });

    const netAmount = totalIncome - Math.abs(totalExpenses);

    return {
      success: true,
      reports: reports,
      summary: {
        total_expenses: totalExpenses,
        total_income: totalIncome,
        net_amount: netAmount,
        total_transactions: totalTransactions,
        expense_transactions: expenseTransactions,
        income_transactions: incomeTransactions
      },
      total_files: reports.length,
      successful_files: successfulReports.length,
      message: `Successfully processed ${successfulReports.length} out of ${reports.length} files`
    };
  };

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show authentication flow if not authenticated
  if (!user) {
    switch (authFlow) {
      case 'individual-auth':
        return (
          <IndividualAuthForm 
            onBack={() => setAuthFlow('account-selection')}
          />
        );
      
      case 'business-auth':
        return (
          <BusinessAuthForm 
            onBack={() => setAuthFlow('account-selection')}
          />
        );
      
      default:
        return (
          <AccountTypeSelection 
            onAccountTypeSelect={(type) => {
              if (type === 'individual') {
                setAuthFlow('individual-auth');
              } else if (type === 'business') {
                setAuthFlow('business-auth');
              }
            }}
          />
        );
    }
  }

  // Route based on user role
  if (userProfile) {
    if (isBusinessOwner) {
      return <BusinessDashboard />;
    }
    // For individual users and business clients, show the regular app
  }

  const handleFileUpload = async (files) => {
    setIsLoading(true);
    setError(null);

    try {
      // Handle both single file (legacy) and multiple files
      const fileArray = Array.isArray(files) ? files : [files];
      
      // Check for duplicate files
      const { duplicateFiles, uniqueFiles } = checkForDuplicateFiles(fileArray);
      
      // If there are duplicate files, show error and don't proceed
      if (duplicateFiles.length > 0) {
        const duplicateMessage = duplicateFiles.length === 1 
          ? `The file "${duplicateFiles[0]}" has already been uploaded. Please try a different file.`
          : `The following files have already been uploaded: ${duplicateFiles.join(', ')}. Please try different files.`;
        
        setError(duplicateMessage);
        setIsLoading(false);
        return;
      }

      // If no unique files to upload, return
      if (uniqueFiles.length === 0) {
        setIsLoading(false);
        return;
      }

      const formData = new FormData();
      
      // Append unique files to FormData
      if (uniqueFiles.length === 1) {
        // Single file - use existing endpoint
        formData.append('file', uniqueFiles[0]);
      } else {
        // Multiple files - use new endpoint
        uniqueFiles.forEach(file => {
          formData.append('files', file);
        });
      }

      const token = getAuthToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Choose endpoint based on number of unique files
      const endpoint = uniqueFiles.length === 1 ? 'process-expenses' : 'process-multiple-expenses';
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process files');
      }

      const data = await response.json();
      
      // Add new reports to existing ones instead of replacing
      let newReports = [];
      if (uniqueFiles.length === 1) {
        // Single file response - convert to array format
        newReports = [data];
      } else {
        // Multiple files response - extract reports array
        newReports = data.reports || [];
      }

      // Combine with existing reports
      const updatedAllReports = [...allReports, ...newReports];
      setAllReports(updatedAllReports);

      // Create combined view
      const combinedData = createCombinedReportData(updatedAllReports);
      if (combinedData) {
        setMultiReportData(combinedData);
        setReportData(null); // Clear single report view
        // Upload area will be hidden automatically since reports exist
      }

    } catch (err) {
      setError(err.message);
      console.error('Error uploading files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setReportData(null);
    setMultiReportData(null);
    setAllReports([]);
    setError(null);
    // Upload area will show automatically since no reports exist
    
    // Clear from localStorage
    if (user) {
      localStorage.removeItem(`financial-pro-reports-${user.id}`);
    }
  };

  const handleRemoveReport = (filename) => {
    // Remove the specific report from allReports
    const updatedReports = allReports.filter(report => report.filename !== filename);
    setAllReports(updatedReports);

    // Update the display based on remaining reports
    if (updatedReports.length === 0) {
      // No reports left
      setMultiReportData(null);
      setReportData(null);
      // Upload area will show automatically since no reports remain
    } else if (updatedReports.length === 1) {
      // Only one report left, show single report view
      setReportData(updatedReports[0]);
      setMultiReportData(null);
      // Upload area will be hidden automatically since reports exist
    } else {
      // Multiple reports remain, update multi-report view
      const combinedData = createCombinedReportData(updatedReports);
      setMultiReportData(combinedData);
      setReportData(null);
      // Upload area will be hidden automatically since reports exist
    }
  };

  const handleNavigation = (pageId) => {
    setCurrentPage(pageId);
    // Add any additional navigation logic here
    console.log(`Navigating to: ${pageId}`);
  };

  const handleAddMoreReports = () => {
    // Trigger file input click instead of showing upload area
    const fileInput = document.getElementById('hidden-file-input');
    if (fileInput) {
      fileInput.click();
    }
  };

  const checkForDuplicateFiles = (newFiles) => {
    const existingFilenames = allReports.map(report => report.filename);
    const duplicateFiles = [];
    const uniqueFiles = [];

    newFiles.forEach(file => {
      if (existingFilenames.includes(file.name)) {
        duplicateFiles.push(file.name);
      } else {
        uniqueFiles.push(file);
      }
    });

    return { duplicateFiles, uniqueFiles };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        userType="individual"
        currentPage={currentPage}
        onNavigate={handleNavigation}
        user={user}
        onLogout={logout}
        onCollapseChange={setSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div className={`${sidebarCollapsed ? 'ml-18' : 'ml-68'} flex flex-col min-h-screen transition-all duration-300`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {currentPage === 'reports' && 'Expense Reports'}
                  {currentPage === 'dashboard' && 'Dashboard'}
                  {currentPage === 'categories' && 'Categories'}
                  {currentPage === 'settings' && 'Settings'}
                </h1>
                <p className="text-gray-600 mt-1">
                  {currentPage === 'reports' && 'Upload and analyze your expense data'}
                  {currentPage === 'dashboard' && 'Overview of your financial data'}
                  {currentPage === 'categories' && 'Manage expense categories'}
                  {currentPage === 'settings' && 'Account and application settings'}
                </p>
              </div>
              <div className="flex items-center space-x-4">
                {(reportData || multiReportData) && currentPage === 'reports' && (
                  <>
                    <button
                      onClick={handleAddMoreReports}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Add More Reports
                    </button>
                    <button
                      onClick={handleReset}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Clear All Reports
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error Processing File</h3>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Page Content Based on Current Page */}
            {currentPage === 'reports' && (
              <>
                {/* File Upload Area - Only show when no reports exist */}
                {(!reportData && !multiReportData) && (
                  <FileUpload 
                    onFileUpload={handleFileUpload} 
                    isLoading={isLoading} 
                    hasExistingReports={allReports.length > 0}
                    existingFiles={allReports.map(report => report.filename)}
                  />
                )}

                {/* Hidden file input for Add More Reports button */}
                <input
                  id="hidden-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const files = Array.from(e.target.files);
                      handleFileUpload(files);
                      // Clear the input to allow re-selecting the same file if needed
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />

                {/* Show reports if they exist */}
                {multiReportData ? (
                  <div>
                    <MultiReport data={multiReportData} onRemoveReport={handleRemoveReport} />
                  </div>
                ) : reportData ? (
                  <div>
                    <Report data={reportData} />
                  </div>
                ) : null}

                {(reportData || multiReportData) && (
                  <div className="mt-8 text-center">
                    <p className="text-gray-600">
                      {multiReportData ? multiReportData.message : reportData.message}
                    </p>
                  </div>
                )}
              </>
            )}

            {currentPage === 'dashboard' && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Dashboard Coming Soon</h3>
                  <p className="text-gray-600">This page will show an overview of your financial data and key metrics.</p>
                </div>
              </div>
            )}

            {currentPage === 'categories' && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Category Management Coming Soon</h3>
                  <p className="text-gray-600">This page will allow you to create and manage custom expense categories.</p>
                </div>
              </div>
            )}

            {currentPage === 'settings' && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Coming Soon</h3>
                  <p className="text-gray-600">This page will contain account settings and application preferences.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 z-50"
          aria-label="Scroll to top"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <FinancialProApp />
    </AuthProvider>
  );
}
