/**
 * Role Selection Component
 * Allows users to choose between Individual and Business account types
 */
import { useState } from 'react'

export default function RoleSelection({ onRoleSelect, onBack }) {
  const [selectedRole, setSelectedRole] = useState(null)

  const roles = [
    {
      id: 'individual',
      title: 'Individual User',
      description: 'Personal expense tracking and financial management',
      icon: '👤',
      features: [
        'Personal expense categorization',
        'Income and expense tracking',
        'PDF report generation',
        'Smart transaction learning',
        'Personal categories management'
      ]
    },
    {
      id: 'business_owner',
      title: 'Business Account',
      description: 'Manage multiple client accounts for your business',
      icon: '🏢',
      features: [
        'Client account management',
        'Business dashboard',
        'Multi-client reporting',
        'Business-specific categories',
        'Client invitation system'
      ],
      badge: 'Tax Services'
    }
  ]

  const handleContinue = () => {
    if (selectedRole) {
      onRoleSelect(selectedRole)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            <span className="text-2xl">💰</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Choose Your Account Type
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Select the type of account that best fits your needs
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {roles.map((role) => (
            <div
              key={role.id}
              className={`relative rounded-lg border-2 p-6 cursor-pointer transition-all ${
                selectedRole === role.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedRole(role.id)}
            >
              {role.badge && (
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {role.badge}
                  </span>
                </div>
              )}
              
              <div className="flex items-center mb-4">
                <div className="text-3xl mr-3">{role.icon}</div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{role.title}</h3>
                  <p className="text-sm text-gray-500">{role.description}</p>
                </div>
              </div>

              <ul className="space-y-2">
                {role.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-600">
                    <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {selectedRole === role.id && (
                <div className="absolute inset-0 rounded-lg border-2 border-blue-500 pointer-events-none">
                  <div className="absolute top-2 right-2">
                    <div className="h-6 w-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Back to Login
          </button>
          
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selectedRole}
            className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>

        {/* Development Mode Bypass */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">Development Mode</span>
            </div>
          </div>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem('dev-mode', 'true')
                window.location.reload()
              }}
              className="text-blue-600 hover:text-blue-500 text-sm"
            >
              🛠️ Skip Authentication (Development Mode)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
