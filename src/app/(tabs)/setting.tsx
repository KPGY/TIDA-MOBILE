import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Modal,
  Image,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/services/alert';
import {
  Palette,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Image as ImageIcon,
  Sliders,
  SlidersHorizontal,
  ChevronRight,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  Key,
  ShieldCheck,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore, ThemeColors, GradientColors, SavedTheme } from '@/store/store';
import { resetDiaryDatabase } from '@/services/db';
import { hexToRgba, getContrastMode } from '@/utils/colorHelper';
import { generateThemeFromSingleColor, autoMatchColorsFromImage } from '@/utils/autoColorMatcher';
import { AppBackground } from '@/components/AppBackground';
import { ColorPickerModal } from '@/components/ColorPickerModal';
import {
  signInWithGoogle,
  signOutGoogle,
  getStoredGoogleUser,
  getActiveClientId,
  saveCustomClientId,
  GoogleUser,
} from '@/services/googleAuth';
import {
  addSyncListener,
  performImmediateSync,
  SyncStatus,
} from '@/services/syncManager';

interface PresetTheme {
  name: string;
  main: string;
  bubble: string;
  bg: string;
  panel: string;
  gradient?: boolean;
  mainEnd?: string;
  bgEnd?: string;
}

const PRESET_THEMES: PresetTheme[] = [
  {
    name: '모던 화이트 (기본)',
    main: '#3B82F6',
    bubble: '#1E293B',
    bg: '#FFFFFF',
    panel: '#F8FAFC',
  },
  {
    name: '다크 미드나잇',
    main: '#60A5FA',
    bubble: '#1E293B',
    bg: '#0F172A',
    panel: '#1E293B',
  },
  {
    name: '라벤더 블룸',
    main: '#8B5CF6',
    bubble: '#581C87',
    bg: '#FAF5FF',
    panel: '#F3E8FF',
  },
  {
    name: '포레스트 그린',
    main: '#10B981',
    bubble: '#064E3B',
    bg: '#F0FDF4',
    panel: '#DCFCE7',
  },
  {
    name: '선셋 코랄',
    main: '#F97316',
    bubble: '#7C2D12',
    bg: '#FFF7ED',
    panel: '#FFEDD5',
  },
  {
    name: '사이버 네온',
    main: '#06B6D4',
    bubble: '#3B0764',
    bg: '#090D16',
    panel: '#111827',
  },
];

type ColorZoneKey = 'mainTheme' | 'bubbleTheme' | 'panelTheme' | 'bgTheme';
type GradientZoneKey = 'mainThemeEnd' | 'bubbleThemeEnd' | 'panelThemeEnd' | 'bgThemeEnd';

const COLOR_ZONE_CONFIG: Record<
  ColorZoneKey,
  { label: string; icon: string; endKey: GradientZoneKey }
> = {
  mainTheme: { label: '메인 포인트', icon: '🎨', endKey: 'mainThemeEnd' },
  bubbleTheme: { label: '말풍선', icon: '💬', endKey: 'bubbleThemeEnd' },
  panelTheme: { label: '카드/패널', icon: '🖼️', endKey: 'panelThemeEnd' },
  bgTheme: { label: '앱 배경', icon: '📱', endKey: 'bgThemeEnd' },
};

const PALETTE_SWATCHES: Record<ColorZoneKey, string[]> = {
  mainTheme: [
    '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
    '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#0EA5E9',
    '#14B8A6', '#64748B',
  ],
  bubbleTheme: [
    '#1E293B', '#0F172A', '#334155', '#312E81', '#581C87',
    '#701A75', '#881337', '#7C2D12', '#064E3B', '#134E4A',
    '#F1F5F9', '#FFFFFF',
  ],
  panelTheme: [
    '#F8FAFC', '#F1F5F9', '#FFFFFF', '#E2E8F0', '#F3E8FF',
    '#DCFCE7', '#FFEDD5', '#1E293B', '#111827', '#0F172A',
    '#1E1B4B', '#2E1065',
  ],
  bgTheme: [
    '#FFFFFF', '#F8FAFC', '#F0FDF4', '#FAF5FF', '#FFF7ED',
    '#F0F9FF', '#0F172A', '#090D16', '#18181B', '#0A0A0A',
    '#1E1E2E', '#172554',
  ],
};

