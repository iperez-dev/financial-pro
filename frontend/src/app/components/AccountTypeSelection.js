/**
 * Account Type Selection Component
 * First step in the authentication flow - choose Individual or Business
 */
export default function AccountTypeSelection({ onAccountTypeSelect }) {

  const accountTypes = [
    {
      id: 'individual',
      title: 'Individual Account',
      subtitle: 'Personal Financial Management',
      description: 'Track your personal expenses, categorize transactions, and generate financial reports.',
      icon: '👤',
      color: 'blue',
      features: [
        'Personal expense tracking',
        'Smart transaction categorization',
        'Income and expense reports',
        'PDF report generation',
        'Custom categories',
        'Zelle payment tracking'
      ]
    },
    {
      id: 'business',
      title: 'Business Account',
      subtitle: 'Client Management for Tax Services',
      description: 'Manage multiple client accounts, track their expenses, and generate comprehensive reports.',
      icon: '🏢',
      color: 'green',
      badge: 'Tax Services',
      features: [
        'Multi-client management',
        'Business dashboard',
        'Client invitation system',
        'Consolidated reporting',
        'Business-specific categories',
        'Professional client interface'
      ]
    }
  ]



  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-blue-100">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="mt-6 text-4xl font-extrabold text-gray-900">
            Welcome to Financial Pro
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Choose your account type to get started with personalized financial management
          </p>
        </div>

        {/* Account Type Cards */}
        <div className="grid md:grid-cols-2 gap-8 mt-12">
          {accountTypes.map((type) => (
            <div
              key={type.id}
              className="relative rounded-2xl border-2 p-8 cursor-pointer transition-all duration-200 border-gray-200 hover:border-gray-300 hover:shadow-md hover:scale-105"
              onClick={() => onAccountTypeSelect(type.id)}
            >
              {/* Badge */}
              {type.badge && (
                <div className="absolute -top-3 right-6">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 shadow-sm">
                    ✨ {type.badge}
                  </span>
                </div>
              )}
              


              {/* Icon and Title */}
              <div className="flex items-start mb-6">
                <div className="text-5xl mr-4">{type.icon}</div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">{type.title}</h3>
                  <p className={`text-lg font-medium text-${type.color}-600 mb-3`}>{type.subtitle}</p>
                  <p className="text-gray-600 leading-relaxed">{type.description}</p>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Key Features</h4>
                <ul className="space-y-2">
                  {type.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm text-gray-700">
                      <svg className={`h-4 w-4 text-${type.color}-500 mr-3 flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Hover Effect Overlay */}
              <div className={`absolute inset-0 rounded-2xl transition-opacity duration-200 opacity-0 hover:opacity-5 bg-${type.color}-500 pointer-events-none`} />
            </div>
          ))}
        </div>




      </div>
    </div>
  )
}
