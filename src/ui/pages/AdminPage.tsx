import { useEffect, useState, type FormEvent } from 'react';
import * as admin from '../../modules/administration';
import { CANCEL_REASON_LABELS, ROLE_LABELS, type Auditorium, type Booking, type RoomBlock, type ServiceResult } from '../../shared/types';
import { CONFIG } from '../../config/constants';
import { addDaysISO, todayISO } from '../../shared/utils';
import { ErrorNotice, formatDate, Modal } from '../components/Common';

type Tab = 'rooms' | 'bookings' | 'blocks';
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('rooms');
  const [rooms, setRooms] = useState<Auditorium[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [filter, setFilter] = useState<admin.BookingFilter>({});
  const [editor, setEditor] = useState<{ id?: string; number: string; capacity: string; equipment: string } | null>(null);
  const [block, setBlock] = useState({ auditoriumId: '', date: addDaysISO(todayISO(), 1), startTime: CONFIG.WORKING_HOURS_START as string, endTime: '09:00', reason: '' });
  const [confirmation, setConfirmation] = useState<{ title: string; action: () => Promise<ServiceResult<unknown>> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try { const [catalog, all, locked] = await Promise.all([admin.getAuditoriums(), admin.getAllBookings(), admin.getRoomBlocks()]);
      if (catalog.ok) setRooms(catalog.data); else setError(catalog.error.message);
      if (all.ok) setBookings(all.data); else setError(all.error.message);
      if (locked.ok) setBlocks(locked.data); else setError(locked.error.message);
    } catch { setError('Не удалось загрузить данные.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function mutate(action: () => Promise<ServiceResult<unknown>>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await action(); if (!result.ok) { setError(result.error.message); return; }
      setEditor(null); setConfirmation(null); setNotice('Изменения сохранены.'); await load();
    } catch { setError('Не удалось сохранить изменения. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  function saveRoom(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    const input = { number: editor.number, capacity: Number(editor.capacity), equipment: editor.equipment.split(',').map(item => item.trim()).filter(Boolean) };
    void mutate(() => editor.id ? admin.updateAuditorium(editor.id, input) : admin.createAuditorium(input));
  }
  const roomName = (id: string) => rooms.find(room => room.id === id)?.number ?? 'Удалена';
  const visibleBookings = bookings.filter(booking => (!filter.status || booking.status === filter.status) && (!filter.auditoriumId || booking.auditoriumId === filter.auditoriumId) && (!filter.date || booking.date === filter.date));
  return <><h1>Администрирование</h1><p>Аудиторный фонд, бронирования и временные ограничения.</p><div className="tabs" role="tablist" aria-label="Разделы администрирования">{([['rooms', 'Аудитории'], ['bookings', 'Все бронирования'], ['blocks', 'Блокировки']] as const).map(([value, label]) => <button role="tab" aria-selected={tab === value} aria-controls="admin-panel" id={`tab-${value}`} key={value} className={tab === value ? '' : 'secondary'} onClick={() => { setTab(value); setError(''); setNotice(''); }}>{label}</button>)}</div>
    {!editor && !confirmation && <ErrorNotice message={error} />}{notice && <p role="status" className="notice success">{notice}</p>}{loading && <p role="status">Загрузка…</p>}
    <section id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
    {tab === 'rooms' && <><div className="section-heading"><h2>Аудитории</h2><button disabled={busy} onClick={() => { setError(''); setEditor({ number: '', capacity: '', equipment: '' }); }}>Добавить аудиторию</button></div><div className="room-grid">{rooms.map(room => <article className="panel" key={room.id}><span className="badge">{room.isActive ? 'Активна' : 'Неактивна'}</span><h3>Аудитория {room.number}</h3><p>{room.capacity} мест · {room.equipment.join(', ') || 'Без оборудования'}</p><div className="actions"><button className="secondary" disabled={busy} onClick={() => { setError(''); setEditor({ id: room.id, number: room.number, capacity: String(room.capacity), equipment: room.equipment.join(', ') }); }}>Редактировать</button><button className="secondary" disabled={busy} onClick={() => void mutate(() => admin.setAuditoriumActive(room.id, !room.isActive))}>{room.isActive ? 'Деактивировать' : 'Активировать'}</button><button className="danger" disabled={busy} onClick={() => setConfirmation({ title: `Удалить аудиторию ${room.number}?`, action: () => admin.deleteAuditorium(room.id) })}>Удалить</button></div></article>)}</div>{!loading && !rooms.length && <p>Аудитории пока не добавлены.</p>}</>}
    {tab === 'bookings' && <><h2>Все бронирования</h2><div className="filters panel"><label>Статус<select value={filter.status ?? ''} onChange={e => setFilter({ ...filter, status: (e.target.value || undefined) as Booking['status'] | undefined })}><option value="">Все статусы</option><option value="active">Активные</option><option value="cancelled">Отменённые</option></select></label><label>Аудитория<select value={filter.auditoriumId ?? ''} onChange={e => setFilter({ ...filter, auditoriumId: e.target.value })}><option value="">Все аудитории</option>{rooms.map(room => <option value={room.id} key={room.id}>{room.number}</option>)}</select></label><label>Дата<input type="date" value={filter.date ?? ''} onChange={e => setFilter({ ...filter, date: e.target.value })} /></label><button className="secondary" onClick={() => setFilter({})}>Сбросить фильтры</button></div><div className="table-scroll"><table><caption>Бронирования пользователей</caption><thead><tr><th>Пользователь</th><th>Аудитория</th><th>Дата и время</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{visibleBookings.map(booking => <tr key={booking.id}><td>{booking.userFullName}<small>{ROLE_LABELS[booking.userRole]}</small></td><td>{roomName(booking.auditoriumId)}</td><td>{formatDate(booking.date)}<small>{booking.startTime}–{booking.endTime}</small></td><td>{booking.status === 'active' ? 'Активно' : booking.cancelReason ? CANCEL_REASON_LABELS[booking.cancelReason] : 'Отменено'}</td><td>{booking.status === 'active' && <button className="secondary" disabled={busy} onClick={() => setConfirmation({ title: 'Отменить бронирование пользователя?', action: () => admin.cancelAnyBooking(booking.id) })}>Отменить</button>}</td></tr>)}</tbody></table></div>{!loading && !visibleBookings.length && <p>Бронирования не найдены.</p>}</>}
    {tab === 'blocks' && <><h2>Блокировки аудиторий</h2><form className="panel filters" onSubmit={event => { event.preventDefault(); void mutate(() => admin.createRoomBlock(block)); }}><label>Аудитория<select required value={block.auditoriumId} onChange={e => setBlock({ ...block, auditoriumId: e.target.value })}><option value="">Выберите аудиторию</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.number}</option>)}</select></label><label>Дата<input required type="date" value={block.date} onChange={e => setBlock({ ...block, date: e.target.value })} /></label><label>Начало<input required type="time" value={block.startTime} onChange={e => setBlock({ ...block, startTime: e.target.value })} /></label><label>Окончание<input required type="time" value={block.endTime} onChange={e => setBlock({ ...block, endTime: e.target.value })} /></label><label>Причина<input required value={block.reason} onChange={e => setBlock({ ...block, reason: e.target.value })} /></label><button disabled={busy}>Добавить блокировку</button></form><div className="room-grid">{blocks.map(item => <article className="panel" key={item.id}><h3>Аудитория {roomName(item.auditoriumId)}</h3><p>{formatDate(item.date)} · {item.startTime}–{item.endTime}</p><p>{item.reason}</p><button className="secondary" disabled={busy} onClick={() => setConfirmation({ title: 'Снять блокировку аудитории?', action: () => admin.deleteRoomBlock(item.id) })}>Снять блокировку</button></article>)}</div>{!loading && !blocks.length && <p>Блокировок нет.</p>}</>}
    </section>
    {editor && <Modal title={editor.id ? 'Редактировать аудиторию' : 'Добавить аудиторию'} busy={busy} onClose={() => { setEditor(null); setError(''); }}><form onSubmit={saveRoom}><label>Номер<input required value={editor.number} onChange={e => setEditor({ ...editor, number: e.target.value })} /></label><label>Вместимость<input required type="number" min="1" step="1" value={editor.capacity} onChange={e => setEditor({ ...editor, capacity: e.target.value })} /></label><label>Оборудование через запятую<input value={editor.equipment} onChange={e => setEditor({ ...editor, equipment: e.target.value })} /></label><ErrorNotice message={error} /><button disabled={busy}>Сохранить</button></form></Modal>}
    {confirmation && <Modal title={confirmation.title} busy={busy} onClose={() => { setConfirmation(null); setError(''); }}><p>Подтвердите действие.</p><ErrorNotice message={error} /><button disabled={busy} onClick={() => void mutate(confirmation.action)}>Подтвердить</button></Modal>}
  </>;
}
