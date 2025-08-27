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
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { session, error } = await getSession()
        if (error) {
          console.error('Error getting session:', error)
        } else {
          setSession(session)
          setUser(session?.user ?? null)
          // If we already have a session, fetch profile immediately with the token from this session
          if (session?.user && session?.access_token) {
            await fetchUserProfile(session.user.id, session.access_token)
          }
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Function to fetch user profile
    const fetchUserProfile = async (userId, tokenFromEvent) => {
      try {
        // Prefer the token passed from the auth state event to avoid race conditions.
        const bearer = tokenFromEvent || session?.access_token || undefined
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/profile`, {
          headers: {
            ...(bearer ? { 'Authorization': `Bearer ${bearer}` } : {}),
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          const profile = await response.json()
          setUserProfile(profile)
          return profile
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
      return null
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        
        // Fetch user profile if authenticated
        if (session?.user) {
          await fetchUserProfile(session.user.id, session?.access_token)
        } else {
          setUserProfile(null)
        }
        
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
    userProfile,
    loading,
    login,
    register,
    logout,
    getAuthToken,
    isAuthenticated: !!user,
    isIndividual: userProfile?.user_role === 'individual',
    isBusinessOwner: userProfile?.user_role === 'business_owner',
    isBusinessClient: userProfile?.user_role === 'business_client',
    businessId: userProfile?.business_id
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
