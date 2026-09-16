import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';
import { ResetPasswordPage } from './pages/auth/ResetPassword';
import { HomePage } from './pages/public/Home';
import { SearchPage } from './pages/public/Search';
import { CarDetailPage } from './pages/public/CarDetail';
import { BookingRequestPage } from './pages/public/BookingRequest';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/cars" element={<SearchPage />} />
      <Route path="/cars/:carId" element={<CarDetailPage />} />
      <Route path="/cars/:carId/request" element={<BookingRequestPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  );
}
