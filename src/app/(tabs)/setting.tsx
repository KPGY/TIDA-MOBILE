import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Palette, Check, RefreshCw, Smartphone, Layers, Info } from 'lucide-react-native';
import { useAppStore, ThemeColors } from '@/store/store';
import { resetDiaryDatabase } from '@/services/db';

interface PresetTheme {
  name: string;
  main: string;
  bubble: string;
  bg: string;
  panel: string;
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
];

const MAIN_COLOR_SWATCHES = [
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#10B981',
  '#06B6D4',
  '#475569',
];

export default function SettingScreen() {
  const {
    bgTheme,
    bubbleTheme,
    panelTheme,
    mainTheme,
    bgTextMode,
    messageOrder,
    startPage,
    setSingleColor,
    setMessageOrder,
    setStartPage,
    resetAll,
  } = useAppStore();

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';
  const cardBg = panelTheme;

  const applyPreset = (preset: PresetTheme) => {
    setSingleColor('mainTheme', preset.main);
    setSingleColor('bubbleTheme', preset.bubble);
    setSingleColor('bgTheme', preset.bg);
    setSingleColor('panelTheme', preset.panel);
  };

  const handleResetData = () => {
    Alert.alert(
      '데이터 초기화',
      '모든 타임라인 일기, 투두, 루틴 기록이 영구적으로 삭제됩니다. 계속하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 초기화',
          style: 'destructive',
          onPress: () => {
            try {
              resetDiaryDatabase();
              resetAll();
              Alert.alert('완료', '모든 데이터가 초기화되었습니다.');
            } catch (e) {
              Alert.alert('오류', '데이터를 초기화하는 중 문제가 발생했습니다.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>설정 및 커스터마이징</Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]}>
            나만의 취향대로 TIDA의 테마와 환경을 꾸며보세요 🎨
          </Text>
        </View>

        {/* 1. Preset Themes */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Palette size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>테마 프리셋</Text>
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
                    { backgroundColor: cardBg },
                    isCurrent && { borderColor: mainTheme, borderWidth: 2 },
                  ]}>
                  <View style={styles.presetColorCircles}>
                    <View style={[styles.colorDot, { backgroundColor: preset.bg }]} />
                    <View style={[styles.colorDot, { backgroundColor: preset.main }]} />
                    <View style={[styles.colorDot, { backgroundColor: preset.bubble }]} />
                  </View>
                  <Text style={[styles.presetName, { color: textColor }]}>{preset.name}</Text>
                  {isCurrent && <Check size={18} color={mainTheme} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Main Accent Color Swatches */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>포인트 컬러 (Main Color)</Text>
          <View style={styles.swatchGrid}>
            {MAIN_COLOR_SWATCHES.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => setSingleColor('mainTheme', color)}
                style={[styles.swatchBtn, { backgroundColor: color }]}>
                {mainTheme === color && <Check size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 3. General Preferences */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Layers size={18} color={mainTheme} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>화면 및 정렬 설정</Text>
          </View>

          <View style={[styles.settingBlock, { backgroundColor: cardBg }]}>
            {/* Timeline Message Order */}
            <View style={styles.settingRow}>
              <View>
                <Text style={[styles.settingRowLabel, { color: textColor }]}>
                  타임라인 메시지 순서
                </Text>
                <Text style={[styles.settingRowDesc, { color: subTextColor }]}>
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
                      messageOrder === 'top' ? { color: '#FFFFFF' } : { color: subTextColor },
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
                      messageOrder === 'bottom' ? { color: '#FFFFFF' } : { color: subTextColor },
                    ]}>
                    시간순(아래)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* 4. Data Reset */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <RefreshCw size={18} color="#EF4444" />
            <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>데이터 초기화</Text>
          </View>
          <TouchableOpacity style={styles.resetBtn} onPress={handleResetData}>
            <Text style={styles.resetBtnText}>전체 데이터 및 설정 초기화</Text>
          </TouchableOpacity>
        </View>

        {/* 5. App Info */}
        <View style={[styles.infoFooter, { borderTopColor: 'rgba(0,0,0,0.06)' }]}>
          <Text style={[styles.appVersion, { color: subTextColor }]}>TIDA Mobile v1.0.0</Text>
          <Text style={[styles.appCredits, { color: subTextColor }]}>
            기록이 일상이 되는 타임라인 다이어리 & 루틴 매니저
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetColorCircles: {
    flexDirection: 'row',
    gap: 6,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  presetName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginLeft: 14,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingBlock: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'column',
    gap: 12,
  },
  settingRowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingRowDesc: {
    fontSize: 12,
    marginTop: 2,
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
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  resetBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  infoFooter: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  appVersion: {
    fontSize: 13,
    fontWeight: '600',
  },
  appCredits: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
