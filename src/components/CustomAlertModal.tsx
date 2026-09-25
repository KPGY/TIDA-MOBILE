import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  Trash2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAlertStore, AlertButton, AlertType } from '@/services/alert';
import { useAppStore } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';

export function CustomAlertModal() {
  const { visible, title, message, buttons, type, hide } = useAlertStore();
  const { panelTheme, mainTheme, panelTextMode, glassmorphismMode } = useAppStore();

  const isDark = panelTextMode === 'light';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, 0.96) : panelTheme;
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  // Trigger tactile haptics when alert becomes visible
  useEffect(() => {
    if (visible) {
      if (type === 'danger') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  }, [visible, type]);

  if (!visible) return null;

  const handleButtonPress = (btn: AlertButton) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hide();
    if (btn.onPress) {
      // Let modal fade out slightly before callback executes
      setTimeout(() => {
        btn.onPress?.();
      }, 50);
    }
  };

  // Find cancel button if any
  const cancelBtn = buttons.find((b) => b.style === 'cancel');

  const renderIconBadge = (alertType?: AlertType) => {
    switch (alertType) {
      case 'danger':
        return (
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
            <AlertTriangle size={24} color="#EF4444" />
          </View>
        );
      case 'success':
        return (
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <CheckCircle2 size={24} color="#10B981" />
          </View>
        );
      case 'warning':
        return (
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
            <AlertCircle size={24} color="#F59E0B" />
          </View>
        );
      case 'info':
      default:
        return (
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: hexToRgba(mainTheme, 0.15) },
            ]}>
            <Info size={24} color={mainTheme} />
          </View>
        );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cancelBtn) {
          handleButtonPress(cancelBtn);
        } else {
          hide();
        }
      }}>
      <View style={styles.backdropContainer}>
        {/* Backdrop dismiss */}
        <TouchableWithoutFeedback
          onPress={() => {
            if (cancelBtn) {
              handleButtonPress(cancelBtn);
            } else if (buttons.length <= 1) {
              hide();
            }
          }}>
          <View style={styles.backdropOverlay} />
        </TouchableWithoutFeedback>

        {/* Custom Dialog Card */}
        <View
          style={[
            styles.alertCard,
            {
              backgroundColor: cardBg,
              borderColor,
            },
          ]}>
          {/* Icon Badge */}
          {renderIconBadge(type)}

          {/* Title */}
          {title ? (
            <Text style={[styles.alertTitle, { color: textColor }]}>
              {title}
            </Text>
          ) : null}

          {/* Message */}
          {message ? (
            <Text style={[styles.alertMessage, { color: subTextColor }]}>
              {message}
            </Text>
          ) : null}

          {/* Buttons Row / Column */}
          <View
            style={[
              styles.buttonsContainer,
              buttons.length === 2 ? styles.buttonsRow : styles.buttonsColumn,
            ]}>
            {buttons.map((btn, idx) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';

              let btnBg = hexToRgba(mainTheme, 0.15);
              let btnTextColor = mainTheme;

              if (isCancel) {
                btnBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
                btnTextColor = subTextColor;
              } else if (isDestructive) {
                btnBg = '#EF4444';
                btnTextColor = '#FFFFFF';
              } else {
                btnBg = mainTheme;
                btnTextColor = '#FFFFFF';
              }

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    buttons.length === 2 && styles.buttonFlex,
                    { backgroundColor: btnBg },
                    isDestructive && styles.destructiveShadow,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => handleButtonPress(btn)}>
                  <Text
                    style={[
                      styles.buttonText,
                      { color: btnTextColor },
                      !isCancel && styles.boldButtonText,
                    ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  buttonsContainer: {
    width: '100%',
    gap: 10,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  button: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  boldButtonText: {
    fontWeight: '700',
  },
  destructiveShadow: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
});
