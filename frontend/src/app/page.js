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


function FinancialProApp() {
  const { user, userProfile, loading, logout, getAuthToken, isBusinessOwner, isIndividual } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [multiReportData, setMultiReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authFlow, setAuthFlow] = useState('account-selection'); // 'account-selection', 'individual-auth', 'business-auth'
  const [showScrollTop, setShowScrollTop] = useState(false);

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
    setReportData(null);
    setMultiReportData(null);

    try {
      const formData = new FormData();
      
      // Handle both single file (legacy) and multiple files
      const fileArray = Array.isArray(files) ? files : [files];
      
      // Append files to FormData
      if (fileArray.length === 1) {
        // Single file - use existing endpoint
        formData.append('file', fileArray[0]);
      } else {
        // Multiple files - use new endpoint
        fileArray.forEach(file => {
          formData.append('files', file);
        });
      }

      const token = getAuthToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Choose endpoint based on number of files
      const endpoint = fileArray.length === 1 ? 'process-expenses' : 'process-multiple-expenses';
      
      const response = await fetch(`http://localhost:8000/${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process files');
      }

      const data = await response.json();
      
      // Set appropriate state based on response type
      if (fileArray.length === 1) {
        setReportData(data);
      } else {
        setMultiReportData(data);
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
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-3xl font-bold text-gray-900">Financial Pro</h1>
              </div>
              <div className="ml-4">
                <p className="text-gray-600">Expense Analysis & Reporting</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Development Mode Indicator */}
              {typeof window !== 'undefined' && window.localStorage?.getItem('dev-mode') === 'true' && (
                <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  🛠️ DEV MODE
                </span>
              )}
              <span className="text-sm text-gray-600">Welcome, {user.email}</span>
              {(reportData || multiReportData) && (
                <button
                  onClick={handleReset}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Upload New File
                </button>
              )}
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {!reportData && !multiReportData ? (
          <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />
        ) : multiReportData ? (
          <MultiReport data={multiReportData} />
        ) : (
          <Report data={reportData} />
        )}

        {(reportData || multiReportData) && (
          <div className="mt-8 text-center">
            <p className="text-gray-600">
              {multiReportData ? multiReportData.message : reportData.message}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500">
            <p>&copy; 2024 Financial Pro. Built with Next.js and FastAPI.</p>
          </div>
        </div>
      </footer>

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
