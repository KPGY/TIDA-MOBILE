import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  PanResponder,
  ScrollView,
  Platform,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import {
  X,
  Check,
  RotateCcw,
  Sliders,
  Palette,
  Minus,
  Plus,
} from 'lucide-react-native';
import {
  hexToHsl,
  hslToHex,
  HSL,
} from '@/utils/autoColorMatcher';
import { getContrastMode, hexToRgba } from '@/utils/colorHelper';

interface ColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  initialColor: string;
  initialEndColor?: string;
  gradientMode?: boolean;
  onApply: (color: string, endColor?: string) => void;
  isDarkTheme?: boolean;
}

const PRESET_CATEGORIES = [
  {
    id: 'classic',
    name: '추천 기본',
    colors: [
      '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
      '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#64748B',
      '#1E293B', '#FFFFFF',
    ],
  },
  {
    id: 'pastel',
    name: '소프트 파스텔',
    colors: [
      '#BFDBFE', '#C7D2FE', '#DDD6FE', '#FBCFE8', '#FECDD3',
      '#FED7AA', '#FEF08A', '#A7F3D0', '#BAE6FD', '#E2E8F0',
      '#F1F5F9', '#FFF1F2',
    ],
  },
  {
    id: 'vivid',
    name: '비비드 & 네온',
    colors: [
      '#2563EB', '#7C3AED', '#D946EF', '#F43F5E', '#EA580C',
      '#EAB308', '#059669', '#0284C7', '#14B8A6', '#00F0FF',
      '#FF0055', '#39FF14',
    ],
  },
  {
    id: 'earthy',
    name: '어스 & 웜톤',
    colors: [
      '#78350F', '#9A3412', '#B45309', '#D97706', '#A16207',
      '#4D7C0F', '#15803D', '#047857', '#3F3F46', '#292524',
      '#57534E', '#44403C',
    ],
  },
  {
    id: 'dark',
    name: '다크 & 모던',
    colors: [
      '#090D16', '#0F172A', '#18181B', '#111827', '#1E1B4B',
      '#2E1065', '#1E293B', '#334155', '#475569', '#020617',
      '#000000', '#1C1917',
    ],
  },
];

interface SliderBarProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  onChange: (val: number) => void;
  renderGradient: (width: number) => React.ReactNode;
  textColor: string;
  subTextColor: string;
  cardBorder: string;
}

