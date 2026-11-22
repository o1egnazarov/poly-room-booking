import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { listDemoAccounts, login } from '../../modules/users';
import { ROLE_LABELS, type User } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { ErrorNotice } from '../components/Common';
export default function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const [accounts, setAccounts] = useState<User[]>([]);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void listDemoAccounts().then(result => { if (result.ok) { setAccounts(result.data); setId(result.data[0]?.universityId ?? ''); } else setError(result.error.message); }); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login({ universityId: id }); if (result.ok) await refresh(); else setError(result.error.message); }
    catch { setError('Не удалось выполнить вход. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Загрузка…</p>;
  if (user) return <Navigate to="/search" replace />;
  return <section className="login panel"><p className="eyebrow">Аудитории для ваших идей</p><h1>Вход в систему</h1><p>Выберите университетскую учётную запись, чтобы найти аудиторию и забронировать удобное время.</p><form onSubmit={submit}><label>Учётная запись<select value={id} onChange={e => setId(e.target.value)}>{accounts.map(account => <option key={account.universityId} value={account.universityId}>{account.fullName} — {ROLE_LABELS[account.role]}</option>)}</select></label><ErrorNotice message={error} /><button disabled={busy || !id}>{busy ? 'Вход…' : 'Войти через СПбПУ (демо)'}</button></form></section>;
}
