import { useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { logout } from '../../modules/users';
import { ROLE_LABELS } from '../../shared/types';
import { resetDemoData } from '../../storage/seed';
import { useAuth } from '../context/AuthContext';
import { ErrorNotice, Modal } from './Common';
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Загрузка…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <Outlet /> : <section><h1>Доступ запрещён</h1><p>Этот раздел доступен только администратору.</p></section>;
}
export function AppLayout() {
  const { user, refresh } = useAuth();
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function endSession(resetData = false) {
    setBusy(true);
    try {
      if (resetData) await resetDemoData();
      else { const result = await logout(); if (!result.ok) { setError(result.error.message); return; } }
      setReset(false);
      await refresh();
    } catch { setError('Не удалось сохранить изменения. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  return <><header><div className="header-inner"><NavLink className="brand" to={user ? '/search' : '/login'}>PolyRoomBooking<span>СПбПУ · 3 корпус</span></NavLink>
    {user && <><nav aria-label="Основная навигация"><NavLink to="/search">Поиск аудиторий</NavLink><NavLink to="/my-bookings">Мои бронирования</NavLink>{user.role === 'admin' && <NavLink to="/admin">Администрирование</NavLink>}</nav><div className="account"><span>{user.fullName}<small>{ROLE_LABELS[user.role]}</small></span><button className="secondary" disabled={busy} onClick={() => void endSession()}>Выйти</button></div></>}
  </div></header><main className="container"><ErrorNotice message={error} /><Outlet /></main><footer className="container"><span>Бронирование аудиторий</span><button className="text-button" onClick={() => setReset(true)}>Сбросить демо-данные</button></footer>
    {reset && <Modal title="Сбросить демо-данные?" busy={busy} onClose={() => setReset(false)}><p>Все изменения и бронирования будут заменены исходными демо-данными. Вы выйдете из учётной записи.</p><button disabled={busy} onClick={() => void endSession(true)}>Подтвердить сброс</button></Modal>}</>;
}
