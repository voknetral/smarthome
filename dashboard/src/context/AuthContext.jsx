import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE_URL } from '../config'

const AuthContext = createContext(null)
const API_URL = API_BASE_URL

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [adminExists, setAdminExists] = useState(null)

    useEffect(() => {
        // Check localStorage for existing session
        const storedUser = localStorage.getItem('currentUser')
        const storedToken = localStorage.getItem('access_token')
        if (storedUser && storedToken) {
            setUser(JSON.parse(storedUser))
        } else {
            // Clean up if mismatched
            localStorage.removeItem('currentUser')
            localStorage.removeItem('access_token')
        }

        // Check if admin exists
        checkAdminExists()
        setIsLoading(false)
    }, [])

    // Heartbeat logic
    useEffect(() => {
        if (!user) return;

        // Initial heartbeat
        sendHeartbeat();

        // Setup interval (every 1 minute)
        const interval = setInterval(sendHeartbeat, 60 * 1000);

        return () => clearInterval(interval);
    }, [user])

    const sendHeartbeat = async () => {
        try {
            await fetchWithAuth(`${API_URL}/auth/heartbeat`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Heartbeat failed:', error);
        }
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token')
        return token ? { 'Authorization': `Bearer ${token}` } : {}
    }

    const checkAdminExists = async () => {
        try {
            const response = await fetch(`${API_URL}/auth/check-admin`)
            const data = await response.json()
            setAdminExists(data.hasAdmin)
            return data.hasAdmin
        } catch (error) {
            console.error('Error checking admin:', error)
            setAdminExists(false)
            return false
        }
    }

    const login = async (username, password) => {
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })

            if (!response.ok) {
                const error = await response.json()
                return { success: false, error: error.detail || 'Login gagal' }
            }

            const data = await response.json()
            const userData = data.user
            const token = data.access_token

            setUser(userData)
            localStorage.setItem('currentUser', JSON.stringify(userData))
            localStorage.setItem('access_token', token)
            return { success: true }
        } catch (error) {
            console.error('Login error:', error)
            return { success: false, error: 'Gagal menghubungi server' }
        }
    }

    const logout = async (is401 = false) => {
        try {
            // Only notify server if we're not logging out due to a 401
            // (If it's a 401, the token is already invalid, so the request would fail)
            if (!is401) {
                await fetchWithAuth(`${API_URL}/auth/logout`, {
                    method: 'POST'
                });
            }
        } catch (error) {
            console.error('Logout notify error:', error);
        } finally {
            setUser(null)
            localStorage.removeItem('currentUser')
            localStorage.removeItem('access_token')
        }
    }

    const setupAdmin = async (username, password) => {
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role: 'admin' })
            })

            if (!response.ok) {
                const error = await response.json()
                return { success: false, error: error.detail || 'Registrasi gagal' }
            }

            setAdminExists(true)
            return { success: true }
        } catch (error) {
            console.error('Setup error:', error)
            return { success: false, error: 'Gagal menghubungi server' }
        }
    }

    const updateProfile = async (currentPassword, newUsername, newPassword) => {
        try {
            if (!user?.id) return { success: false, error: 'User ID not found' }

            const body = {
                user_id: user.id,
                current_password: currentPassword
            }
            if (newUsername) body.username = newUsername
            if (newPassword) body.new_password = newPassword

            const response = await fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                const error = await response.json()
                return { success: false, error: error.detail || 'Update profil gagal' }
            }

            const data = await response.json()
            const updatedUser = data.user
            setUser(updatedUser)
            localStorage.setItem('currentUser', JSON.stringify(updatedUser))

            return { success: true }
        } catch (error) {
            console.error('Update profile error:', error)
            return { success: false, error: 'Gagal menghubungi server' }
        }
    }

    const updateUserLocal = (newData) => {
        if (!user) return
        const updatedUser = { ...user, ...newData }
        setUser(updatedUser)
        localStorage.setItem('currentUser', JSON.stringify(updatedUser))
    }

    const isAdminSetup = () => {
        return adminExists === true
    }

    const fetchWithAuth = async (url, options = {}) => {
        const headers = {
            ...options.headers,
            ...getAuthHeaders()
        }

        try {
            const response = await fetch(url, { ...options, headers })

            if (response.status === 401) {
                console.warn('Session expired (401), logging out...')
                logout(true)
                return response
            }

            return response
        } catch (error) {
            console.error('Fetch error:', error)
            throw error
        }
    }

    const value = {
        user,
        isAuthenticated: !!user,
        isAdmin: user?.isAdmin || user?.role === 'admin' || false,
        isLoading,
        adminExists,
        login,
        logout,
        setupAdmin,
        isAdminSetup,
        checkAdminExists,
        updateProfile,
        updateUserLocal,
        getAuthHeaders,
        fetchWithAuth
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
