import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { ClinicDashboard } from './ClinicDashboard';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: { getClinicStats: vi.fn() }
}));

vi.mock('../../services/calendarService', () => ({
  calendarService: { getConnectionStatus: vi.fn() }
}));

// FullCalendar necesita APIs de DOM que jsdom no implementa; lo sustituimos por
// un div vacío para que los tests que NO validan el calendario no revienten.
vi.mock('../calendar/NativeCalendar', () => ({
  NativeCalendar: () => <div data-testid="native-calendar" />
}));

const STATS = {
  totalPatients: 42,
  monthSessions: 18,
  monthValoraciones: 5,
  upcomingAppointments: 7,
  latestActivity: []
};

beforeEach(() => {
  vi.mocked(clinicalApi.getClinicStats).mockResolvedValue(STATS);
  vi.mocked(calendarService.getConnectionStatus).mockResolvedValue({
    connected: false,
    email: null
  });
});

describe('ClinicDashboard', () => {
  it('renders clinic stats when data loads', async () => {
    renderWithProviders(<ClinicDashboard />);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    vi.mocked(clinicalApi.getClinicStats).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<ClinicDashboard />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('shows error state when getClinicStats rejects', async () => {
    vi.mocked(clinicalApi.getClinicStats).mockRejectedValue(new Error('BD offline'));
    renderWithProviders(<ClinicDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar datos/)).toBeInTheDocument();
    });
  });

  it('shows "not connected" message when Google Calendar is disconnected', async () => {
    renderWithProviders(<ClinicDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Google Calendar no está conectado/)).toBeInTheDocument();
    });
  });

  it('renders the NativeCalendar when Google Calendar is connected', async () => {
    vi.mocked(calendarService.getConnectionStatus).mockResolvedValue({
      connected: true,
      email: 'fisio@example.com'
    });
    renderWithProviders(<ClinicDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('native-calendar')).toBeInTheDocument();
    });
  });
});
