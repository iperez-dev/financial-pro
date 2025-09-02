/**
 * Dashboard Component
 * Shows key insights and monthly comparisons for expense data
 */
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMonthlySummary } from '../../lib/api'
import { formatCurrency } from '../../lib/formatters'


export default function Dashboard({ reports = [] }) {
  const { user } = useAuth()
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState('1') // Last month only
  const [categoryNameToGroup, setCategoryNameToGroup] = useState({})

  // Fetch monthly summary data
  useEffect(() => {
    fetchMonthlyData()
  }, [selectedPeriod, JSON.stringify(reports)])

  // Removed category group mapping fetch (chart disabled)

  // Chart feature removed (no grouped fetch)

  // Parse helpers to handle values coming from DB as strings like "$1,234.56" or "33.48%"
  function parseCurrencyToNumber(value) {
    if (typeof value === 'number') return value
    if (value == null) return 0
    const str = String(value).trim()
    if (!str) return 0
    const hasParens = str.startsWith('(') && str.endsWith(')')
    const normalized = str.replace(/[^0-9.\-]/g, '')
    const num = parseFloat(normalized)
    if (isNaN(num)) return 0
    return hasParens ? -Math.abs(num) : num
  }

  function parsePercentageToNumber(value) {
    if (typeof value === 'number') return value
    if (value == null) return 0
    const str = String(value).trim().replace('%', '')
    const num = parseFloat(str)
    return isNaN(num) ? 0 : num
  }

  const fetchMonthlyData = async () => {
    try {
      setLoading(true)
      setError(null)

      // If reports are provided (Monthly Expense Report source), compute from them and try DB grouped summary
      if (reports && reports.length > 0) {
        const fromReports = computeFromReports(reports)
        // Try DB grouped summary for this last month
        const lastMonthKey = fromReports[0]?.month
        let dbGroups = null
        try {
          if (lastMonthKey) {
            const db = await getMonthlyGroupedSummary(lastMonthKey)
            if (db?.groups) {
              dbGroups = db.groups.map(g => {
                const amt = Math.abs(parseCurrencyToNumber(g.total_amount))
                const pct = parsePercentageToNumber(g.percentage)
                return {
                  group: g.group,
                  percentage: pct,
                  amount: amt,
                  amountLabel: formatCurrency(amt)
                }
              })
            }
          }
        } catch {}

        if (dbGroups && dbGroups.length > 0) {
          const hasNonZero = dbGroups.some(g => (g?.amount || 0) > 0)
          if (!hasNonZero) {
            // Ignore empty DB response (likely wrong month or no data); fallback to report-derived/groups
            setMonthlyData(fromReports)
            return
          }
          setMonthlyData([{ ...fromReports[0], _db_groups: dbGroups }])
        } else {
          setMonthlyData(fromReports)
        }
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
        // Also try DB grouped summary for this last month
        let dbGroups = null
        try {
          const lastMonthKey = transformed[0].month
          const db = await getMonthlyGroupedSummary(lastMonthKey)
          if (db?.groups) {
            dbGroups = db.groups.map(g => {
              const amt = Math.abs(parseCurrencyToNumber(g.total_amount))
              const pct = parsePercentageToNumber(g.percentage)
              return {
                group: g.group,
                percentage: pct,
                amount: amt,
                amountLabel: formatCurrency(amt)
              }
            })
          }
        } catch {}

        if (dbGroups && dbGroups.length > 0) {
          const hasNonZero = dbGroups.some(g => (g?.amount || 0) > 0)
          if (!hasNonZero) {
            // Ignore empty DB response; use computed monthly data only
            setMonthlyData(transformed)
            return
          }
          setMonthlyData([{ ...transformed[0], _db_groups: dbGroups }])
        } else {
          setMonthlyData(transformed)
        }
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
    
    const totalExpenses = Math.abs(currentMonth.total_expenses || 0)
    const totalIncome = Math.abs(currentMonth.total_income || 0)
    const avgMonthlyExpenses = totalExpenses
    const avgMonthlyIncome = totalIncome

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

  // Chart data removed

// Choose the report whose transactions are in the most recent month; fallback to most recent by date
function selectLastMonthReport(reports) {
  if (!Array.isArray(reports) || reports.length === 0) return null

  const getMaxDateForReport = (rep) => {
    const txs = rep?.transactions || []
    let maxTs = -Infinity
    txs.forEach((t) => {
      const dt = new Date(t.date || t.transaction_date || t.posting_date)
      const ts = dt.getTime()
      if (!isNaN(ts)) maxTs = Math.max(maxTs, ts)
    })
    return maxTs
  }

  // Find report with max date
  let best = null
  let bestTs = -Infinity
  for (const r of reports) {
    const ts = getMaxDateForReport(r)
    if (ts > bestTs) {
      bestTs = ts
      best = r
    }
  }
  return best
}

  // Category breakdown for current month
  const categoryData = []

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
        <div className="text-sm text-gray-600">Last Month</div>
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

      {/* Expense Distribution chart temporarily removed */}
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
