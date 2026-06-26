import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

const isLoggedIn = () => !!localStorage.getItem('gv_token')

const ProtectedRoute = ({ children }) => {
  return isLoggedIn() ? children : <Navigate to='/login' replace />
}

export default function App() {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />
      <Route
        path='/dashboard'
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path='*' element={<Navigate to='/login' replace />} />
    </Routes>
  )
}