import { useState, type FormEvent } from 'react';
import { searchAvailable, type AuditoriumSearchResult } from '../../modules/auditoriums';
import { createBooking } from '../../modules/booking';
import { CONFIG } from '../../config/constants';
import type { BookingDuration, SearchAuditoriumsInput } from '../../shared/types';
import { addDaysISO, computeEndTime, todayISO } from '../../shared/utils';
import { useAuth } from '../context/AuthContext';
import { ErrorNotice, formatDate, Modal } from '../components/Common';
export default function SearchPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<SearchAuditoriumsInput>({ date: addDaysISO(todayISO(), 1), startTime: CONFIG.WORKING_HOURS_START, duration: CONFIG.ALLOWED_DURATIONS[0], roomNumber: '' });
  const [query, setQuery] = useState<SearchAuditoriumsInput | null>(null);
  const [results, setResults] = useState<AuditoriumSearchResult[]>([]);
  const [selected, setSelected] = useState<AuditoriumSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  async function search(input: SearchAuditoriumsInput) {
    const result = await searchAvailable(input, { requesterRole: user?.role });
    if (result.ok) { setResults(result.data); setQuery({ ...input }); }
    else { setError(result.error.message); setResults([]); setQuery(null); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await search(form); } catch { setError('Не удалось выполнить поиск. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  async function book() {
    if (!selected || !query || busy) return;
    setBusy(true); setModalError('');
    try {
      const result = await createBooking({ auditoriumId: selected.auditorium.id, date: query.date, startTime: query.startTime, duration: query.duration });
      if (!result.ok) { setModalError(result.error.message); return; }
      setNotice(['Бронирование успешно создано.', ...(result.warnings ?? []), ...(result.data.preemptedBookings.length ? [`Отменено студенческих бронирований: ${result.data.preemptedBookings.length}.`] : [])].join(' '));
      setSelected(null); await search(query);
    } catch { setModalError('Не удалось создать бронирование. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  return <><p className="eyebrow">{CONFIG.BUILDING_NAME}</p><h1>Поиск аудиторий</h1><p>Выберите время — найдём место для занятия, встречи или мероприятия.</p><form className="panel filters" onSubmit={submit}><label>Дата<input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label><label>Время начала<input required type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></label><label>Продолжительность<select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) as BookingDuration })}>{CONFIG.ALLOWED_DURATIONS.map(duration => <option key={duration} value={duration}>{duration} мин</option>)}</select></label><label>Номер аудитории<input placeholder="Например, 3-201" value={form.roomNumber} onChange={e => setForm({ ...form, roomNumber: e.target.value })} /></label><button disabled={busy}>Найти аудитории</button></form><p className="muted">Корпус открыт {CONFIG.WORKING_HOURS_START}–{CONFIG.WORKING_HOURS_END}. Бронирование на {CONFIG.MAX_ADVANCE_BOOKING_DAYS} дней вперёд.</p><ErrorNotice message={error} />{notice && <p className="notice success" role="status">{notice}</p>}
    {busy && <p role="status">Загрузка…</p>}
    {query ? <><h2>Результаты поиска</h2><p>{formatDate(query.date)} · {query.startTime}–{computeEndTime(query.startTime, query.duration)}</p>{!results.length && <p className="panel">На выбранное время свободных аудиторий не найдено. Попробуйте изменить параметры поиска.</p>}<div className="room-grid">{results.map(result => <article className="panel room-card" key={result.auditorium.id}><span className={`badge ${result.isFree ? 'free' : 'warning'}`}>{result.isFree ? 'Свободна' : 'Занято студентом (приоритет преподавателя)'}</span><h3>Аудитория {result.auditorium.number}</h3><p>{result.auditorium.capacity} мест</p><p className="equipment">{result.auditorium.equipment.join(' · ') || 'Без дополнительного оборудования'}</p><button disabled={busy} onClick={() => { setSelected(result); setModalError(''); }}>Забронировать</button></article>)}</div></> : !error && <p className="empty">Укажите параметры и нажмите «Найти аудитории».</p>}
    {selected && query && <Modal title="Подтверждение бронирования" busy={busy} onClose={() => setSelected(null)}><h3>Аудитория {selected.auditorium.number}</h3><p>{formatDate(query.date)} · {query.startTime}–{computeEndTime(query.startTime, query.duration)}</p>{selected.teacherPreemptable && <p className="notice warning">При подтверждении конфликтующие студенческие бронирования будут отменены в пользу преподавателя.</p>}<ErrorNotice message={modalError} /><button disabled={busy} onClick={() => void book()}>Подтвердить бронирование</button></Modal>}
  </>;
}
