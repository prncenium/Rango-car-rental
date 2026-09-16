import { Routes, Route } from 'react-router-dom';

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page">
      <div className="text-center">
        <h1 className="font-display text-display-md text-brand-primary">Rango Car Rental</h1>
        <p className="mt-2 text-body-md text-neutral-600">
          Client scaffold ready — routes, components, and screens land in later tasks.
        </p>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
