import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileUp,
  RotateCcw,
  SquareCheck,
  XCircle,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  decodeAnyPaperBridgeMessage,
  PaperBridgeError,
  scanQRCodeFromImageFile,
  type AnyPaperBridgeEnvelope,
} from '../../services/paperbridge';
import { QRMessageDisplay } from './QRMessageDisplay';
import { syncRepository, type IncomingUpdateResult } from '../../services/sync/sync-repository';
import { taskRepository, type ImportTaskResult } from '../../db/task-repository';
import { PriorityIndicator } from '../tasks/PriorityIndicator';
import { actionLabels, formatDateTime } from '../../lib/task-display';
import { useLanguage } from '../../hooks/use-language';

type ReceiverStep = 'select' | 'camera' | 'preview' | 'result';

export function QRReceiver() {
  const { dict, formatTask } = useLanguage();
  const [step, setStep] = useState<ReceiverStep>('select');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<AnyPaperBridgeEnvelope | null>(null);
  const [importResult, setImportResult] = useState<ImportTaskResult | null>(null);
  const [syncResult, setSyncResult] = useState<
    IncomingUpdateResult | { status: 'ACK_RECORDED' | 'ACK_DUPLICATE' } | null
  >(null);
  const [ackRawJson, setAckRawJson] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current context is secure (HTTPS or localhost)
  const isSecure =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  // Stop camera and cleanup on unmount or mode switch
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  function stopCameraScanner() {
    if (scannerRef.current) {
      if (scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      try {
        scannerRef.current.clear();
      } catch {
        // Ignored
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }

  async function startCameraScanner() {
    setCameraError(null);
    setValidationError(null);
    setStep('camera');

    if (!isSecure) {
      setCameraError(
        'Camera access requires a secure context (HTTPS or localhost). If accessing over a local Wi-Fi HTTP IP, browser security blocks the camera. Please use the "Upload image" option below.',
      );
      return;
    }

    try {
      stopCameraScanner();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const readerElement = document.getElementById('paperbridge-camera-viewport');
      if (!readerElement) {
        setCameraError('Camera viewport element could not be initialized.');
        return;
      }

      const html5QrCode = new Html5Qrcode('paperbridge-camera-viewport');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          stopCameraScanner();
          await handleRawDecodedText(decodedText);
        },
        () => {
          // Per-frame misses are expected
        },
      );
      setCameraActive(true);
    } catch (err: unknown) {
      stopCameraScanner();
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.toLowerCase().includes('permission') ||
        message.toLowerCase().includes('denied')
      ) {
        setCameraError(
          'Camera permission was denied. Please grant camera permission in your browser or use "Upload image".',
        );
      } else if (
        message.toLowerCase().includes('notfound') ||
        message.toLowerCase().includes('no device')
      ) {
        setCameraError('No camera found on this device. Please use "Upload image".');
      } else {
        setCameraError(
          `Could not start camera (${message}). You can use "Upload image" to import without camera access.`,
        );
      }
    }
  }

  async function handleRawDecodedText(rawContent: string) {
    setIsProcessing(true);
    setValidationError(null);

    try {
      const envelope = await decodeAnyPaperBridgeMessage(rawContent);
      setPendingEnvelope(envelope);
      setStep('preview');
    } catch (err) {
      if (err instanceof PaperBridgeError) {
        setValidationError(err.message);
      } else {
        setValidationError('The scanned code is not a valid PaperBridge task.');
      }
      setStep('select');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';
    setIsProcessing(true);
    setValidationError(null);
    setCameraError(null);
    stopCameraScanner();

    try {
      const decodedText = await scanQRCodeFromImageFile(file);
      await handleRawDecodedText(decodedText);
    } catch (err) {
      if (err instanceof PaperBridgeError) {
        setValidationError(err.message);
      } else {
        setValidationError('Failed to read QR code from the selected image.');
      }
      setStep('select');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmImport() {
    if (!pendingEnvelope) return;
    setIsProcessing(true);
    setValidationError(null);

    try {
      if (pendingEnvelope.version === 1) {
        const result = await taskRepository.importPaperBridgeTask(pendingEnvelope);
        setImportResult(result);
      } else if (pendingEnvelope.messageType === 'TASK_UPDATE') {
        const result = await syncRepository.applyIncomingUpdate(pendingEnvelope);
        setSyncResult(result);
        if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED') {
          try {
            const ack = await syncRepository.createAcknowledgment(pendingEnvelope, result.status);
            setAckRawJson(ack.rawJson);
          } catch {
            // A different message ID may repeat the same operation. Never issue a false ACK.
            setAckRawJson('');
          }
        }
      } else {
        const result = await syncRepository.recordAcknowledgment(pendingEnvelope);
        setSyncResult({ status: result === 'RECORDED' ? 'ACK_RECORDED' : 'ACK_DUPLICATE' });
      }
      setStep('result');
    } catch (err) {
      if (err instanceof PaperBridgeError) {
        setValidationError(err.message);
      } else {
        setValidationError(
          err instanceof Error ? err.message : 'Database import failed. No data was saved.',
        );
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function handleCancelPreview() {
    setPendingEnvelope(null);
    setValidationError(null);
    setStep('select');
  }

  function handleReset() {
    stopCameraScanner();
    setPendingEnvelope(null);
    setImportResult(null);
    setSyncResult(null);
    setAckRawJson('');
    setValidationError(null);
    setCameraError(null);
    setStep('select');
  }

  return (
    <div className="panel max-w-md p-4 md:p-6">
      {/* Validation or parsing error banner */}
      {validationError && (
        <div
          className="mb-4 rounded-lg border border-[var(--color-error)]/30 bg-surface p-4 text-xs"
          role="alert"
        >
          <div className="flex items-center gap-2 text-danger">
            <AlertCircle size={17} />
            <span className="font-semibold">{dict.paperbridge.validationFailedTitle}</span>
          </div>
          <p className="mt-1 leading-relaxed text-muted">{validationError}</p>
        </div>
      )}

      {/* Step 1: Mode Selection (Camera or Image File) */}
      {step === 'select' && (
        <div>
          <div className="overflow-hidden rounded-lg bg-brand text-[var(--color-on-primary)]">
            <div className="px-6 pb-6 pt-5">
              <p className="text-center text-[10px] uppercase tracking-[.14em] text-[var(--color-sidebar-muted)]">
                {dict.paperbridge.receiveTitle}
              </p>
              <div className="scanner-frame my-4 flex flex-col items-center justify-center gap-4 px-4 py-8 text-center">
                <Camera
                  size={44}
                  strokeWidth={1.25}
                  className="text-[var(--color-sidebar-muted)]"
                />
                <p className="text-xs leading-relaxed text-[var(--color-on-primary)]">
                  {dict.paperbridge.receiveSubtitle}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-sidebar-active)] p-4">
              <button
                type="button"
                onClick={() => void startCameraScanner()}
                disabled={isProcessing}
                className="button-secondary flex-col border-transparent py-3 hover:bg-[var(--color-sidebar-active)]"
              >
                <Camera size={20} />
                <span>{dict.paperbridge.useCameraButton}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="button-secondary flex-col border-transparent py-3 hover:bg-[var(--color-sidebar-active)]"
              >
                <FileUp size={20} />
                <span>{dict.paperbridge.uploadImageButton}</span>
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
            aria-label="Upload QR code image"
          />

          {isProcessing && (
            <p className="mt-4 text-center text-xs text-muted" role="status">
              {dict.paperbridge.analyzingImage}
            </p>
          )}

          {!isSecure && (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Note: When accessed via a LAN IP without HTTPS, browsers restrict live camera access.
              Use <strong>{dict.paperbridge.uploadImageButton}</strong> to import tasks across
              devices seamlessly.
            </p>
          )}
        </div>
      )}

      {/* Step 2: Live Camera Viewfinder */}
      {step === 'camera' && (
        <div>
          <div className="overflow-hidden rounded-lg bg-brand p-4 text-[var(--color-on-primary)]">
            <div className="mb-3 flex items-center justify-between text-xs text-[var(--color-sidebar-muted)]">
              <span>{dict.paperbridge.alignFrameNotice}</span>
              {cameraActive && (
                <span className="flex items-center gap-1.5 text-accent">
                  <span className="h-2 w-2 rounded-full bg-action animate-pulse" />
                  Active
                </span>
              )}
            </div>

            {cameraError ? (
              <div className="rounded-md bg-surface p-4 text-xs text-brand" role="alert">
                <p className="font-semibold text-danger">{dict.paperbridge.cameraNoticeTitle}</p>
                <p className="mt-1 leading-relaxed text-muted">{cameraError}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="button-primary text-xs"
                  >
                    <FileUp size={15} />
                    {dict.paperbridge.uploadImageButton}
                  </button>
                  <button type="button" onClick={handleReset} className="button-secondary text-xs">
                    {dict.form.cancelButton}
                  </button>
                </div>
              </div>
            ) : (
              <div
                id="paperbridge-camera-viewport"
                className="aspect-square w-full overflow-hidden rounded border border-[var(--color-sidebar-active)] bg-black"
              />
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="button-secondary w-full justify-center"
            >
              {dict.paperbridge.cancelCamera}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="button-secondary w-full justify-center"
            >
              <FileUp size={16} />
              {dict.paperbridge.uploadImageButton}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
            aria-label="Upload QR code image"
          />
        </div>
      )}

      {/* Step 3: Decoded Task Preview & Confirmation */}
      {step === 'preview' && pendingEnvelope?.version === 2 && (
        <div>
          <h2 className="text-base font-semibold">
            {pendingEnvelope.messageType === 'TASK_UPDATE'
              ? 'Review Task Update'
              : 'Review Acknowledgment'}
          </h2>
          {pendingEnvelope.messageType === 'TASK_UPDATE' ? (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4 text-xs">
              <p>
                Task {pendingEnvelope.payload.taskId.slice(0, 8)} · revision{' '}
                {pendingEnvelope.payload.baseRevision} → {pendingEnvelope.payload.nextRevision}
              </p>
              <p className="mt-2">
                From device <span className="break-all font-mono">{pendingEnvelope.senderId}</span>
              </p>
              <dl className="mt-3 grid gap-2 border-t border-line pt-3">
                {Object.entries(pendingEnvelope.payload.changes).map(([field, value]) => (
                  <div key={field}>
                    <dt className="font-semibold">{field}</dt>
                    <dd className="break-words text-muted">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {pendingEnvelope.payload.resolution && (
                <p className="mt-3 text-warning">This update resolves a prior conflict.</p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4 text-xs">
              <p>Message {pendingEnvelope.payload.acknowledgedMessageId.slice(0, 8)}</p>
              <p className="mt-2">
                Task revision {pendingEnvelope.payload.appliedRevision} ·{' '}
                {pendingEnvelope.payload.result}
              </p>
              <p className="mt-2 break-all">Receiver {pendingEnvelope.payload.receiverDeviceId}</p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Verify this message before saving it locally. A checksum checks integrity, not sender
            identity.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="button-secondary justify-center"
              onClick={handleCancelPreview}
            >
              {dict.form.cancelButton}
            </button>
            <button
              type="button"
              className="button-primary justify-center"
              disabled={isProcessing}
              onClick={() => void handleConfirmImport()}
            >
              {isProcessing
                ? 'Saving…'
                : pendingEnvelope.messageType === 'TASK_UPDATE'
                  ? 'Apply Update'
                  : 'Record Acknowledgment'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && pendingEnvelope?.version === 1 && (
        <div>
          <div className="mb-4 flex items-center gap-2 text-brand">
            <SquareCheck size={20} className="text-brand" />
            <h2 className="text-base font-semibold">{dict.paperbridge.decodedSuccessTitle}</h2>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  {pendingEnvelope.payload.instruction
                    ? (dict.actions[pendingEnvelope.payload.instruction.actionCode] ??
                      pendingEnvelope.payload.instruction.actionCode)
                    : (dict.legacyActions[pendingEnvelope.payload.action] ??
                      actionLabels[pendingEnvelope.payload.action])}
                </span>
                <h3 className="mt-1 text-base font-semibold leading-snug">
                  {pendingEnvelope.payload.instruction
                    ? formatTask(pendingEnvelope.payload.instruction)
                    : pendingEnvelope.payload.title}
                </h3>
              </div>
              <PriorityIndicator priority={pendingEnvelope.payload.priority} />
            </div>

            {/* If structured instruction has notes, or payload has description */}
            {(pendingEnvelope.payload.instruction?.additionalNotes ||
              pendingEnvelope.payload.description) && (
              <div className="mt-3">
                <p className="text-xs leading-relaxed text-muted">
                  {pendingEnvelope.payload.instruction?.additionalNotes ??
                    pendingEnvelope.payload.description}
                </p>
                {pendingEnvelope.payload.instruction?.additionalNotes && (
                  <span className="mt-1 block text-[10px] text-muted">
                    {dict.form.untranslatedNoteNotice}
                  </span>
                )}
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
              <div>
                <dt className="text-muted">{dict.form.quantityLabel}</dt>
                <dd className="mt-0.5 font-medium">
                  {pendingEnvelope.payload.quantity !== undefined
                    ? `${pendingEnvelope.payload.quantity} ${
                        pendingEnvelope.payload.instruction?.unitCode
                          ? (dict.units[pendingEnvelope.payload.instruction.unitCode] ??
                            pendingEnvelope.payload.instruction.unitCode)
                          : (pendingEnvelope.payload.unit ?? '')
                      }`
                    : 'Unspecified'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{dict.form.statusLabel}</dt>
                <dd className="mt-0.5 font-medium">
                  {dict.statuses[pendingEnvelope.payload.status] ?? pendingEnvelope.payload.status}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted">{dict.form.locationLabel}</dt>
                <dd className="mt-0.5 font-medium">
                  {pendingEnvelope.payload.instruction?.locationText ??
                    pendingEnvelope.payload.location}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted">{dict.task.deviceLabel}</dt>
                <dd className="mt-0.5 break-all font-mono text-[10px] text-muted">
                  {pendingEnvelope.senderId}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted">{dict.task.createdLabel}</dt>
                <dd className="mt-0.5 text-[11px] text-muted">
                  {formatDateTime(pendingEnvelope.payload.createdAt)} · {dict.task.revision}{' '}
                  {pendingEnvelope.payload.revision}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-3 text-xs text-muted">{dict.settings.offlineIndicatorDescription}</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCancelPreview}
              disabled={isProcessing}
              className="button-secondary justify-center"
            >
              {dict.form.cancelButton}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={isProcessing}
              className="button-primary justify-center"
            >
              <CheckCircle2 size={17} />
              {isProcessing ? dict.paperbridge.importingButton : dict.paperbridge.importTaskButton}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Import Result (Success, Duplicate, or Conflict) */}
      {step === 'result' && importResult && (
        <div className="text-center">
          {importResult.status === 'imported' && (
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface)] text-brand">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="mt-3 text-base font-semibold">
                {dict.paperbridge.importedSuccessTitle}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {dict.paperbridge.importedSuccessMessage(importResult.task.title)}
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                <Link
                  to={`/tasks/${importResult.task.id}`}
                  className="button-primary justify-center text-center no-underline"
                >
                  {dict.paperbridge.viewTaskDetailsButton}
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="button-secondary justify-center"
                >
                  <RotateCcw size={16} />
                  {dict.paperbridge.scanAnotherButton}
                </button>
              </div>
            </div>
          )}

          {importResult.status === 'duplicate' && (
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface)] text-warning">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="mt-3 text-base font-semibold">
                {dict.paperbridge.alreadyPresentTitle}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">{importResult.message}</p>
              <div className="mt-6 flex flex-col gap-2.5">
                <Link
                  to={`/tasks/${importResult.task.id}`}
                  className="button-primary justify-center text-center no-underline"
                >
                  {dict.paperbridge.viewExistingButton}
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="button-secondary justify-center"
                >
                  <RotateCcw size={16} />
                  {dict.paperbridge.scanAnotherButton}
                </button>
              </div>
            </div>
          )}

          {importResult.status === 'conflict' && (
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface)] text-danger">
                <XCircle size={32} />
              </div>
              <h2 className="mt-3 text-base font-semibold">{dict.paperbridge.conflictTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">{importResult.message}</p>
              <div className="mt-6 flex flex-col gap-2.5">
                {importResult.code === 'REVISION_CONFLICT' && (
                  <Link
                    to={`/tasks/${importResult.task.id}`}
                    className="button-secondary justify-center text-center no-underline"
                  >
                    {dict.paperbridge.viewExistingButton}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="button-primary justify-center"
                >
                  <RotateCcw size={16} />
                  {dict.paperbridge.scanAnotherButton}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {step === 'result' && syncResult && (
        <div>
          <h2 className="text-base font-semibold">
            {syncResult.status === 'APPLIED'
              ? 'Task Update Applied'
              : syncResult.status === 'ALREADY_APPLIED'
                ? 'Update Already Applied'
                : syncResult.status === 'CONFLICT'
                  ? 'Resolve Task Conflict'
                  : syncResult.status === 'ACK_RECORDED'
                    ? 'Acknowledgment Recorded'
                    : syncResult.status === 'ACK_DUPLICATE'
                      ? 'Acknowledgment Already Recorded'
                      : syncResult.status === 'MISSING_PARENT'
                        ? 'Earlier Update Needed'
                        : 'Update Not Applied'}
          </h2>
          {'message' in syncResult && (
            <p className="mt-2 text-xs text-muted">{syncResult.message}</p>
          )}
          {syncResult.status === 'CONFLICT' && (
            <>
              <p className="mt-2 text-xs text-muted">
                Local task unchanged. Both branches were saved for review.
              </p>
              <Link
                to={`/tasks/${syncResult.conflict.taskId}`}
                className="button-primary mt-4 w-full justify-center"
              >
                Resolve Conflict
              </Link>
            </>
          )}
          {(syncResult.status === 'APPLIED' || syncResult.status === 'ALREADY_APPLIED') &&
            ackRawJson && (
              <>
                <p className="mt-3 text-xs text-muted">
                  Show this return QR to the sending device so it can mark the transfer
                  acknowledged.
                </p>
                <QRMessageDisplay
                  rawJson={ackRawJson}
                  label="Acknowledgment"
                  filename={`relay-miden-ack-${syncResult.messageId.slice(0, 8)}.png`}
                />
              </>
            )}
          {(syncResult.status === 'APPLIED' || syncResult.status === 'ALREADY_APPLIED') && (
            <Link
              to={`/tasks/${syncResult.task.id}`}
              className="button-secondary mt-4 w-full justify-center"
            >
              View Task
            </Link>
          )}
          <button
            type="button"
            className="button-secondary mt-3 w-full justify-center"
            onClick={handleReset}
          >
            Scan Another
          </button>
        </div>
      )}
    </div>
  );
}
