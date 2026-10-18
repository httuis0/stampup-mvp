// ============================================================
// Built-In Background WhatsApp Web Bridge Controller
// Allows 100% automatic background WhatsApp sending from the
// vendor's own WhatsApp account without opening the WhatsApp app
// or requiring paid third-party webhook gateways.
// ============================================================

export interface WhatsAppBridgeJob {
  id: string;
  phone: string;
  text: string;
  outboxId?: string;
}

export type WhatsAppBridgeStatus =
  | 'initializing'
  | 'needs_link'
  | 'connected'
  | 'sending';

type JobListener = (job: WhatsAppBridgeJob) => void;
type ModalListener = (visible: boolean) => void;
type StatusListener = (status: WhatsAppBridgeStatus) => void;

let _jobListener: JobListener | null = null;
let _modalListener: ModalListener | null = null;
let _statusListeners: Set<StatusListener> = new Set();
let _currentStatus: WhatsAppBridgeStatus = 'initializing';
let _pendingQueue: WhatsAppBridgeJob[] = [];

export function registerWhatsAppBridgeHandler(
  onJob: JobListener,
  onModalToggle: ModalListener
) {
  _jobListener = onJob;
  _modalListener = onModalToggle;

  // Flush any jobs queued while initializing
  if (_pendingQueue.length > 0 && _jobListener) {
    const copy = [..._pendingQueue];
    _pendingQueue = [];
    copy.forEach((j) => _jobListener!(j));
  }

  return () => {
    _jobListener = null;
    _modalListener = null;
  };
}

export function sendViaWhatsAppBridge(
  phone: string,
  text: string,
  outboxId?: string
) {
  const cleanDigits = phone.replace(/[^0-9]/g, '');
  if (!cleanDigits) return;

  const job: WhatsAppBridgeJob = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    phone: cleanDigits,
    text,
    outboxId,
  };

  if (_jobListener) {
    _jobListener(job);
  } else {
    _pendingQueue.push(job);
  }
}

export function openWhatsAppLinkerModal() {
  if (_modalListener) {
    _modalListener(true);
  }
}

export function closeWhatsAppLinkerModal() {
  if (_modalListener) {
    _modalListener(false);
  }
}

export function getWhatsAppBridgeStatus(): WhatsAppBridgeStatus {
  return _currentStatus;
}

export function setWhatsAppBridgeStatus(status: WhatsAppBridgeStatus) {
  _currentStatus = status;
  _statusListeners.forEach((cb) => cb(status));
}

export function subscribeWhatsAppBridgeStatus(cb: StatusListener) {
  _statusListeners.add(cb);
  cb(_currentStatus);
  return () => {
    _statusListeners.delete(cb);
  };
}

