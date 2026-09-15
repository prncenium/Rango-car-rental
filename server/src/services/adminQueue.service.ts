import { Car } from '../models/Car.model.js';
import { Booking } from '../models/Booking.model.js';

// ADM-02 (subset) — the counts the admin dashboard needs, each answerable in
// one query against the denormalised fields this codebase already maintains.
export async function getDashboardCounts() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [
    listingsPending,
    bookingsRequested,
    bookingsAwaitingPayment,
    bookingsAwaitingHandover,
    returnsOverdue,
    cancellationRequestsOpen,
  ] = await Promise.all([
    Car.countDocuments({ moderationStatus: 'PENDING_APPROVAL' }),
    Booking.countDocuments({ status: 'REQUESTED' }),
    // "confirmed but unpaid" — spec 04's named awkward-to-answer query,
    // made a single query by the amountReceived/totalAmount denormalisation.
    Booking.countDocuments({ status: 'CONFIRMED', $expr: { $lt: ['$amountReceived', '$totalAmount'] } }),
    Booking.countDocuments({ status: 'CONFIRMED', startDate: { $lte: today } }),
    Booking.countDocuments({ status: 'ACTIVE', endDate: { $lt: today } }),
    Booking.countDocuments({ status: 'CANCELLATION_REQUESTED' }),
  ]);

  return {
    queues: {
      listingsPending,
      bookingsRequested,
      bookingsAwaitingPayment,
      bookingsAwaitingHandover,
    },
    operations: {
      returnsOverdue,
    },
    cancellationRequestsOpen,
  };
}
