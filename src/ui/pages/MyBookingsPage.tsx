import { useEffect, useState } from 'react';
import { cancelOwnBooking, listOwnBookings, type OwnBookings } from '../../modules/booking';
import { getCatalog } from '../../modules/auditoriums';
import { CANCEL_REASON_LABELS, type Auditorium, type Booking } from '../../shared/types';
import { ErrorNotice, formatDate, Modal } from '../components/Common';
export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<OwnBookings>({ active: [], cancelled: [] });
  const [rooms, setRooms] = useState<Auditorium[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try { const [own, catalog] = await Promise.all([listOwnBookings(), getCatalog({ includeInactive: true })]);
      if (own.ok) setBookings(own.data); else setError(own.error.message);
      if (catalog.ok) setRooms(catalog.data); else setError(catalog.error.message);
    } catch { setError('Не удалось загрузить бронирования.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function cancel() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { const result = await cancelOwnBooking(selected.id); if (result.ok) { setSelected(null); setNotice('Бронирование отменено.'); await load(); } else setError(result.error.message); }
    catch { setError('Не удалось отменить бронирование.'); }
    finally { setBusy(false); }
  }
  function card(booking: Booking) {
    const room = rooms.find(item => item.id === booking.auditoriumId);
    return <article className="panel" key={booking.id}><h3>Аудитория {room?.number ?? 'удалена'}</h3><p>{formatDate(booking.date)} · {booking.startTime}–{booking.endTime}</p><p className="muted">{room?.equipment.join(' · ')}</p>{booking.status === 'active' ? <button className="secondary" onClick={() => setSelected(booking)}>Отменить бронь</button> : <p className="badge">{booking.cancelReason ? CANCEL_REASON_LABELS[booking.cancelReason] : 'Отменено'}</p>}</article>;
  }
  return <><h1>Мои бронирования</h1><p>Ваши предстоящие встречи и история отмен.</p>{!selected && <ErrorNotice message={error} />}{notice && <p role="status" className="notice success">{notice}</p>}{loading ? <p role="status">Загрузка…</p> : <><h2>Активные бронирования</h2>{bookings.active.length ? <div className="room-grid">{bookings.active.map(card)}</div> : <p className="panel">У вас пока нет активных бронирований.</p>}<details><summary>Отменённые / История ({bookings.cancelled.length})</summary><div className="room-grid">{bookings.cancelled.map(card)}</div>{!bookings.cancelled.length && <p>Нет отменённых бронирований.</p>}</details></>}{selected && <Modal title="Отменить бронирование?" busy={busy} onClose={() => { setSelected(null); setError(''); }}><p>{formatDate(selected.date)} · {selected.startTime}–{selected.endTime}</p><ErrorNotice message={error} /><button disabled={busy} onClick={() => void cancel()}>Подтвердить отмену</button></Modal>}</>;
}
