import { Navigate, Routes, Route } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';
import { ResetPasswordPage } from './pages/auth/ResetPassword';
import { HomePage } from './pages/public/Home';
import { ContactPage } from './pages/public/About';
import { SearchPage } from './pages/public/Search';
import { CarDetailPage } from './pages/public/CarDetail';
import { BookingRequestPage } from './pages/public/BookingRequest';
import { RenterDashboardPage } from './pages/user/RenterDashboard';
import { OwnerDashboardPage } from './pages/user/OwnerDashboard';
import { CreateListingPage, EditListingPage } from './pages/user/ListingForm';
import { ProfilePage } from './pages/user/Profile';
import { AdminDashboardPage } from './pages/admin/Dashboard';
import { AdminListingModerationPage } from './pages/admin/ListingModeration';
import { AdminListingDetailPage } from './pages/admin/ListingDetail';
import { AdminBookingQueuePage } from './pages/admin/BookingManagement';
import { AdminBookingDetailPage } from './pages/admin/BookingDetail';
import { AdminCalendarPage } from './pages/admin/Calendar';
import { AdminAuditLogPage } from './pages/admin/AuditLog';
import { AdminUsersPage } from './pages/admin/Users';
import { AdminUserDetailPage } from './pages/admin/UserDetail';

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/cars" element={<SearchPage />} />
      <Route path="/about" element={<Navigate to="/about/contact" replace />} />
      <Route path="/about/contact" element={<ContactPage />} />
      <Route path="/cars/:carId" element={<CarDetailPage />} />
      <Route path="/cars/:carId/request" element={<BookingRequestPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* spec 05 §1 OPEN QUESTION — this document assumes a redirect to
          /account/bookings as the default landing tab. */}
      <Route path="/account" element={<Navigate to="/account/bookings" replace />} />
      <Route path="/account/bookings" element={<RenterDashboardPage />} />
      <Route path="/account/listings" element={<OwnerDashboardPage />} />
      <Route path="/account/listings/new" element={<CreateListingPage />} />
      <Route path="/account/listings/:carId/edit" element={<EditListingPage />} />
      <Route path="/account/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/admin/listings" element={<AdminListingModerationPage />} />
      <Route path="/admin/listings/:carId" element={<AdminListingDetailPage />} />
      <Route path="/admin/bookings" element={<AdminBookingQueuePage />} />
      <Route path="/admin/bookings/:bookingId" element={<AdminBookingDetailPage />} />
      <Route path="/admin/calendar" element={<AdminCalendarPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
      <Route path="/admin/audit" element={<AdminAuditLogPage />} />
      </Routes>
    </>
  );
}
