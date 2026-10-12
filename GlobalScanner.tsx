import { useNavigate } from 'react-router-dom';
import { api, errorMessage, refreshAll } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { closeScanner, openCheckins, readScan, useScannerOpen } from '@/lib/scan';
import { useSession } from '@/lib/session';
import { toast } from '@/ui/overlay';
import { Scanner } from '@/ui/Scanner';

/* The scanner behind the QR button in the top bar. Students check in to events with it; the
   cashier desk reads vouchers with it. */
export function GlobalScanner() {
  const open = useScannerOpen();
  const { t } = useI18n();
  const { can } = useSession();
  const navigate = useNavigate();
  const student = can('campusLife');
  const cashier = can('cashier');

  /** A bare check-in code names no event: try it at the doors that are open. */
  const byCode = async (code: string) => {
    try {
      const doors = await openCheckins();
      if (!doors.length) return void toast.info(t('scan.noOpenEvent'));
      // With one door open the event page does the rest, and books the seat if needed.
      if (doors.length === 1) return navigate(`/campus/events/${doors[0]}?checkin=${code}`);
      for (const id of doors) {
        const ok = await api(`/campus/events/${id}/checkin`, { method: 'POST', body: { code } }).then(
          () => true,
          () => false,
        );
        if (!ok) continue;
        refreshAll();
        toast.ok(t('campus.checkin.doneToast'));
        return navigate(`/campus/events/${id}`);
      }
      toast.error(t('scan.noMatch'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onRead = (text: string) => {
    closeScanner();
    const scan = readScan(text);
    if (scan.kind === 'checkin') return student ? navigate(`/campus/events/${encodeURIComponent(scan.eventId)}?checkin=${scan.code}`) : void toast.info(t('scan.checkinStudents'));
    if (scan.kind === 'voucher') return cashier ? navigate(`/cashier?code=${scan.code}`) : void toast.info(t('scan.voucherStudent'));
    if (scan.kind === 'page') return navigate(scan.path);
    if (scan.kind === 'code' && student) return void byCode(scan.code);
    toast.error(t('scan.unknown'));
  };

  return <Scanner open={open} onClose={closeScanner} onRead={onRead} title={t('scan.title')} hint={t(student ? 'scan.hint' : 'scan.hintStaff')} />;
}
