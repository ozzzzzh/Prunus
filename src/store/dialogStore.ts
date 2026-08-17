import { create } from 'zustand';

export type ToastType = 'info' | 'error' | 'success';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface PromptOptions {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

interface ConfirmDialogConfig {
  type: 'confirm';
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface PromptDialogConfig {
  type: 'prompt';
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText: string;
  cancelText: string;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

export type DialogConfig = ConfirmDialogConfig | PromptDialogConfig;

interface DialogState {
  dialog: DialogConfig | null;
  toast: { message: string; type: ToastType } | null;
  showConfirm: (opts: ConfirmOptions) => void;
  showPrompt: (opts: PromptOptions) => void;
  showToast: (message: string, opts?: { type?: ToastType }) => void;
  dismissToast: () => void;
  closeDialog: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  dialog: null,
  toast: null,

  showConfirm: ({ title, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }) => {
    set({
      dialog: { type: 'confirm', title, message, confirmText, cancelText, danger, onConfirm, onCancel },
    });
  },

  showPrompt: ({ title, message, initialValue = '', placeholder, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) => {
    set({
      dialog: { type: 'prompt', title, message, initialValue, placeholder, confirmText, cancelText, onConfirm, onCancel },
    });
  },

  showToast: (message, opts) => {
    set({ toast: { message, type: opts?.type ?? 'info' } });
  },

  dismissToast: () => set({ toast: null }),
  closeDialog: () => set({ dialog: null }),
}));
