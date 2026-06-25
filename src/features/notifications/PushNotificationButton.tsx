import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pushService, isPushSupported, isPushConfigured } from '../../services/pushService';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';

// Botón de cabecera para que cada miembro del equipo active o desactive las
// notificaciones push (recordatorios de cita 30 min antes) en este navegador.
// La suscripción es por dispositivo/navegador: cada uno se activa por separado.
export function PushNotificationButton({ userId }: { userId: string }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const available = isPushSupported() && isPushConfigured;

  const { data: enabled = false } = useQuery({
    queryKey: ['push', 'enabled', userId],
    queryFn: () => pushService.isEnabled(),
    enabled: available
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (enabled) await pushService.disable();
      else await pushService.enable(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push', 'enabled', userId] });
      notify({
        tone: 'success',
        message: enabled
          ? 'Notificaciones desactivadas en este dispositivo.'
          : 'Notificaciones activadas. Recibirás recordatorios de tus citas.'
      });
    },
    onError: (err) => {
      notify({
        tone: 'error',
        message: getErrorMessage(err, 'No se pudo cambiar la configuración.')
      });
    }
  });

  // Si el navegador no soporta push (p. ej. iOS sin instalar la PWA) o falta la
  // clave VAPID, no mostramos el botón para no ofrecer algo que no funcionará.
  if (!available) return null;

  const label = toggle.isPending
    ? 'Guardando...'
    : enabled
      ? 'Notificaciones activas'
      : 'Activar notificaciones';

  return (
    <button
      type="button"
      className="secondary"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{enabled ? '🔔' : '🔕'}</span>
      <span className="btn-label">{label}</span>
    </button>
  );
}
