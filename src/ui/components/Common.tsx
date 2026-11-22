import { useEffect, useRef, type ReactNode } from 'react';
import { parseLocalDate } from '../../shared/utils';
export function ErrorNotice({ message }: { message: string }) {
  return message ? <p role="alert" className="notice error">{message}</p> : null;
}
export function formatDate(date: string) {
  return parseLocalDate(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="modal-title">{title}</h2>{children}
    <button className="secondary" disabled={busy} onClick={onClose}>Закрыть</button>
  </dialog>;
}
