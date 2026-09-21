import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingDetail } from '../src/pages/admin/BookingDetail';
import * as adminApi from '../src/api/admin';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FULL_DETAIL = {
  _id: 'b1',
  car: { make: 'Honda', model: 'City', registrationNumber: 'GJ58NG1408' },
  renter: { name: 'Rohit', email: 'rohit@example.com', phone: '+911234567890', drivingLicence: { number: 'DL123' } },
  owner: { name: 'Asha', email: 'asha@example.com', phone: '+911234567891' },
  status: 'REQUESTED',
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  days: 3,
  ratePerDaySnapshot: 1000,
  totalAmount: 3000,
  amountReceived: 0,
  depositSnapshot: 0,
  depositReceived: 0,
  createdAt: new Date().toISOString(),
  payments: [],
  dayLocks: { count: 0, from: null, to: null },
} as unknown as adminApi.AdminBookingDetail;

// Reproduces the real server response shape: the confirm endpoint returns
// the raw Booking document — no `payments`, no `dayLocks`, no populated
// car/renter/owner — not the full AdminBookingDetail the TS signature claims.
const RAW_MUTATION_RESPONSE = {
  _id: 'b1',
  status: 'CONFIRMED',
  car: 'car-object-id',
  renter: 'renter-object-id',
  owner: 'owner-object-id',
} as unknown as adminApi.AdminBookingDetail;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/bookings/b1']}>
        <Routes>
          <Route path="/admin/bookings/:bookingId" element={<BookingDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BookingDetail — regression: confirm no longer crashes on payments.length', () => {
  it('survives a confirm whose response omits payments/dayLocks, by refetching instead of trusting it', async () => {
    const getSpy = vi.spyOn(adminApi, 'adminGetBooking').mockResolvedValue(FULL_DETAIL);
    const confirmSpy = vi.spyOn(adminApi, 'confirmBooking').mockResolvedValue(RAW_MUTATION_RESPONSE);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByLabelText(/Note/);
    await user.type(textarea, 'confirmed by phone');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm booking' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    // The crash this regression guards against threw synchronously during
    // render, which would surface here as an uncaught error / failed assertion
    // rather than this resolving cleanly.
    await waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText(/Booking #/)).toBeInTheDocument();
  });
});
