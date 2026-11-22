import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { ensureSeeded, resetDemoData } from '../storage/seed';
import { createBooking, listOwnBookings } from '../modules/booking';
import { getAuditoriumByNumber } from '../modules/auditoriums';
import { getAllBookings, getRoomBlocks } from '../modules/administration';
import { ACCOUNTS, dateFromToday, loginAsAdmin, loginAsStudent1, loginAsStudent2, loginAsTeacher, unwrap } from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
  // jsdom has no native dialog focus/top-layer implementation.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
const open = (path = '/search') => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
async function searchRoom(number: string, time = '09:00') {
  await screen.findByRole('heading', { name: 'Поиск аудиторий' });
  fireEvent.change(screen.getByLabelText('Время начала'), { target: { value: time } });
  fireEvent.change(screen.getByLabelText('Номер аудитории'), { target: { value: number } });
  await userEvent.click(screen.getByRole('button', { name: 'Найти аудитории' }));
}
async function confirmBooking() {
  await userEvent.click(await screen.findByRole('button', { name: 'Забронировать' }));
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
}

describe('PART 2: маршруты и авторизация', () => {
  it.each(['/search', '/my-bookings', '/admin'])('закрывает %s для гостя', async path => {
    open(path);
    expect(await screen.findByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  });
  it.each([loginAsStudent1, loginAsTeacher])('закрывает администрирование для обычной роли', async login => {
    await login(); open('/admin');
    expect(await screen.findByRole('heading', { name: 'Доступ запрещён' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Администрирование' })).not.toBeInTheDocument();
  });
  it('показывает ошибку SSO, затем позволяет войти и выйти', async () => {
    open('/login');
    await screen.findByRole('option', { name: /Иванов/ });
    await userEvent.click(screen.getByLabelText('Симулировать ошибку аутентификации'));
    await userEvent.click(screen.getByRole('button', { name: 'Войти через СПбПУ (демо)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить вход через СПбПУ');
    await userEvent.click(screen.getByLabelText('Симулировать ошибку аутентификации'));
    await userEvent.click(screen.getByRole('button', { name: 'Войти через СПбПУ (демо)' }));
    await screen.findByRole('heading', { name: 'Поиск аудиторий' });
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  });
});

describe('PART 2: поиск и бронирование через реальные сервисы', () => {
  it('сохраняет интервал поиска, бронирует, восстанавливает данные после монтирования и отменяет', async () => {
    await loginAsStudent1(); const app = open();
    await searchRoom('3-210');
    await screen.findByRole('button', { name: 'Забронировать' });
    fireEvent.change(screen.getByLabelText('Время начала'), { target: { value: '18:00' } });
    await confirmBooking();
    expect(await screen.findByText(/Бронирование успешно создано/)).toBeVisible();
    expect(unwrap(await listOwnBookings()).active.find(item => item.auditoriumId === 'room-3-210')?.startTime).toBe('09:00');
    expect(screen.queryByRole('button', { name: 'Забронировать' })).not.toBeInTheDocument();
    app.unmount(); expect(ensureSeeded()).toBe(false); open('/my-bookings');
    const heading = await screen.findByRole('heading', { name: 'Аудитория 3-210' });
    await userEvent.click(within(heading.closest('article')!).getByRole('button', { name: 'Отменить бронь' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отмену' }));
    await screen.findByText('Бронирование отменено.');
    await userEvent.click(screen.getByRole('link', { name: 'Поиск аудиторий' }));
    await searchRoom('3-210');
    expect(await screen.findByRole('button', { name: 'Забронировать' })).toBeVisible();
  });
  it('выводит ошибки валидации из доменного слоя', async () => {
    await loginAsStudent1(); open();
    await searchRoom('3-210', '20:30');
    expect(await screen.findByRole('alert')).toHaveTextContent('Время выходит за рабочие часы');
    fireEvent.change(screen.getByLabelText('Время начала'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: dateFromToday(-1) } });
    await userEvent.click(screen.getByRole('button', { name: 'Найти аудитории' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нельзя забронировать на прошедшее время');
  });
  it('показывает свежий конфликт в окне подтверждения', async () => {
    await loginAsStudent1(); open(); await searchRoom('3-210');
    await userEvent.click(await screen.findByRole('button', { name: 'Забронировать' }));
    await loginAsStudent2();
    unwrap(await createBooking({ auditoriumId: 'room-3-210', date: dateFromToday(1), startTime: '09:00', duration: 90 }));
    await loginAsStudent1();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Аудитория уже забронирована');
  });
  it('предупреждает преподавателя и показывает студенту причину вытеснения', async () => {
    await loginAsTeacher(); const app = open(); await searchRoom('3-312', '10:00');
    expect(await screen.findByText('Занято студентом (приоритет преподавателя)')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Забронировать' }));
    expect(within(screen.getByRole('dialog')).getByText(/студенческие бронирования будут отменены/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
    expect(await screen.findByText(/Отменено студенческих бронирований: 1/)).toBeVisible();
    app.unmount(); await loginAsStudent1(); open('/my-bookings');
    await screen.findByText(/Отменённые \/ История/);
    await userEvent.click(screen.getByText(/Отменённые \/ История/));
    expect(await screen.findByText('Отменено в пользу преподавателя')).toBeVisible();
  });
});

describe('PART 2: администрирование', () => {
  it('создаёт и редактирует аудиторию с сохранением после перезапуска', async () => {
    await loginAsAdmin(); const app = open('/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить аудиторию' }));
    await userEvent.type(screen.getByLabelText('Номер'), '3-999');
    await userEvent.type(screen.getByLabelText('Вместимость'), '24');
    await userEvent.type(screen.getByLabelText('Оборудование через запятую'), 'Проектор, Доска');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const room = (await screen.findByRole('heading', { name: 'Аудитория 3-999' })).closest('article')!;
    await userEvent.click(within(room).getByRole('button', { name: 'Редактировать' }));
    await userEvent.clear(screen.getByLabelText('Вместимость'));
    await userEvent.type(screen.getByLabelText('Вместимость'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(unwrap(await getAuditoriumByNumber('3-999')).capacity).toBe(40);
    app.unmount(); ensureSeeded(); open('/admin');
    const restored = (await screen.findByRole('heading', { name: 'Аудитория 3-999' })).closest('article')!;
    await userEvent.click(within(restored).getByRole('button', { name: 'Деактивировать' }));
    await waitFor(() => expect(within(restored).getByText('Неактивна')).toBeVisible());
    expect(unwrap(await getAuditoriumByNumber('3-999')).isActive).toBe(false);
  });
  it('добавляет и снимает блокировку, отменяет чужую бронь', async () => {
    await loginAsAdmin(); open('/admin');
    await screen.findByRole('heading', { name: 'Аудитория 3-210' });
    await userEvent.click(screen.getByRole('tab', { name: 'Блокировки' }));
    await userEvent.selectOptions(screen.getByLabelText('Аудитория'), 'room-3-210');
    await userEvent.type(screen.getByLabelText('Причина'), 'Проверка оборудования');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить блокировку' }));
    const block = (await screen.findByText('Проверка оборудования')).closest('article')!;
    expect(unwrap(await getRoomBlocks()).some(item => item.reason === 'Проверка оборудования')).toBe(true);
    await userEvent.click(within(block).getByRole('button', { name: 'Снять блокировку' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(screen.queryByText('Проверка оборудования')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'Все бронирования' }));
    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'active');
    await userEvent.selectOptions(screen.getByLabelText('Аудитория'), 'room-3-312');
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await screen.findByText('Бронирования не найдены.');
    expect(unwrap(await getAllBookings()).find(item => item.id === 'booking-seed-1')).toMatchObject({ status: 'cancelled', cancelledBy: ACCOUNTS.admin1 });
  });
  it('сбрасывает демо только после подтверждения и завершает сессию', async () => {
    await loginAsAdmin(); open('/admin');
    await screen.findByRole('heading', { name: 'Администрирование' });
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить демо-данные' }));
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.getByRole('heading', { name: 'Администрирование' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить демо-данные' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить сброс' }));
    expect(await screen.findByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  });
});