export default function SettingScreen() {
  const {
    bgTheme,
    bubbleTheme,
    panelTheme,
    mainTheme,
    bgThemeEnd,
    bubbleThemeEnd,
    panelThemeEnd,
    mainThemeEnd,
    bgTextMode,
    panelTextMode,
    gradientMode,
    glassmorphismMode,
    bgAttachmentPath,
    bgOpacity,
    savedThemes,
    activeThemeId,
    messageOrder,
    setSingleColor,
    setSingleGradientColor,
    setGradientMode,
    setGlassmorphismMode,
    setbgAttachmentPath,
    setBgOpacity,
    saveCurrentTheme,
    applySavedTheme,
    deleteSavedTheme,
    setMessageOrder,
    resetAll,
  } = useAppStore();

  const [activeZone, setActiveZone] = useState<ColorZoneKey>('mainTheme');
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [themeNameInput, setThemeNameInput] = useState('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';

  const isPanelDark = panelTextMode === 'light';
  const cardTextColor = isPanelDark ? '#F8FAFC' : '#0F172A';
  const cardSubTextColor = isPanelDark ? '#94A3B8' : '#64748B';

  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, 0.78) : panelTheme;
  const cardBorder = glassmorphismMode
    ? isPanelDark
      ? 'rgba(255,255,255,0.18)'
      : 'rgba(0,0,0,0.1)'
    : 'rgba(0,0,0,0.06)';

  // 현재 선택된 영역의 색상값
  const currentColor = useAppStore((state) => state[activeZone]);
  const currentEndColor = useAppStore((state) => state[COLOR_ZONE_CONFIG[activeZone].endKey]);

  // 배경 이미지 선택 (갤러리)
  const handlePickBackgroundImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setbgAttachmentPath(result.assets[0].uri);
        showAlert('배경화면 설정 완료', '앱 배경으로 사진이 지정되었습니다 ✨');
      }
    } catch (e) {
      showAlert('오류', '사진을 불러오는 중 문제가 발생했습니다.');
    }
  };

  // 프리셋 적용
  const applyPreset = (preset: PresetTheme) => {
    setSingleColor('mainTheme', preset.main);
    setSingleColor('bubbleTheme', preset.bubble);
    setSingleColor('bgTheme', preset.bg);
    setSingleColor('panelTheme', preset.panel);
  };

  // 하이브리드 컬러 피커로부터 색상 적용
  const handleApplyColorFromPicker = (color: string, endColor?: string) => {
    setSingleColor(activeZone, color);
    if (endColor) {
      setSingleGradientColor(COLOR_ZONE_CONFIG[activeZone].endKey, endColor);
    }
  };

  // 마법봉: 배경 이미지(우선) 또는 배경색 기반 자동 조화 테마 생성
  const handleAutoHarmony = async (type: 'analogous' | 'complementary') => {
    try {
      setIsAnalyzingImage(true);
      let generated;

      if (bgAttachmentPath) {
        // 1. 배경 이미지가 지정되어 있는 경우: 이미지 픽셀 팔레트 추출 기반 생성
        generated = await autoMatchColorsFromImage(bgAttachmentPath, {
          harmonyType: type,
          glassmorphismMode,
          gradientMode,
        });
      } else {
        // 2. 배경 이미지가 없는 경우: 현재 배경색(bgTheme)을 일관된 기준으로 조화 테마 생성
        // 메인 색상이 바뀔 때마다 보색이 계속 튀는 현상을 방지하고 배경색 기준으로 일관성 유지
        generated = generateThemeFromSingleColor(bgTheme, {
          harmonyType: type,
          glassmorphismMode,
          gradientMode,
        });
      }

      setSingleColor('mainTheme', generated.mainTheme);
      setSingleColor('panelTheme', generated.panelTheme);
      setSingleColor('bubbleTheme', generated.bubbleTheme);
      setSingleColor('bgTheme', generated.bgTheme);

      setSingleGradientColor('mainThemeEnd', generated.mainThemeEnd);
      setSingleGradientColor('panelThemeEnd', generated.panelThemeEnd);
      setSingleGradientColor('bubbleThemeEnd', generated.bubbleThemeEnd);
      setSingleGradientColor('bgThemeEnd', generated.bgThemeEnd);

      const sourceLabel = bgAttachmentPath ? '배경 사진' : '배경색';
      showAlert(
        '조화 테마 적용',
        type === 'analogous'
          ? `🌿 ${sourceLabel}을 분석하여 차분한 톤온톤(유사색) 조화 테마가 적용되었습니다.`
          : `🎨 ${sourceLabel}을 분석하여 화사한 보색(대비) 테마가 적용되었습니다.`
      );
    } catch (e) {
      console.error(e);
      showAlert('오류', '색상을 분석하여 조화 테마를 생성하는 중 문제가 발생했습니다.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // 내 테마 저장
  const handleSaveTheme = () => {
    const name = themeNameInput.trim() || `내 테마 ${savedThemes.length + 1}`;
    saveCurrentTheme(name);
    setThemeNameInput('');
    setSaveModalVisible(false);
    showAlert('저장 완료', `'${name}' 테마가 저장되었습니다.`);
  };

  // Google Drive 연동 및 자동 동기화 상태
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await getStoredGoogleUser();
      setGoogleUser(user);
    })();

    const unsubscribe = addSyncListener((status, time) => {
      setSyncStatus(status);
      setLastSyncTime(time);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Google 로그인 핸들러
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.success && result.user) {
        setGoogleUser(result.user);
        performImmediateSync(); // 연동 즉시 백그라운드 동기화 1회 실행
      } else if (!result.cancelled && result.error) {
        showAlert('로그인 실패', result.error);
      }
    } catch (err: any) {
      showAlert('로그인 오류', err.message || '구글 로그인 중 문제가 발생했습니다.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Google 로그아웃 핸들러
  const handleGoogleLogout = () => {
    showAlert(
      '연동 해제',
      'Google 드라이브 자동 연동을 해제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          style: 'destructive',
          onPress: async () => {
            await signOutGoogle();
            setGoogleUser(null);
          },
        },
      ],
    );
  };

  // 수동 즉시 동기화 실행 (조용히 실행)
  const handleManualSync = async () => {
    if (syncStatus === 'syncing') return;
    await performImmediateSync();
  };

  // 전체 데이터 초기화
  const handleResetData = () => {
    showAlert(
      '데이터 초기화',
      '모든 타임라인 일기, 투두, 루틴 기록 및 커스텀 테마가 영구적으로 삭제됩니다. 계속하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 초기화',
          style: 'destructive',
          onPress: () => {
            try {
              resetDiaryDatabase();
              resetAll();
              showAlert('완료', '모든 데이터가 초기화되었습니다.');
            } catch (e) {
              showAlert('오류', '데이터를 초기화하는 중 문제가 발생했습니다.');
            }
          },
        },
      ],
    );
  };

  return (
    <AppBackground style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>설정 및 커스터마이징</Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]}>
            배경 사진부터 색상 테마까지 내 취향대로 꾸며보세요 🎨
          </Text>
        </View>

        {/* ====================================================
            1. 배경 화면 (Wallpapers) & 글래스모피즘
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <ImageIcon size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>배경 화면 이미지</Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* 이미지 미리보기 */}
            <View style={styles.bgPreviewRow}>
              {bgAttachmentPath ? (
                <Image source={{ uri: bgAttachmentPath }} style={styles.bgThumbnail} />
              ) : (
                <View
                  style={[
                    styles.bgEmptyThumbnail,
                    { backgroundColor: isPanelDark ? '#334155' : '#E2E8F0' },
                  ]}>
                  <ImageIcon size={28} color={cardSubTextColor} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.cardLabel, { color: cardTextColor }]}>
                  {bgAttachmentPath ? '지정된 배경 사진' : '지정된 사진 없음'}
                </Text>
                <Text style={[styles.cardDesc, { color: cardSubTextColor }]}>
                  스마트폰 앨범 속 사진을 앱 전체 배경으로 설정할 수 있습니다.
                </Text>
              </View>
            </View>

            {/* 버튼들 */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: mainTheme }]}
                onPress={handlePickBackgroundImage}>
                <ImageIcon size={16} color="#FFFFFF" />
                <Text style={styles.primaryActionBtnText}>
                  {bgAttachmentPath ? '사진 변경' : '갤러리에서 사진 선택'}
                </Text>
              </TouchableOpacity>

              {bgAttachmentPath ? (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: '#EF4444' }]}
                  onPress={() => setbgAttachmentPath(null)}>
                  <Trash2 size={16} color="#EF4444" />
                  <Text style={[styles.secondaryActionBtnText, { color: '#EF4444' }]}>제거</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 오버레이 투명도 조절 */}
            {bgAttachmentPath ? (
              <View style={styles.subSettingGroup}>
                <Text style={[styles.subSettingLabel, { color: cardTextColor }]}>
                  배경 틴트 불투명도 (글씨 가독성 조절)
                </Text>
                <View style={styles.opacityRow}>
                  {[0.25, 0.45, 0.65, 0.85].map((val) => {
                    const isSelected = Math.abs(bgOpacity - val) < 0.05;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setBgOpacity(val)}
                        style={[
                          styles.opacityBtn,
                          isSelected && { backgroundColor: mainTheme },
                        ]}>
                        <Text
                          style={[
                            styles.opacityBtnText,
                            isSelected ? { color: '#FFFFFF' } : { color: cardSubTextColor },
                          ]}>
                          {Math.round(val * 100)}%
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* 글래스모피즘 스위치 */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: cardTextColor }]}>
                  글래스모피즘 (반투명 카드)
                </Text>
                <Text style={[styles.cardDesc, { color: cardSubTextColor }]}>
                  카드를 반투명하게 만들어 배경 이미지가 은은하게 비치도록 합니다.
                </Text>
              </View>
              <Switch
                value={glassmorphismMode}
                onValueChange={(val) => setGlassmorphismMode(val)}
                trackColor={{ false: '#CBD5E1', true: mainTheme }}
              />
            </View>
          </View>
        </View>

        {/* ====================================================
            2. 4대 핵심 컬러 전체 커스터마이징
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Palette size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>컬러 전체 커스터마이징</Text>
          </View>

          {/* 영역 탭 (메인 / 말풍선 / 패널 / 배경) */}
          <View style={styles.zoneTabContainer}>
            {(Object.keys(COLOR_ZONE_CONFIG) as ColorZoneKey[]).map((zoneKey) => {
              const zone = COLOR_ZONE_CONFIG[zoneKey];
              const isSelected = activeZone === zoneKey;
              const zoneColor = useAppStore.getState()[zoneKey];

              return (
                <TouchableOpacity
                  key={zoneKey}
                  onPress={() => setActiveZone(zoneKey)}
                  style={[
                    styles.zoneTabBtn,
                    isSelected && { borderColor: mainTheme, backgroundColor: cardBg },
                  ]}>
                  <View style={[styles.zoneTabDot, { backgroundColor: zoneColor }]} />
                  <Text
                    style={[
                      styles.zoneTabText,
                      isSelected
                        ? { color: mainTheme, fontWeight: '700' }
                        : { color: subTextColor },
                    ]}>
                    {zone.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* 현재 색상 표시 & 컬러 피커 열기 버튼 */}
            <TouchableOpacity
              style={[
                styles.currentColorHeader,
                {
                  backgroundColor: isPanelDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)',
                  borderColor: cardBorder,
                },
              ]}
              onPress={() => setColorPickerVisible(true)}>
              <View style={styles.colorBadgeGroup}>
                <View style={[styles.currentColorBadge, { backgroundColor: currentColor }]} />
                {gradientMode && (
                  <View
                    style={[
                      styles.currentColorBadge,
                      styles.gradientOverlapBadge,
                      { backgroundColor: currentEndColor },
                    ]}
                  />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.cardLabel, { color: cardTextColor }]}>
                  {COLOR_ZONE_CONFIG[activeZone].label} {gradientMode ? '(그라데이션)' : ''}
                </Text>
                <Text style={[styles.cardDesc, { color: cardSubTextColor, fontFamily: 'monospace' }]}>
                  {gradientMode ? `${currentColor} → ${currentEndColor}` : currentColor}
                </Text>
              </View>
              <View style={[styles.pickerActionBadge, { borderColor: mainTheme }]}>
                <Sliders size={13} color={mainTheme} />
                <Text style={[styles.pickerActionBadgeText, { color: mainTheme }]}>피커 열기</Text>
              </View>
            </TouchableOpacity>

            {/* 빠른 추천 컬러 스와치 팔레트 */}
            <Text style={[styles.subSettingLabel, { color: cardTextColor, marginTop: 12 }]}>
              빠른 팔레트 선택
            </Text>
            <View style={styles.swatchGrid}>
              {PALETTE_SWATCHES[activeZone].map((hex) => {
                const isSelected = currentColor === hex;
                return (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => setSingleColor(activeZone, hex)}
                    style={[
                      styles.swatchBtn,
                      { backgroundColor: hex },
                      isSelected && styles.swatchBtnActive,
                    ]}>
                    {isSelected && (
                      <Check
                        size={16}
                        color={getContrastMode(hex) === 'light' ? '#FFFFFF' : '#000000'}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 정밀 슬라이더 & 확장 컬러 팔레트 모달 열기 카드 버튼 */}
            <TouchableOpacity
              style={[
                styles.openCustomPickerBtn,
                {
                  borderColor: mainTheme,
                  backgroundColor: isPanelDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                },
              ]}
              onPress={() => setColorPickerVisible(true)}>
              <Palette size={20} color={mainTheme} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.openCustomPickerTitle, { color: cardTextColor }]}>
                  컬러 피커 & 정밀 슬라이더
                </Text>
                <Text style={[styles.openCustomPickerDesc, { color: cardSubTextColor }]}>
                  테마별 감성 팔레트 및 색조/채도/명도 터치 조절
                </Text>
              </View>
              <ChevronRight size={18} color={cardSubTextColor} />
            </TouchableOpacity>

            {/* 마법봉 자동 조화 테마 생성기 */}
            <View style={styles.magicSection}>
              <Text style={[styles.subSettingLabel, { color: cardTextColor }]}>
                {bgAttachmentPath
                  ? '🖼️ 배경 사진 기반 스마트 조화 맞춤'
                  : '✨ 배경색 기준 원클릭 스마트 조화 맞춤'}
              </Text>
              <Text style={[styles.cardDesc, { color: cardSubTextColor, marginBottom: 10 }]}>
                {bgAttachmentPath
                  ? '배경 사진의 색상 팔레트를 분석하여 보색(대비) 및 유사색(톤온톤) 조화를 완벽하게 맞춰줍니다.'
                  : '색상 조화 이론에 따라 배경색을 기준으로 4개 영역 색상을 자동으로 한번에 맞춰줍니다.'}
              </Text>
              <View style={styles.magicBtnRow}>
                <TouchableOpacity
                  style={[styles.magicBtn, { borderColor: mainTheme }, isAnalyzingImage && { opacity: 0.6 }]}
                  disabled={isAnalyzingImage}
                  onPress={() => handleAutoHarmony('analogous')}>
                  {isAnalyzingImage ? (
                    <ActivityIndicator size="small" color={mainTheme} />
                  ) : (
                    <>
                      <Sparkles size={16} color={mainTheme} />
                      <Text style={[styles.magicBtnText, { color: mainTheme }]}>
                        톤온톤(유사색) 맞춤
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.magicBtn, { borderColor: mainTheme }, isAnalyzingImage && { opacity: 0.6 }]}
                  disabled={isAnalyzingImage}
                  onPress={() => handleAutoHarmony('complementary')}>
                  {isAnalyzingImage ? (
                    <ActivityIndicator size="small" color={mainTheme} />
                  ) : (
                    <>
                      <Palette size={16} color={mainTheme} />
                      <Text style={[styles.magicBtnText, { color: mainTheme }]}>
                        보색(대비) 맞춤
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* 그라데이션 모드 토글 */}
            <View style={[styles.toggleRow, { marginTop: 16, borderTopWidth: 1, borderTopColor: cardBorder, paddingTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: cardTextColor }]}>그라데이션 모드</Text>
                <Text style={[styles.cardDesc, { color: cardSubTextColor }]}>
                  각 요소에 은은한 듀오톤 그라데이션을 적용합니다.
                </Text>
              </View>
              <Switch
                value={gradientMode}
                onValueChange={(val) => setGradientMode(val)}
                trackColor={{ false: '#CBD5E1', true: mainTheme }}
              />
            </View>
          </View>
        </View>

        {/* ====================================================
            3. 나만의 테마 저장 & 보관함
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Sliders size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>나만의 커스텀 테마 보관함</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveThemeBtn, { backgroundColor: mainTheme }]}
            onPress={() => setSaveModalVisible(true)}>
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.saveThemeBtnText}>현재 스타일을 '내 테마'로 저장</Text>
          </TouchableOpacity>

          {savedThemes.length > 0 ? (
            <View style={styles.savedThemeList}>
              {savedThemes.map((theme) => {
                const isActive = activeThemeId === theme.id;
                return (
                  <View
                    key={theme.id}
                    style={[
                      styles.savedThemeCard,
                      { backgroundColor: cardBg, borderColor: isActive ? mainTheme : cardBorder },
                    ]}>
                    <View style={styles.presetColorCircles}>
                      <View style={[styles.colorDot, { backgroundColor: theme.bgTheme }]} />
                      <View style={[styles.colorDot, { backgroundColor: theme.mainTheme }]} />
                      <View style={[styles.colorDot, { backgroundColor: theme.panelTheme }]} />
                      <View style={[styles.colorDot, { backgroundColor: theme.bubbleTheme }]} />
                    </View>
                    <Text style={[styles.presetName, { color: cardTextColor }]}>{theme.name}</Text>

                    <TouchableOpacity
                      onPress={() => applySavedTheme(theme.id)}
                      style={[
                        styles.themeActionBtn,
                        { backgroundColor: isActive ? mainTheme : 'rgba(0,0,0,0.06)' },
                      ]}>
                      <Text
                        style={[
                          styles.themeActionBtnText,
                          { color: isActive ? '#FFFFFF' : cardTextColor },
                        ]}>
                        {isActive ? '적용중' : '적용'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => deleteSavedTheme(theme.id)}
                      style={styles.deleteThemeBtn}>
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyThemeText, { color: subTextColor }]}>
              아직 저장된 커스텀 테마가 없습니다. 나만의 색조합을 저장해보세요!
            </Text>
          )}
        </View>

        {/* ====================================================
            4. 기본 테마 프리셋
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <SlidersHorizontal size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>기본 테마 프리셋</Text>
          </View>

          <View style={styles.presetList}>
            {PRESET_THEMES.map((preset) => {
              const isCurrent =
                preset.main === mainTheme &&
                preset.bg === bgTheme &&
                preset.panel === panelTheme;

              return (
                <TouchableOpacity
                  key={preset.name}
                  onPress={() => applyPreset(preset)}
                  style={[
                    styles.presetCard,
                    { backgroundColor: cardBg, borderColor: isCurrent ? mainTheme : cardBorder },
                  ]}>
                  <View style={styles.presetColorCircles}>
                    <View style={[styles.colorDot, { backgroundColor: preset.bg }]} />
                    <View style={[styles.colorDot, { backgroundColor: preset.main }]} />
                    <View style={[styles.colorDot, { backgroundColor: preset.bubble }]} />
                  </View>
                  <Text style={[styles.presetName, { color: cardTextColor }]}>{preset.name}</Text>
                  {isCurrent && <Check size={18} color={mainTheme} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ====================================================
            5. 정렬 및 앱 일반 설정
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Layers size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>화면 및 정렬 설정</Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.settingRow}>
              <View>
                <Text style={[styles.cardLabel, { color: cardTextColor }]}>
                  타임라인 메시지 순서
                </Text>
                <Text style={[styles.cardDesc, { color: cardSubTextColor }]}>
                  {messageOrder === 'top' ? '최신 글이 맨 위에 표시' : '최신 글이 맨 아래에 표시'}
                </Text>
              </View>
              <View style={styles.toggleSegment}>
                <TouchableOpacity
                  onPress={() => setMessageOrder('top')}
                  style={[
                    styles.segmentBtn,
                    messageOrder === 'top' && { backgroundColor: mainTheme },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      messageOrder === 'top' ? { color: '#FFFFFF' } : { color: cardSubTextColor },
                    ]}>
                    최신순(위)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMessageOrder('bottom')}
                  style={[
                    styles.segmentBtn,
                    messageOrder === 'bottom' && { backgroundColor: mainTheme },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      messageOrder === 'bottom' ? { color: '#FFFFFF' } : { color: cardSubTextColor },
                    ]}>
                    시간순(아래)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ====================================================
            6. 클라우드 연동 및 백업 (Google Drive)
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Cloud size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>구글 드라이브 연동 & 백업</Text>
          </View>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* 구글 계정 상태 */}
            {googleUser ? (
              <View style={styles.googleUserRow}>
                <View style={styles.googleUserInfo}>
                  {googleUser.picture ? (
                    <Image source={{ uri: googleUser.picture }} style={styles.googleAvatar} />
                  ) : (
                    <View style={[styles.googleAvatarFallback, { backgroundColor: mainTheme }]}>
                      <Text style={styles.googleAvatarLetter}>
                        {(googleUser.name || googleUser.email || 'G')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.googleUserName, { color: cardTextColor }]}>
                        {googleUser.name}
                      </Text>
                      <View style={styles.connectedBadge}>
                        <ShieldCheck size={12} color="#10B981" />
                        <Text style={styles.connectedBadgeText}>연동됨</Text>
                      </View>
                    </View>
                    <Text style={[styles.googleUserEmail, { color: cardSubTextColor }]}>
                      {googleUser.email}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.disconnectBtn, { borderColor: isPanelDark ? '#334155' : '#E2E8F0' }]}
                  onPress={handleGoogleLogout}
                  activeOpacity={0.7}>
                  <LogOut size={13} color="#EF4444" />
                  <Text style={styles.disconnectBtnText}>해제</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.googleLoginCard}>
                <Text style={[styles.cardDesc, { color: cardSubTextColor, marginBottom: 14, lineHeight: 18 }]}>
                  Google Drive를 연동하여 PC 버전과 모바일 간에 타임라인(일기 및 사진), 투두, 루틴 데이터를 클라우드로 안전하게 백업 및 복원할 수 있습니다. (테마 및 개인 설정값은 기기별로 유지됩니다.)
                </Text>
                <TouchableOpacity
                  style={[styles.googleLoginBtn, { backgroundColor: mainTheme }]}
                  onPress={handleGoogleLogin}
                  disabled={isGoogleLoading}
                  activeOpacity={0.8}>
                  {isGoogleLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Cloud size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.googleLoginBtnText}>Google 계정으로 연동하기</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 백업 및 복원 버튼 (연동된 경우 활성화) */}
            {/* 자동 동기화 상태 영역 (연동된 경우 활성화) */}
            {googleUser && (
              <View style={[styles.driveActionsContainer, { borderTopColor: isPanelDark ? '#334155' : '#E2E8F0' }]}>
                {/* 실시간 동기화 상태 뱃지 */}
                <View style={[styles.syncStatusCard, { backgroundColor: isPanelDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    {syncStatus === 'syncing' ? (
                      <ActivityIndicator size="small" color={mainTheme} />
                    ) : syncStatus === 'synced' ? (
                      <Check size={16} color="#10B981" />
                    ) : syncStatus === 'error' ? (
                      <Text style={{ fontSize: 14 }}>⚠️</Text>
                    ) : (
                      <Cloud size={16} color={mainTheme} />
                    )}
                    <Text style={[styles.syncStatusTitle, { color: cardTextColor }]}>
                      {syncStatus === 'syncing'
                        ? '클라우드와 동기화 중...'
                        : syncStatus === 'synced'
                          ? '모든 데이터가 최신 상태입니다'
                          : syncStatus === 'error'
                            ? '동기화 일시 오류 (재시도 대기)'
                            : '실시간 자동 동기화 활성화됨'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.manualSyncBtn, { borderColor: cardBorder }]}
                    onPress={handleManualSync}
                    disabled={syncStatus === 'syncing'}
                    activeOpacity={0.7}>
                    <RefreshCw
                      size={13}
                      color={syncStatus === 'syncing' ? cardSubTextColor : mainTheme}
                    />
                    <Text
                      style={[
                        styles.manualSyncBtnText,
                        { color: syncStatus === 'syncing' ? cardSubTextColor : mainTheme },
                      ]}>
                      지금 동기화
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 동기화 안내 및 마지막 동기화 시간 */}
                <View style={styles.syncFooterRow}>
                  <Text style={[styles.syncFooterText, { color: cardSubTextColor }]}>
                    {lastSyncTime
                      ? `마지막 동기화: ${new Date(lastSyncTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : '동기화 대기 중'}
                  </Text>
                  <Text style={[styles.syncNoticeText, { color: cardSubTextColor }]}>
                    타임라인, 사진, 투두, 루틴 자동 연동 중
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ====================================================
            7. 데이터 초기화
           ==================================================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <RefreshCw size={18} color="#EF4444" />
            <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>데이터 초기화</Text>
          </View>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.cardDesc, { color: cardSubTextColor, marginBottom: 14, lineHeight: 18 }]}>
              모든 타임라인 일기, 투두 및 루틴 기록과 테마 설정을 초기 상태로 되돌립니다.
            </Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleResetData}
              activeOpacity={0.8}>
              <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.resetBtnText}>전체 데이터 및 설정 초기화</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 하단 버전 정보 */}
        <View style={styles.infoFooter}>
          <View
            style={[
              styles.versionBadge,
              {
                backgroundColor: glassmorphismMode ? hexToRgba(panelTheme, 0.75) : panelTheme,
                borderColor: cardBorder,
              },
            ]}>
            <Text style={[styles.appBrand, { color: cardTextColor }]}>TIDA</Text>
            <View
              style={[
                styles.versionDivider,
                { backgroundColor: isPanelDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
              ]}
            />
            <Text style={[styles.appVersion, { color: mainTheme }]}>v1.0.0</Text>
          </View>
          <Text
            style={[
              styles.appCredits,
              {
                color: subTextColor,
                textShadowColor: isBgDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              },
            ]}>
            기록이 일상이 되는 타임라인 다이어리 & 루틴 매니저
          </Text>
        </View>
      </ScrollView>

      {/* 테마 저장 모달 */}
      <Modal visible={saveModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: panelTheme }]}>
            <Text style={[styles.modalTitle, { color: cardTextColor }]}>내 테마로 저장</Text>
            <Text style={[styles.modalSubtitle, { color: cardSubTextColor }]}>
              현재 적용된 색상과 배경 조합을 저장합니다.
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: cardTextColor,
                  borderColor: isPanelDark ? '#334155' : '#E2E8F0',
                  backgroundColor: isPanelDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
                },
              ]}
              placeholder="테마 이름을 입력하세요 (예: 봄날 벚꽃)"
              placeholderTextColor={cardSubTextColor}
              value={themeNameInput}
              onChangeText={setThemeNameInput}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSaveModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: mainTheme }]}
                onPress={handleSaveTheme}>
                <Text style={styles.modalConfirmBtnText}>저장하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 하이브리드 컬러 피커 모달 */}
      <ColorPickerModal
        visible={colorPickerVisible}
        onClose={() => setColorPickerVisible(false)}
        title={`${COLOR_ZONE_CONFIG[activeZone].label} 색상 선택`}
        initialColor={currentColor}
        initialEndColor={currentEndColor}
        gradientMode={gradientMode}
        onApply={handleApplyColorFromPicker}
        isDarkTheme={isBgDark}
      />
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  bgPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  bgThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  bgEmptyThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  subSettingGroup: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  subSettingLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  opacityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  opacityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  opacityBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  zoneTabContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  zoneTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  zoneTabDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  zoneTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  currentColorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  colorBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentColorBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  gradientOverlapBadge: {
    marginLeft: -14,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pickerActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerActionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  swatchBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  swatchBtnActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  openCustomPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 14,
  },
  openCustomPickerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  openCustomPickerDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  magicSection: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
    padding: 12,
  },
  magicBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  magicBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  magicBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveThemeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  saveThemeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  savedThemeList: {
    gap: 8,
  },
  savedThemeCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  themeActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  themeActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteThemeBtn: {
    padding: 6,
  },
  emptyThemeText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  presetList: {
    gap: 10,
  },
  presetCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
  },
  presetColorCircles: {
    flexDirection: 'row',
    gap: 6,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  presetName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginLeft: 12,
  },
  settingRow: {
    flexDirection: 'column',
    gap: 12,
  },
  toggleSegment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resetBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DC2626',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  infoFooter: {
    marginTop: 28,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  appBrand: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  versionDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 8,
  },
  appVersion: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  appCredits: {
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  googleUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  googleUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  googleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  googleAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  googleUserName: {
    fontSize: 15,
    fontWeight: '700',
  },
  googleUserEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  connectedBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  disconnectBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  googleLoginCard: {
    paddingVertical: 4,
  },
  googleLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  googleLoginBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  driveActionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  syncStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  syncStatusTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  manualSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  manualSyncBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncFooterRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  syncFooterText: {
    fontSize: 11,
  },
  syncNoticeText: {
    fontSize: 11,
  },
  clientIdConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  clientIdConfigText: {
    fontSize: 12,
    flex: 1,
    marginLeft: 6,
  },
});
