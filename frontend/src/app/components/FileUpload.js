'use client';

import { useState } from 'react';

export default function FileUpload({ onFileUpload, isLoading, hasExistingReports = false, existingFiles = [] }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = (files) => {
    // Validate file types
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // .csv alternative MIME type
    ];
    
    const invalidFiles = files.filter(file => {
      const fileName = file.name.toLowerCase();
      return !allowedTypes.includes(file.type) && 
             !fileName.endsWith('.xlsx') && 
             !fileName.endsWith('.xls') && 
             !fileName.endsWith('.csv');
    });

    if (invalidFiles.length > 0) {
      alert(`Please upload only Excel files (.xlsx, .xls) or CSV files (.csv). Invalid files: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    // Check for duplicate files
    const duplicateFiles = files.filter(file => 
      existingFiles.includes(file.name)
    );

    if (duplicateFiles.length > 0) {
      const duplicateMessage = duplicateFiles.length === 1 
        ? `The file "${duplicateFiles[0].name}" has already been uploaded. Please try a different file.`
        : `The following files have already been uploaded: ${duplicateFiles.map(f => f.name).join(', ')}. Please try different files.`;
      
      alert(duplicateMessage);
      return;
    }

    setSelectedFiles(files);
    onFileUpload(files);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {hasExistingReports ? 'Add More Expense Files' : 'Upload Your Expense Files'}
        </h2>
        <p className="text-gray-600">
          {hasExistingReports 
            ? 'Upload additional Excel files (.xlsx, .xls) or CSV files (.csv) to add to your existing reports. New files will be added to your current analysis.'
            : 'Upload one or multiple Excel files (.xlsx, .xls) or CSV files (.csv) containing your expense data. Make sure your files have columns for description and amount.'
          }
        </p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />
        
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 text-gray-400">
            <svg
              className="w-full h-full"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          
          {isLoading ? (
            <div className="space-y-2">
              <div className="animate-spin mx-auto w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <p className="text-gray-600">Processing your file...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-900">
                {selectedFiles.length > 0 
                  ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`
                  : 'Drop your expense files here'
                }
              </p>
              <p className="text-gray-500">
                or click to browse files
              </p>
              <p className="text-sm text-gray-400">
                Supports .xlsx, .xls, and .csv files • Multiple files allowed
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedFiles.length > 0 && !isLoading && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center mb-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <span className="text-green-800 font-medium truncate">{file.name}</span>
                <span className="text-green-600 ml-2">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
