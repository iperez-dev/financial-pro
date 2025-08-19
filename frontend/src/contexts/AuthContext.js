/**
 * Authentication Context for Financial Pro
 * Manages user authentication state with Supabase
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, signIn, signUp, signOut, getCurrentUser, getSession } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for development mode bypass
    const checkDevMode = () => {
      const devMode = window.localStorage.getItem('dev-mode')
      if (devMode === 'true') {
        // Create mock user for development
        const mockUser = {
          id: 'dev-user-123',
          email: 'dev@example.com',
          user_metadata: { full_name: 'Development User' }
        }
        const mockSession = {
          user: mockUser,
          access_token: 'dev-token-123'
        }
        setUser(mockUser)
        setSession(mockSession)
        setLoading(false)
        return true
      }
      return false
    }

    // If dev mode is active, skip real authentication
    if (checkDevMode()) {
      return
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { session, error } = await getSession()
        if (error) {
          console.error('Error getting session:', error)
        } else {
          setSession(session)
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email, password) => {
    try {
      setLoading(true)
      const { data, error } = await signIn(email, password)
      
      if (error) {
        throw error
      }
      
      return { data, error: null }
    } catch (error) {
      console.error('Login error:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const register = async (email, password, userData = {}) => {
    try {
      setLoading(true)
      const { data, error } = await signUp(email, password, userData)
      
      if (error) {
        throw error
      }
      
      return { data, error: null }
    } catch (error) {
      console.error('Registration error:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      setLoading(true)
      
      // Check if we're in dev mode
      const devMode = window.localStorage.getItem('dev-mode')
      if (devMode === 'true') {
        // Clear dev mode
        window.localStorage.removeItem('dev-mode')
        setUser(null)
        setSession(null)
        setLoading(false)
        return { error: null }
      }
      
      // Regular logout
      const { error } = await signOut()
      
      if (error) {
        throw error
      }
      
      // Clear local state
      setUser(null)
      setSession(null)
      
      return { error: null }
    } catch (error) {
      console.error('Logout error:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  const getAuthToken = () => {
    return session?.access_token || null
  }

  const value = {
    user,
    session,
    loading,
    login,
    register,
    logout,
    getAuthToken,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
