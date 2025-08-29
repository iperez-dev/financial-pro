/**
 * Dashboard Component
 * Shows key insights and monthly comparisons for expense data
 */
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMonthlySummary } from '../../lib/api'
import { formatCurrency } from '../../lib/formatters'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export default function Dashboard({ reports = [] }) {
  const { user } = useAuth()
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState('1') // Last month only

  // Fetch monthly summary data
  useEffect(() => {
    fetchMonthlyData()
  }, [selectedPeriod, JSON.stringify(reports)])

  const fetchMonthlyData = async () => {
    try {
      setLoading(true)
      setError(null)

      // If reports are provided (Monthly Expense Report source), compute from them
      if (reports && reports.length > 0) {
        const fromReports = computeFromReports(reports)
        setMonthlyData(fromReports)
        return
      }

      // Otherwise, fetch from API for the selected period (last month)
      const months = []
      const now = new Date()
      const periodCount = parseInt(selectedPeriod)
      for (let i = 0; i < periodCount; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        months.push(monthStr)
      }
      const monthsCsv = months.join(',')
      const data = await getMonthlySummary(monthsCsv)

      // Transform API response { months: { 'YYYY-MM': bucket } } into array and sort (newest first)
      const monthsObj = data?.months || {}
      const transformed = Object.keys(monthsObj).map((monthKey) => {
        const bucket = monthsObj[monthKey] || {}
        const totalTransactions = (bucket.expense_transactions || 0) + (bucket.income_transactions || 0)
        return {
          month: monthKey,
          total_transactions: totalTransactions,
          ...bucket,
        }
      }).sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'))

      if (transformed.length > 0) {
        setMonthlyData(transformed)
      } else {
        // Fallback: compute from locally saved reports (client-only)
        const local = computeFromLocalReports()
        setMonthlyData(local)
      }
    } catch (err) {
      console.error('Error fetching monthly data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Calculate key metrics
  const metrics = useMemo(() => {
    if (monthlyData.length === 0) return null

    const currentMonth = monthlyData[0]
    const previousMonth = monthlyData[1]
    
    const totalExpenses = monthlyData.reduce((sum, month) => sum + Math.abs(month.total_expenses || 0), 0)
    const totalIncome = monthlyData.reduce((sum, month) => sum + Math.abs(month.total_income || 0), 0)
    const avgMonthlyExpenses = totalExpenses / monthlyData.length
    const avgMonthlyIncome = totalIncome / monthlyData.length

    // Month-over-month changes
    const expenseChange = previousMonth ? 
      ((Math.abs(currentMonth.total_expenses) - Math.abs(previousMonth.total_expenses)) / Math.abs(previousMonth.total_expenses)) * 100 : 0
    const incomeChange = previousMonth ? 
      ((Math.abs(currentMonth.total_income) - Math.abs(previousMonth.total_income)) / Math.abs(previousMonth.total_income)) * 100 : 0

    return {
      currentMonth: {
        expenses: Math.abs(currentMonth.total_expenses || 0),
        income: Math.abs(currentMonth.total_income || 0),
        net: (currentMonth.total_income || 0) - Math.abs(currentMonth.total_expenses || 0),
        transactions: currentMonth.total_transactions || 0
      },
      changes: {
        expenses: expenseChange,
        income: incomeChange
      },
      averages: {
        expenses: avgMonthlyExpenses,
        income: avgMonthlyIncome
      },
      totals: {
        expenses: totalExpenses,
        income: totalIncome,
        net: totalIncome - totalExpenses
      }
    }
  }, [monthlyData])

  // Prepare chart data
  const chartData = useMemo(() => {
    return monthlyData.map(month => ({
      month: new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      expenses: Math.abs(month.total_expenses || 0),
      income: Math.abs(month.total_income || 0),
      net: (month.total_income || 0) - Math.abs(month.total_expenses || 0),
    })).reverse() // Reverse to show chronological order in charts
  }, [monthlyData])

  // Category breakdown for current month
  const categoryData = useMemo(() => {
    if (monthlyData.length === 0 || !monthlyData[0].categories) return []

    return monthlyData[0].categories.map(cat => ({
      name: cat.category,
      value: Math.abs(cat.total_amount || 0),
      count: cat.transaction_count || 0
    })).slice(0, 6) // Top 6 categories
  }, [monthlyData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Dashboard</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <button 
              onClick={fetchMonthlyData}
              className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-600">Upload some expense reports to see your dashboard insights.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period Selection */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Financial Dashboard</h2>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="3">Last 3 Months</option>
          <option value="6">Last 6 Months</option>
          <option value="12">Last 12 Months</option>
        </select>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Month Expenses */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">This Month Expenses</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.currentMonth.expenses)}</p>
              {metrics.changes.expenses !== 0 && (
                <p className={`text-sm ${metrics.changes.expenses > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.changes.expenses > 0 ? '↑' : '↓'} {Math.abs(metrics.changes.expenses).toFixed(1)}% from last month
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Current Month Income */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">This Month Income</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.currentMonth.income)}</p>
              {metrics.changes.income !== 0 && (
                <p className={`text-sm ${metrics.changes.income > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {metrics.changes.income > 0 ? '↑' : '↓'} {Math.abs(metrics.changes.income).toFixed(1)}% from last month
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Net Amount */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${metrics.currentMonth.net >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center`}>
                <svg className={`w-5 h-5 ${metrics.currentMonth.net >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">Net This Month</p>
              <p className={`text-2xl font-bold ${metrics.currentMonth.net >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {formatCurrency(metrics.currentMonth.net)}
              </p>
              <p className="text-sm text-gray-500">Income - Expenses</p>
            </div>
          </div>
        </div>

        {/* Average Monthly Expenses */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">Avg Monthly Expenses</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.averages.expenses)}</p>
              <p className="text-sm text-gray-500">Over {selectedPeriod} months</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Trends</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [formatCurrency(value), '']} />
                <Legend />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
                <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} name="Income" />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} name="Net" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Categories This Month</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatCurrency(value), 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Comparison Bar Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Comparison</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => [formatCurrency(value), '']} />
              <Legend />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
              <Bar dataKey="income" fill="#22c55e" name="Income" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Summary Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Income</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlyData.map((month, index) => (
                <tr key={month.month} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">
                    {formatCurrency(Math.abs(month.total_expenses || 0))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                    {formatCurrency(Math.abs(month.total_income || 0))}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                    ((month.total_income || 0) - Math.abs(month.total_expenses || 0)) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency((month.total_income || 0) - Math.abs(month.total_expenses || 0))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {month.total_transactions || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Build monthly buckets from reports stored in localStorage when API has no data yet
function computeFromLocalReports() {
  if (typeof window === 'undefined') return []

  try {
    // We do not have direct access to user here, but storage keys are per-user in page.js
    // Try best-effort discovery of keys if user id is unknown
    const possibleKeys = Object.keys(localStorage).filter(k => k.startsWith('financial-pro-reports-'))
    let reports = []
    for (const key of possibleKeys) {
      const txt = localStorage.getItem(key)
      if (!txt) continue
      try {
        const arr = JSON.parse(txt)
        if (Array.isArray(arr)) {
          reports = arr
          break
        }
      } catch {}
    }

    if (!reports || reports.length === 0) return []

    const buckets = {}
    for (const report of reports) {
      const txs = report.transactions || []
      for (const t of txs) {
        const dt = new Date(t.date || t.transaction_date || t.posting_date)
        if (isNaN(dt)) continue
        const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        const amount = Number(t.amount) || 0
        const categoryName = t.category || 'Uncategorized'

        const bucket = buckets[monthKey] || {
          total_expenses: 0,
          total_income: 0,
          expense_transactions: 0,
          income_transactions: 0,
          categories: {},
        }

        if (amount >= 0) {
          bucket.total_income += amount
          bucket.income_transactions += 1
        } else {
          const absAmt = Math.abs(amount)
          bucket.total_expenses += absAmt
          bucket.expense_transactions += 1
          const cat = bucket.categories[categoryName] || { category: categoryName, total_amount: 0, transaction_count: 0 }
          cat.total_amount += absAmt
          cat.transaction_count += 1
          bucket.categories[categoryName] = cat
        }

        buckets[monthKey] = bucket
      }
    }

    const transformed = Object.keys(buckets).map((monthKey) => {
      const bucket = buckets[monthKey]
      const totalTransactions = (bucket.expense_transactions || 0) + (bucket.income_transactions || 0)
      const categories = Object.values(bucket.categories).sort((a, b) => b.total_amount - a.total_amount)
      return {
        month: monthKey,
        total_transactions: totalTransactions,
        ...bucket,
        categories,
      }
    }).sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'))

    return transformed
  } catch {
    return []
  }
}

// Build monthly buckets strictly from provided Monthly Expense Reports (preferred source)
function computeFromReports(reports) {
  try {
    const buckets = {}
    for (const report of reports) {
      const txs = report.transactions || []
      for (const t of txs) {
        const dt = new Date(t.date || t.transaction_date || t.posting_date)
        if (isNaN(dt)) continue
        const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        const amount = Number(t.amount) || 0
        const categoryName = t.category || 'Uncategorized'

        const bucket = buckets[monthKey] || {
          total_expenses: 0,
          total_income: 0,
          expense_transactions: 0,
          income_transactions: 0,
          categories: {},
        }

        if (amount >= 0) {
          bucket.total_income += amount
          bucket.income_transactions += 1
        } else {
          const absAmt = Math.abs(amount)
          bucket.total_expenses += absAmt
          bucket.expense_transactions += 1
          const cat = bucket.categories[categoryName] || { category: categoryName, total_amount: 0, transaction_count: 0 }
          cat.total_amount += absAmt
          cat.transaction_count += 1
          bucket.categories[categoryName] = cat
        }

        buckets[monthKey] = bucket
      }
    }

    const transformed = Object.keys(buckets).map((monthKey) => {
      const bucket = buckets[monthKey]
      const totalTransactions = (bucket.expense_transactions || 0) + (bucket.income_transactions || 0)
      const categories = Object.values(bucket.categories).sort((a, b) => b.total_amount - a.total_amount)
      return {
        month: monthKey,
        total_transactions: totalTransactions,
        ...bucket,
        categories,
      }
    }).sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'))

    // Limit to last month only for now
    return transformed.slice(0, 1)
  } catch {
    return []
  }
}
