# Financial Pro - Phase 1

A locally running application that accepts Excel files of expenses, categorizes the data, and displays interactive reports that can be downloaded as PDF.

## Tech Stack

- **Frontend**: Next.js with Tailwind CSS
- **Backend**: Python with FastAPI
- **Data Processing**: Pandas
- **Charts**: Recharts
- **PDF Generation**: jsPDF + html2canvas

## Project Structure

```
financial-pro-app/
├── frontend/          # Next.js frontend application
├── backend/           # FastAPI backend application
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Python (v3.8 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   
   # On Windows
   .\venv\Scripts\Activate.ps1
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the backend server:
   ```bash
   python main.py
   ```
   
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
   
   The application will be available at `http://localhost:3000`

## Usage

1. Start both the backend and frontend servers
2. Open your browser to `http://localhost:3000`
3. Upload an Excel file (.xlsx, .xls) or CSV file (.csv) with expense data
4. View the generated report with:
   - Summary statistics
   - Category breakdown (pie chart and bar chart)
   - Monthly trends (if date column is present)
   - Transaction details
5. Download the report as PDF

## File Requirements

Your Excel or CSV file should contain at least two columns:
- **Description**: Transaction descriptions
- **Amount**: Transaction amounts (numeric)

Optional columns:
- **Date**: Transaction dates (for monthly analysis)

The application will automatically detect common column name variations.

## Features

### Phase 1 Features ✅
- [x] Excel file upload with drag & drop
- [x] Automatic expense categorization
- [x] Interactive charts and visualizations
- [x] PDF report generation
- [x] Responsive design
- [x] Error handling and validation

### Expense Categories

The application automatically categorizes expenses into:
- Food & Dining
- Transportation
- Shopping
- Utilities & Bills
- Entertainment
- Healthcare
- Other

## Security

- Environment variables are properly configured
- Sensitive data is excluded from version control
- CORS is configured for local development

## Development

### Backend API Endpoints

- `GET /` - Health check
- `POST /process-expenses` - Process uploaded Excel file

### Frontend Components

- `FileUpload` - Handles file upload with drag & drop
- `Report` - Displays charts and data tables
- `page.js` - Main application page with state management

## Future Phases

This is Phase 1 of the Financial Pro application. Future phases will include:
- User authentication
- Database integration
- Bank account connections
- Advanced analytics
- Multi-user support
- Cloud deployment

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure the backend is running on port 8000
2. **File upload fails**: Check that your Excel file has the required columns
3. **Charts not displaying**: Ensure all dependencies are installed correctly

### Support

For issues or questions, please check the console logs for detailed error messages.
