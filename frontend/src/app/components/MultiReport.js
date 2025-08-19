'use client';

import { useState, useEffect } from 'react';
import Report from './Report';

// Helper function to format filename (same as in Report.js)
const formatFilename = (filename) => {
  if (!filename) return 'Transactions';
  
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.(csv|xlsx|xls)$/i, '');
  
  // Handle the specific case: Chase1190_Activity_20250816
  // Pattern: BankName + Number + _Activity_ + YYYYMMDD
  const activityMatch = nameWithoutExt.match(/^([A-Za-z]+)(\d+)_Activity_(\d{8})$/);
  if (activityMatch) {
    const [, bankName, accountNumber, dateStr] = activityMatch;
    
    // Format date from YYYYMMDD to YYYY.MM.DD
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const formattedDate = `${year}.${month}.${day}`;
    
    return `${bankName} ${accountNumber} - Activity (${formattedDate})`;
  }
  
  // Fallback: just replace underscores with spaces and capitalize first letter
  return nameWithoutExt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export default function MultiReport({ data }) {
  const { reports, summary, total_files, successful_files } = data;
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

  // Create file names for summary header
  const successfulReports = reports.filter(report => report.success);
  const fileNames = successfulReports.map(report => formatFilename(report.filename)).join(', ');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-12">
      
      {/* Summary Section (only show if multiple reports) */}
      {total_files > 1 && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-8 text-white shadow-lg">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">
                Expense Report Summary for {fileNames}
              </h2>
              <p className="text-blue-100">
                Combined analysis of {successful_files} report{successful_files > 1 ? 's' : ''}
                {total_files !== successful_files && (
                  <span className="text-yellow-200">
                    {' '}({total_files - successful_files} file{total_files - successful_files > 1 ? 's' : ''} failed)
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm">Net Amount</p>
              <p className={`text-2xl font-bold ${summary.net_amount >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {formatCurrency(summary.net_amount)}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="flex items-center mb-2">
                <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <h3 className="text-lg font-semibold">Total Expenses</h3>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(Math.abs(summary.total_expenses))}</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="flex items-center mb-2">
                <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <h3 className="text-lg font-semibold">Total Income</h3>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(summary.total_income)}</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="flex items-center mb-2">
                <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="text-lg font-semibold">Total Transactions</h3>
              </div>
              <p className="text-3xl font-bold">{summary.total_transactions}</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="flex items-center mb-2">
                <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-semibold">Files Processed</h3>
              </div>
              <p className="text-3xl font-bold">{successful_files}</p>
              {total_files !== successful_files && (
                <p className="text-yellow-200 text-sm mt-1">of {total_files} total</p>
              )}
            </div>
          </div>
          
          {/* Breakdown by report type */}
          <div className="mt-6 pt-6 border-t border-white/20">
            <h4 className="text-lg font-semibold mb-3">Breakdown by Report</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {successfulReports.map((report, index) => (
                <div key={index} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <h5 className="font-medium mb-2 truncate" title={formatFilename(report.filename)}>
                    {formatFilename(report.filename)}
                  </h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Expenses:</span>
                      <span>{formatCurrency(Math.abs(report.summary.total_expenses))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Income:</span>
                      <span>{formatCurrency(report.summary.total_income)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transactions:</span>
                      <span>{report.summary.total_transactions}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Individual Reports */}
      <div className="space-y-16">
        {reports.map((report, index) => (
          <div key={index} className={`${index > 0 ? 'border-t-4 border-gray-200 pt-16' : ''}`}>
            {report.success ? (
              <Report data={report} />
            ) : (
              // Error display for failed reports
              <div className="bg-red-50 border border-red-200 rounded-lg p-8">
                <div className="flex items-center mb-4">
                  <svg className="h-8 w-8 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h3 className="text-xl font-semibold text-red-900">Failed to Process {report.filename}</h3>
                    <p className="text-red-700 mt-1">{report.error}</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-red-100 rounded border border-red-300">
                  <h4 className="font-medium text-red-900 mb-2">Suggestions:</h4>
                  <ul className="text-red-700 text-sm space-y-1">
                    <li>• Ensure the file has 'description' and 'amount' columns</li>
                    <li>• Check that the file is not corrupted</li>
                    <li>• Verify the file format is .csv, .xlsx, or .xls</li>
                    <li>• Try uploading this file separately for more detailed error information</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
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
