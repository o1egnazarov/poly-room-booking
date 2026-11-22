import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './ui/context/AuthContext';
import { AppLayout, RequireAdmin, RequireAuth } from './ui/components/AppLayout';
import LoginPage from './ui/pages/LoginPage';
import SearchPage from './ui/pages/SearchPage';
import MyBookingsPage from './ui/pages/MyBookingsPage';
import AdminPage from './ui/pages/AdminPage';
export function AppRoutes() {
  return <AuthProvider><Routes><Route element={<AppLayout />}><Route path="/login" element={<LoginPage />} /><Route element={<RequireAuth />}><Route path="/search" element={<SearchPage />} /><Route path="/my-bookings" element={<MyBookingsPage />} /><Route element={<RequireAdmin />}><Route path="/admin" element={<AdminPage />} /></Route></Route><Route path="*" element={<Navigate to="/search" replace />} /></Route></Routes></AuthProvider>;
}
export default function App() { return <BrowserRouter><AppRoutes /></BrowserRouter>; }