function SliderBar({
  label,
  value,
  max,
  unit = '',
  onChange,
  renderGradient,
  textColor,
  subTextColor,
  cardBorder,
}: SliderBarProps) {
  const [trackWidth, setTrackWidth] = useState(250);
  const trackLayout = useRef({ pageX: 0, width: 250 });
  const trackRef = useRef<View>(null);

  const updateFromPageX = (pageX: number) => {
    const { pageX: startX, width } = trackLayout.current;
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (pageX - startX) / width));
    const nextVal = Math.round(ratio * max);
    onChange(nextVal);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          trackRef.current?.measure((_x, _y, width, _height, pageX) => {
            if (width > 0) {
              trackLayout.current = { pageX, width };
              setTrackWidth(width);
            }
            updateFromPageX(evt.nativeEvent.pageX);
          });
        },
        onPanResponderMove: (evt) => {
          updateFromPageX(evt.nativeEvent.pageX);
        },
      }),
    [max, onChange]
  );

  const thumbRatio = Math.max(0, Math.min(1, value / max));
  const thumbLeft = thumbRatio * (trackWidth - 24);

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderHeaderRow}>
        <Text style={[styles.sliderLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.sliderValueText, { color: subTextColor }]}>
          {value}
          {unit}
        </Text>
      </View>

      <View style={styles.sliderRowWithButtons}>
        {/* - 버튼 */}
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: cardBorder }]}
          onPress={() => onChange(Math.max(0, value - (max === 360 ? 5 : 2)))}>
          <Minus size={14} color={textColor} />
        </TouchableOpacity>

        {/* 슬라이더 트랙 */}
        <View
          ref={trackRef}
          style={styles.sliderTrackWrapper}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTrackWidth(w);
            trackRef.current?.measure((_x, _y, width, _height, pageX) => {
              if (width > 0) {
                trackLayout.current = { pageX, width };
                setTrackWidth(width);
              }
            });
          }}
          {...panResponder.panHandlers}>
          {renderGradient(trackWidth)}

          {/* 조절 노브 (Thumb) */}
          <View
            pointerEvents="none"
            style={[
              styles.sliderThumb,
              {
                left: thumbLeft,
              },
            ]}
          />
        </View>

        {/* + 버튼 */}
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: cardBorder }]}
          onPress={() => onChange(Math.min(max, value + (max === 360 ? 5 : 2)))}>
          <Plus size={14} color={textColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ColorPickerModal({
  visible,
  onClose,
  title,
  initialColor,
  initialEndColor,
  gradientMode = false,
  onApply,
  isDarkTheme = false,
}: ColorPickerModalProps) {
  // 모달 내부 활성 모드: 'start' (시작 색상) | 'end' (끝 색상)
  const [activeGradientTarget, setActiveGradientTarget] = useState<'start' | 'end'>('start');

  // 내부 상태 (시작색 및 끝색)
  const [startColor, setStartColor] = useState<string>(initialColor || '#3B82F6');
  const [endColor, setEndColor] = useState<string>(initialEndColor || initialColor || '#6366F1');

  // 현재 편집 대상 색상
  const currentEditingColor = activeGradientTarget === 'start' ? startColor : endColor;

  // HSL 분해 상태
  const [hsl, setHsl] = useState<HSL>(() => hexToHsl(currentEditingColor));

  // 탭: 'presets' | 'sliders'
  const [activeTab, setActiveTab] = useState<'presets' | 'sliders'>('presets');
  const [activePresetCategory, setActivePresetCategory] = useState<string>('classic');

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (visible) {
      const validStart = initialColor && /^#[0-9A-Fa-f]{6}$/.test(initialColor) ? initialColor : '#3B82F6';
      const validEnd = initialEndColor && /^#[0-9A-Fa-f]{6}$/.test(initialEndColor) ? initialEndColor : validStart;
      setStartColor(validStart);
      setEndColor(validEnd);
      setActiveGradientTarget('start');
      setHsl(hexToHsl(validStart));
    }
  }, [visible, initialColor, initialEndColor]);

  // 대상 변경(시작색 <-> 끝색) 시 HSL 동기화
  const handleSwitchTarget = (target: 'start' | 'end') => {
    setActiveGradientTarget(target);
    const targetColor = target === 'start' ? startColor : endColor;
    setHsl(hexToHsl(targetColor));
  };

  // 색상 업데이트 헬퍼
  const updateActiveColor = (hex: string) => {
    const upper = hex.toUpperCase();
    if (activeGradientTarget === 'start') {
      setStartColor(upper);
    } else {
      setEndColor(upper);
    }
    setHsl(hexToHsl(upper));
  };

  // HSL 변경 핸들러
  const handleHslChange = (nextHsl: Partial<HSL>) => {
    const merged = { ...hsl, ...nextHsl };
    setHsl(merged);
    const hex = hslToHex(merged.h, merged.s, merged.l);
    if (activeGradientTarget === 'start') {
      setStartColor(hex);
    } else {
      setEndColor(hex);
    }
  };

  // 취소 및 원상복구
  const handleReset = () => {
    if (activeGradientTarget === 'start') {
      setStartColor(initialColor);
      setHsl(hexToHsl(initialColor));
    } else {
      const resetEnd = initialEndColor || initialColor;
      setEndColor(resetEnd);
      setHsl(hexToHsl(resetEnd));
    }
  };

  // 적용
  const handleConfirm = () => {
    if (gradientMode) {
      onApply(startColor, endColor);
    } else {
      onApply(startColor);
    }
    onClose();
  };

  // 테마 색상 정의
  const bgColor = isDarkTheme ? '#1E293B' : '#FFFFFF';
  const textColor = isDarkTheme ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDarkTheme ? '#94A3B8' : '#64748B';
  const cardBorder = isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tabBg = isDarkTheme ? '#0F172A' : '#F1F5F9';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: bgColor }]}>
          {/* 모달 헤더 */}
          <View style={[styles.modalHeader, { borderBottomColor: cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
              <Text style={[styles.modalSubtitle, { color: subTextColor }]}>
                {gradientMode ? '시작색과 끝색을 조화롭게 지정하세요' : '손쉽게 원하는 색상을 선택하세요'}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* 그라데이션 모드일 때: 시작색 / 끝색 탭 */}
          {gradientMode && (
            <View style={[styles.gradientTargetRow, { backgroundColor: tabBg }]}>
              <TouchableOpacity
                style={[
                  styles.gradientTargetBtn,
                  activeGradientTarget === 'start' && {
                    backgroundColor: bgColor,
                    ...styles.activeTargetShadow,
                  },
                ]}
                onPress={() => handleSwitchTarget('start')}>
                <View style={[styles.targetDot, { backgroundColor: startColor }]} />
                <Text
                  style={[
                    styles.targetBtnText,
                    {
                      color: activeGradientTarget === 'start' ? textColor : subTextColor,
                      fontWeight: activeGradientTarget === 'start' ? '700' : '500',
                    },
                  ]}>
                  시작 색상
                </Text>
                <Text style={[styles.targetHex, { color: subTextColor }]}>{startColor}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.gradientTargetBtn,
                  activeGradientTarget === 'end' && {
                    backgroundColor: bgColor,
                    ...styles.activeTargetShadow,
                  },
                ]}
                onPress={() => handleSwitchTarget('end')}>
                <View style={[styles.targetDot, { backgroundColor: endColor }]} />
                <Text
                  style={[
                    styles.targetBtnText,
                    {
                      color: activeGradientTarget === 'end' ? textColor : subTextColor,
                      fontWeight: activeGradientTarget === 'end' ? '700' : '500',
                    },
                  ]}>
                  끝 색상
                </Text>
                <Text style={[styles.targetHex, { color: subTextColor }]}>{endColor}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 실시간 미리보기 & 원본 대비 카드 */}
          <View style={[styles.previewCard, { borderColor: cardBorder }]}>
            {gradientMode ? (
              <View style={styles.gradientPreviewWrapper}>
                <Svg width="100%" height={48}>
                  <Defs>
                    <LinearGradient id="modalGradPreview" x1="0%" y1="0%" x2="100%" y2="0%">
                      <Stop offset="0%" stopColor={startColor} />
                      <Stop offset="100%" stopColor={endColor} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height={48} rx={12} ry={12} fill="url(#modalGradPreview)" />
                </Svg>
                <View style={styles.gradientLabelsRow}>
                  <Text style={[styles.gradientPreviewText, { color: getContrastMode(startColor) === 'light' ? '#FFFFFF' : '#000000' }]}>
                    {startColor}
                  </Text>
                  <Text style={[styles.gradientPreviewText, { color: getContrastMode(endColor) === 'light' ? '#FFFFFF' : '#000000' }]}>
                    {endColor}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.singlePreviewRow}>
                {/* 현재 선택 색상 */}
                <View style={styles.previewBadgeWrapper}>
                  <View style={[styles.largeColorBadge, { backgroundColor: currentEditingColor }]}>
                    <Text
                      style={[
                        styles.colorContrastCode,
                        { color: getContrastMode(currentEditingColor) === 'light' ? '#FFFFFF' : '#000000' },
                      ]}>
                      {currentEditingColor}
                    </Text>
                  </View>
                </View>

                {/* 변경 전 색상 & 되돌리기 */}
                <View style={styles.originalCompareCol}>
                  <Text style={[styles.compareLabel, { color: subTextColor }]}>기존 색상</Text>
                  <TouchableOpacity
                    style={[styles.revertBtn, { borderColor: cardBorder }]}
                    onPress={handleReset}>
                    <View style={[styles.smallColorDot, { backgroundColor: initialColor }]} />
                    <RotateCcw size={13} color={subTextColor} style={{ marginLeft: 6 }} />
                    <Text style={[styles.revertText, { color: subTextColor }]}>되돌리기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* 모드 전환 탭: [추천 팔레트] vs [비주얼 슬라이더] */}
          <View style={[styles.tabSelectorRow, { backgroundColor: tabBg }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'presets' && {
                  backgroundColor: bgColor,
                  ...styles.activeTargetShadow,
                },
              ]}
              onPress={() => setActiveTab('presets')}>
              <Palette size={16} color={activeTab === 'presets' ? textColor : subTextColor} />
              <Text
                style={[
                  styles.tabBtnText,
                  {
                    color: activeTab === 'presets' ? textColor : subTextColor,
                    fontWeight: activeTab === 'presets' ? '700' : '500',
                  },
                ]}>
                인기 팔레트
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'sliders' && {
                  backgroundColor: bgColor,
                  ...styles.activeTargetShadow,
                },
              ]}
              onPress={() => setActiveTab('sliders')}>
              <Sliders size={16} color={activeTab === 'sliders' ? textColor : subTextColor} />
              <Text
                style={[
                  styles.tabBtnText,
                  {
                    color: activeTab === 'sliders' ? textColor : subTextColor,
                    fontWeight: activeTab === 'sliders' ? '700' : '500',
                  },
                ]}>
                정밀 슬라이더
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {activeTab === 'presets' ? (
              /* ====================================================
                 탭 1: 카테고리별 프리셋 팔레트
                 ==================================================== */
              <View style={styles.presetsContent}>
                {/* 카테고리 칩 목록 */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScroll}>
                  {PRESET_CATEGORIES.map((cat) => {
                    const isSelected = activePresetCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryPill,
                          { borderColor: cardBorder },
                          isSelected && { backgroundColor: textColor, borderColor: textColor },
                        ]}
                        onPress={() => setActivePresetCategory(cat.id)}>
                        <Text
                          style={[
                            styles.categoryPillText,
                            { color: isSelected ? bgColor : subTextColor },
                          ]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 선택된 카테고리의 색상 칩 그리드 */}
                <View style={styles.swatchGrid}>
                  {PRESET_CATEGORIES.find((c) => c.id === activePresetCategory)?.colors.map(
                    (hex) => {
                      const isSelected = currentEditingColor.toUpperCase() === hex.toUpperCase();
                      return (
                        <TouchableOpacity
                          key={hex}
                          style={[
                            styles.swatchItem,
                            { backgroundColor: hex, borderColor: cardBorder },
                            isSelected && styles.swatchItemActive,
                          ]}
                          onPress={() => updateActiveColor(hex)}>
                          {isSelected && (
                            <Check
                              size={18}
                              color={getContrastMode(hex) === 'light' ? '#FFFFFF' : '#000000'}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>
            ) : (
              /* ====================================================
                 탭 2: 비주얼 슬라이더 (Hue, Saturation, Lightness)
                 ==================================================== */
              <View style={styles.slidersContent}>
                {/* 1. 색조 (Hue) */}
                <SliderBar
                  label="색조 (Hue)"
                  value={hsl.h}
                  max={360}
                  unit="°"
                  onChange={(h) => handleHslChange({ h })}
                  textColor={textColor}
                  subTextColor={subTextColor}
                  cardBorder={cardBorder}
                  renderGradient={(w) => (
                    <Svg width={w} height={20}>
                      <Defs>
                        <LinearGradient id="hueTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor="#FF0000" />
                          <Stop offset="17%" stopColor="#FFFF00" />
                          <Stop offset="33%" stopColor="#00FF00" />
                          <Stop offset="50%" stopColor="#00FFFF" />
                          <Stop offset="67%" stopColor="#0000FF" />
                          <Stop offset="83%" stopColor="#FF00FF" />
                          <Stop offset="100%" stopColor="#FF0000" />
                        </LinearGradient>
                      </Defs>
                      <Rect width={w} height={20} rx={10} ry={10} fill="url(#hueTrackGrad)" />
                    </Svg>
                  )}
                />

                {/* 2. 채도 (Saturation) */}
                <SliderBar
                  label="채도 (Saturation)"
                  value={hsl.s}
                  max={100}
                  unit="%"
                  onChange={(s) => handleHslChange({ s })}
                  textColor={textColor}
                  subTextColor={subTextColor}
                  cardBorder={cardBorder}
                  renderGradient={(w) => (
                    <Svg width={w} height={20}>
                      <Defs>
                        <LinearGradient id="satTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor={hslToHex(hsl.h, 0, hsl.l)} />
                          <Stop offset="100%" stopColor={hslToHex(hsl.h, 100, hsl.l)} />
                        </LinearGradient>
                      </Defs>
                      <Rect width={w} height={20} rx={10} ry={10} fill="url(#satTrackGrad)" />
                    </Svg>
                  )}
                />

                {/* 3. 밝기 (Lightness) */}
                <SliderBar
                  label="밝기 (Lightness)"
                  value={hsl.l}
                  max={100}
                  unit="%"
                  onChange={(l) => handleHslChange({ l })}
                  textColor={textColor}
                  subTextColor={subTextColor}
                  cardBorder={cardBorder}
                  renderGradient={(w) => (
                    <Svg width={w} height={20}>
                      <Defs>
                        <LinearGradient id="lightTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor="#000000" />
                          <Stop offset="50%" stopColor={hslToHex(hsl.h, hsl.s, 50)} />
                          <Stop offset="100%" stopColor="#FFFFFF" />
                        </LinearGradient>
                      </Defs>
                      <Rect width={w} height={20} rx={10} ry={10} fill="url(#lightTrackGrad)" />
                    </Svg>
                  )}
                />
              </View>
            )}
          </ScrollView>

          {/* 모달 하단 버튼 액션바 */}
          <View style={[styles.bottomActionBar, { borderTopColor: cardBorder }]}>
            <TouchableOpacity
              style={[styles.actionCancelBtn, { borderColor: cardBorder }]}
              onPress={onClose}>
              <Text style={[styles.actionCancelText, { color: subTextColor }]}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionApplyBtn, { backgroundColor: startColor }]}
              onPress={handleConfirm}>
              <Check
                size={18}
                color={getContrastMode(startColor) === 'light' ? '#FFFFFF' : '#000000'}
              />
              <Text
                style={[
                  styles.actionApplyText,
                  { color: getContrastMode(startColor) === 'light' ? '#FFFFFF' : '#000000' },
                ]}>
                적용하기
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  gradientTargetRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 14,
    padding: 4,
  },
  gradientTargetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  targetDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 6,
  },
  targetBtnText: {
    fontSize: 13,
  },
  targetHex: {
    fontSize: 11,
    marginLeft: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  activeTargetShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  previewCard: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  gradientPreviewWrapper: {
    position: 'relative',
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  gradientLabelsRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gradientPreviewText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  singlePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBadgeWrapper: {
    flex: 1,
  },
  largeColorBadge: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  colorContrastCode: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  originalCompareCol: {
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  compareLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  revertText: {
    fontSize: 12,
    marginLeft: 4,
  },
  tabSelectorRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  tabBtnText: {
    fontSize: 13,
  },
  scrollArea: {
    maxHeight: 280,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  presetsContent: {
    paddingBottom: 16,
  },
  categoryScroll: {
    paddingBottom: 10,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 6,
  },
  swatchItem: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchItemActive: {
    borderWidth: 3,
    borderColor: '#3B82F6',
    transform: [{ scale: 1.08 }],
  },
  slidersContent: {
    paddingBottom: 16,
    gap: 16,
  },
  sliderContainer: {
    gap: 6,
  },
  sliderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sliderValueText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sliderRowWithButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderTrackWrapper: {
    flex: 1,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
    top: -2,
  },
  bottomActionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  actionCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionApplyBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionApplyText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
