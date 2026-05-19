import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider.jsx';
import { calendarService } from '../../services/calendarService.js';
import { AppointmentsList } from './AppointmentsList.jsx';

vi.mock('../../services/calendarService.js', () => ({
  isGoogleCalendarConfigured: true,
  calendarService: {
    startGoogleConnection: vi.fn(),
    syncAppointment: vi.fn()
  }
}));

const renderWithToast = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

describe('AppointmentsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies the parent after a successful Google Calendar sync', async () => {
    calendarService.syncAppointment.mockResolvedValueOnce({
      id: 'appointment-1',
      sync_status: 'synced'
    });
    const onSynced = vi.fn();

    renderWithToast(
      <AppointmentsList
        onSynced={onSynced}
        appointments={[
          {
            id: 'appointment-1',
            title: 'Sesion FISIOSELF',
            starts_at: '2026-05-19T16:00:00.000Z',
            ends_at: '2026-05-19T17:00:00.000Z',
            status: 'scheduled',
            sync_status: 'pending'
          }
        ]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /sincronizar google/i }));

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'appointment-1', sync_status: 'synced' })
      );
    });
  });
});
