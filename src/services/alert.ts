import { create } from 'zustand';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export type AlertType = 'info' | 'success' | 'warning' | 'danger';

export interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  type?: AlertType;
  show: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    type?: AlertType,
  ) => void;
  hide: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  visible: false,
  title: '',
  message: '',
  buttons: [],
  type: undefined,
  show: (title, message, buttons, type) => {
    let detectedType = type;
    if (!detectedType) {
      const fullText = `${title} ${message || ''}`.toLowerCase();
      const hasDestructive = buttons?.some((b) => b.style === 'destructive');
      if (
        hasDestructive ||
        fullText.includes('삭제') ||
        fullText.includes('초기화') ||
        fullText.includes('경고')
      ) {
        detectedType = 'danger';
      } else if (
        fullText.includes('완료') ||
        fullText.includes('성공') ||
        fullText.includes('지정되었습니다') ||
        fullText.includes('적용되었습니다') ||
        fullText.includes('저장되었습니다')
      ) {
        detectedType = 'success';
      } else if (
        fullText.includes('오류') ||
        fullText.includes('실패') ||
        fullText.includes('문제')
      ) {
        detectedType = 'warning';
      } else {
        detectedType = 'info';
      }
    }

    set({
      visible: true,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: '확인' }],
      type: detectedType,
    });
  },
  hide: () => set({ visible: false }),
}));

/**
 * Universal Custom Alert Function
 * Replaces React Native's default Alert.alert with a polished in-app custom popup modal.
 */
export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  type?: AlertType,
) => {
  useAlertStore.getState().show(title, message, buttons, type);
};

export const customAlert = {
  alert: showAlert,
};
