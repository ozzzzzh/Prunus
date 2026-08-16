import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { useDialogStore } from '../../store/dialogStore';
import { cn } from '../../utils/cn';

const TOAST_DURATION = 3000;

export default function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog);
  const toast = useDialogStore((s) => s.toast);
  const dismissToast = useDialogStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <>
      {dialog?.type === 'confirm' && <ConfirmDialog />}
      {dialog?.type === 'prompt' && <PromptDialog />}
      {toast && <ToastMessage />}
    </>
  );
}

function ConfirmDialog() {
  const dialog = useDialogStore((s) => s.dialog);
  const closeDialog = useDialogStore((s) => s.closeDialog);

  if (!dialog || dialog.type !== 'confirm') return null;

  const handleConfirm = () => {
    dialog.onConfirm?.();
    closeDialog();
  };

  const handleCancel = () => {
    dialog.onCancel?.();
    closeDialog();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{dialog.title}</h2>
        </div>
        {dialog.message && (
          <div className="px-6 py-4 text-sm text-gray-600 leading-relaxed">{dialog.message}</div>
        )}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {dialog.cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
              dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-leaf-600 hover:bg-leaf-700'
            )}
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptDialog() {
  const dialog = useDialogStore((s) => s.dialog);
  const closeDialog = useDialogStore((s) => s.closeDialog);
  const initialValue = dialog?.type === 'prompt' ? (dialog.initialValue ?? '') : '';
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  if (!dialog || dialog.type !== 'prompt') return null;

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    dialog.onConfirm?.(trimmed);
    closeDialog();
  };

  const handleCancel = () => {
    dialog.onCancel?.();
    closeDialog();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{dialog.title}</h2>
        </div>
        <div className="px-6 py-4">
          {dialog.message && <p className="text-sm text-gray-500 mb-3">{dialog.message}</p>}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') handleCancel();
            }}
            placeholder={dialog.placeholder}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200"
          />
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {dialog.cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastMessage() {
  const toast = useDialogStore((s) => s.toast);

  if (!toast) return null;

  const Icon = toast.type === 'error' ? AlertCircle : toast.type === 'success' ? CheckCircle2 : Info;
  const iconColor = toast.type === 'error' ? 'text-red-400' : toast.type === 'success' ? 'text-leaf-400' : 'text-gray-300';

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[160] flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm shadow-lg animate-in fade-in-0 slide-in-from-top-2">
      <Icon size={16} className={iconColor} />
      <span>{toast.message}</span>
    </div>
  );
}
