import { BrowserRouter, Route, Routes } from 'react-router-dom';

/**
 * PART 1: только каркас. Реальные страницы (LoginPage, SearchPage,
 * MyBookingsPage, AdminPage) и маршруты появляются в PART 2.
 */
function Placeholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">PolyRoomBooking</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Каркас приложения, моковая БД и доменные модули готовы. Интерфейс будет
          реализован на этапе PART 2.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </BrowserRouter>
  );
}
