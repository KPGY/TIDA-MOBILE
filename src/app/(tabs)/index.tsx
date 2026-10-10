import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/services/alert';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Image as ImageIcon,
  Trash2,
  Search,
  X,
  Calendar,
  RotateCcw,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';
import { AppBackground } from '@/components/AppBackground';
import { CalendarPickerModal } from '@/components/CalendarPickerModal';
import {
  saveDiary,
  getDiaryByDate,
  searchDiary,
  deleteDiary,
  DiaryItem,
  Attachment,
} from '@/services/db';
import { getTodayStr, DAYS_LABEL } from '@/utils/routineHelper';
import { useFocusEffect } from 'expo-router';
import { triggerAutoSync, onSyncDataPulled } from '@/services/syncManager';
import { deleteMediaFileFromDrive } from '@/services/googleDrive';
import { getValidAccessToken } from '@/services/googleAuth';

interface AdaptiveImageProps {
  uri: string;
  fileName?: string;
  onPress: () => void;
  hasText: boolean;
  maxAvailableWidth: number;
}

const AdaptiveImage: React.FC<AdaptiveImageProps> = ({
  uri,
  fileName,
  onPress,
  hasText,
  maxAvailableWidth,
}) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: maxAvailableWidth,
    height: Math.min(200, maxAvailableWidth),
  });
  const [resolvedUri, setResolvedUri] = useState<string>(uri);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;

    const attDir = `${FileSystem.documentDirectory}attachments/`;
    const fName = fileName || uri?.split(/[/\\]/).pop();
    const candidateLocalUri = fName ? `${attDir}${fName}` : uri;

    const calculateSize = (targetUri: string) => {
      Image.getSize(
        targetUri,
        (w, h) => {
          if (!isMounted || w <= 0 || h <= 0) return;
          const ratio = w / h;
          const maxWidth = maxAvailableWidth;
          const maxHeight = 280;

          if (ratio >= 1) {
            const targetWidth = maxWidth;
            const targetHeight = Math.max(100, Math.min(maxHeight, targetWidth / ratio));
            setDimensions({ width: targetWidth, height: targetHeight });
          } else {
            const targetHeight = Math.min(maxHeight, 260);
            const rawWidth = targetHeight * ratio;
            const targetWidth = Math.max(100, Math.min(maxWidth, rawWidth));
            const adjustedHeight = targetWidth / ratio;
            setDimensions({
              width: targetWidth,
              height: Math.min(maxHeight, adjustedHeight),
            });
          }
        },
        () => {
          if (isMounted) {
            setDimensions({ width: maxAvailableWidth, height: 180 });
          }
        }
      );
    };

    const verifyAndLoad = async () => {
      try {
        // 1. 현재 기기의 attachments 디렉토리 경로 확인
        if (candidateLocalUri) {
          const info = await FileSystem.getInfoAsync(candidateLocalUri);
          if (info.exists) {
            if (isMounted) {
              setResolvedUri(candidateLocalUri);
              setIsLoading(false);
              setHasError(false);
              calculateSize(candidateLocalUri);
            }
            return;
          }
        }

        // 2. 기존 uri (file:// 등) 확인
        if (uri && uri !== candidateLocalUri && uri.startsWith('file://')) {
          const info = await FileSystem.getInfoAsync(uri);
          if (info.exists) {
            if (isMounted) {
              setResolvedUri(uri);
              setIsLoading(false);
              setHasError(false);
              calculateSize(uri);
            }
            return;
          }
        }
      } catch (_) {}

      // 3. 파일이 아직 디스크에 없는 경우 (동기화로 다운로드 진행 중)
      if (isMounted) {
        if (pollCount < 12) {
          pollCount++;
          setIsLoading(true);
          pollTimer = setTimeout(verifyAndLoad, 1500);
        } else {
          setIsLoading(false);
          setHasError(true);
        }
      }
    };

    verifyAndLoad();

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [uri, fileName, maxAvailableWidth]);

  if (isLoading) {
    return (
      <View
        style={[
          styles.adaptiveImageWrapper,
          {
            width: dimensions.width,
            height: 120,
            marginTop: hasText ? 8 : 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.06)',
            borderRadius: 12,
          },
        ]}>
        <ActivityIndicator size="small" color="#94A3B8" />
        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '500' }}>
          사진 동기화 중...
        </Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          setHasError(false);
          setIsLoading(true);
        }}
        style={[
          styles.adaptiveImageWrapper,
          {
            width: dimensions.width,
            height: 80,
            marginTop: hasText ? 8 : 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.05)',
            borderRadius: 12,
            padding: 8,
          },
        ]}>
        <ImageIcon size={20} color="#94A3B8" />
        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
          사진을 불러올 수 없습니다 (터치하여 재시도)
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.adaptiveImageWrapper,
        {
          width: dimensions.width,
          maxWidth: '100%',
          height: dimensions.height,
          marginTop: hasText ? 8 : 0,
        },
      ]}>
      <Image
        source={{ uri: resolvedUri }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12,
        }}
        resizeMode="contain"
        onError={() => setHasError(true)}
      />
    </TouchableOpacity>
  );
};

export default function TimelineScreen() {
  const {
    bgTheme,
    bubbleTheme,
    panelTheme,
    mainTheme,
    bgTextMode,
    bubbleTextMode,
    panelTextMode,
    messageOrder,
    glassmorphismMode,
  } = useAppStore();

  const [currentDate, setCurrentDate] = useState<string>(getTodayStr());
  const [entries, setEntries] = useState<DiaryItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Search state
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<DiaryItem[]>([]);

  // Calendar modal state
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);

  // Image preview modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';

  const isBubbleDark = bubbleTextMode === 'light';
  const bubbleTextColor = isBubbleDark ? '#FFFFFF' : '#0F172A';
  const bubbleSubTextColor = isBubbleDark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.65)';

  const isPanelDark = panelTextMode === 'light';
  const cardTextColor = isPanelDark ? '#F8FAFC' : '#0F172A';
  const cardSubTextColor = isPanelDark ? '#94A3B8' : '#64748B';

  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, 0.85) : panelTheme;
  const bubbleBg = glassmorphismMode ? hexToRgba(bubbleTheme, 0.88) : bubbleTheme;

  const { width: windowWidth } = useWindowDimensions();
  // 양쪽 패딩(28px) + 시간 뱃지(~54px) + 삭제 버튼(~26px) + 안전 여백(18px) = 126 제외하여 우측 프레임 밖 튀어나감 완전 방지
  const availableWidth = windowWidth - 28;
  const maxBubbleWidth = Math.max(160, Math.min(availableWidth - 98, 255));

  const [listHeight, setListHeight] = useState<number>(0);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const isBottomOrder = messageOrder === 'bottom';

  // 각 항목의 실제 높이를 계산하여(사진: 220px, 텍스트 줄수 기반), 메시지가 화면을 채우지 않을 때
  // 카카오톡처럼 입력창 바로 위(하단)부터 자연스럽게 쌓이도록 판별
  const contentWeight = entries.reduce((acc, item) => {
    let attCount = 0;
    if (item.attachmentsJson) {
      try {
        const atts = JSON.parse(item.attachmentsJson);
        if (Array.isArray(atts)) attCount = atts.length;
      } catch (_) {}
    }
    const lineBreaks = item.content ? item.content.split('\n').length : 0;
    const charLines = item.content ? Math.ceil(item.content.length / 18) : 0;
    const textLines = Math.max(lineBreaks, charLines);
    const itemHeight = Math.max(42, textLines * 22 + 20) + (attCount * 220) + 12;
    return acc + itemHeight;
  }, 0);

  // 타임라인 순서(최신순/시간순)와 상관없이, 메시지가 화면 높이를 다 채우지 못할 때는
  // 항상 카카오톡처럼 화면 하단(입력창 바로 위)에 메시지가 착 붙어있도록 처리
  const isContentShort =
    contentHeight > 0
      ? contentHeight < (listHeight ? listHeight - 20 : 550)
      : contentWeight < (listHeight ? listHeight - 40 : 550);

  const shouldAlignBottom = !isSearching && entries.length > 0 && isContentShort;

  // Load entries for current date
  const loadEntries = useCallback(() => {
    try {
      const list = getDiaryByDate(currentDate);
      if (messageOrder === 'bottom') {
        // Oldest at top, newest at bottom (시간순: 과거 위, 최신 아래)
        setEntries(list);
      } else {
        // Newest at top, oldest at bottom (최신순: 최신 위, 과거 아래)
        setEntries([...list].reverse());
      }
    } catch (e) {
      console.error('Error loading diary entries:', e);
    }
  }, [currentDate, messageOrder]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // 날짜 변경 또는 초기 로드 시 카톡처럼 최신 메시지 위치로 자동 이동
  useEffect(() => {
    if (entries.length > 0) {
      const timer = setTimeout(() => {
        // [중요] 메시지가 화면 높이를 다 채우지 않을 때는 이미 flex-end로 하단에 붙어있으므로
        // scrollToEnd를 부르면 flex-end와 오프셋 충돌이 일어나 화면 밖으로 밀려 공란이 되는 현상 방지
        if (shouldAlignBottom) return;

        if (messageOrder === 'bottom') {
          // 시간순(아래): 최신글이 맨 아래에 있으므로 아래로 스크롤
          flatListRef.current?.scrollToEnd({ animated: false });
        } else {
          // 최신순(위): 최신글이 맨 위에 있으므로 맨 위(offset 0)로 스크롤
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [currentDate, messageOrder, entries.length, shouldAlignBottom]);

  // 탭 포커스 시 최신 일기 자동 리로드
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  // 백그라운드 동기화 완료 시 실시간 타임라인 자동 갱신
  useEffect(() => {
    const unsub = onSyncDataPulled(() => {
      loadEntries();
    });
    return unsub;
  }, [loadEntries]);

  // 키보드가 올라올 때 최신 메시지 위치로 자동 스크롤
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        if (entries.length > 0 && flatListRef.current) {
          if (messageOrder === 'bottom') {
            flatListRef.current.scrollToEnd({ animated: true });
          } else {
            flatListRef.current.scrollToOffset({ offset: 0, animated: true });
          }
        }
      }, 100);
    });
    return () => sub.remove();
  }, [entries.length, messageOrder]);

  // Date Navigation
  const changeDate = (offset: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const parts = currentDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + offset);
    setCurrentDate(getTodayStr(d));
  };

  const jumpToToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(getTodayStr());
  };

  const getDayLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return DAYS_LABEL[d.getDay()];
    } catch (e) {
      return '';
    }
  };

  // Image Pick
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const rawUri = asset.uri;
        // 1200px 초과 고해상도 사진만 비율 유지 리사이징 및 용량 최적화 (노크롭)
        try {
          const actions = asset.width && asset.width > 1200 ? [{ resize: { width: 1200 } }] : [];
          const manipResult = await ImageManipulator.manipulateAsync(
            rawUri,
            actions,
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
          );
          setSelectedImage(manipResult.uri);
        } catch {
          setSelectedImage(rawUri);
        }
      }
    } catch (error) {
      showAlert('사진 선택 오류', '갤러리에서 사진을 불러오는 중 오류가 발생했습니다.');
    }
  };

  // Save Memo
  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let attachmentsJson: string | null = null;
    if (selectedImage) {
      try {
        const attDir = `${FileSystem.documentDirectory}attachments/`;
        const dirInfo = await FileSystem.getInfoAsync(attDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(attDir, { intermediates: true });
        }
        const ext = selectedImage.split('.').pop() || 'jpg';
        const fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const targetPath = `${attDir}${fileName}`;
        await FileSystem.copyAsync({ from: selectedImage, to: targetPath });

        const attachments: Attachment[] = [
          {
            filePath: targetPath,
            fileName: fileName,
          },
        ];
        attachmentsJson = JSON.stringify(attachments);
      } catch (err) {
        console.warn('Failed to copy attachment permanently, fallback to original:', err);
        const attachments: Attachment[] = [
          {
            filePath: selectedImage,
            fileName: selectedImage.split('/').pop() || 'image.jpg',
          },
        ];
        attachmentsJson = JSON.stringify(attachments);
      }
    }

    try {
      saveDiary(trimmed, currentDate, timeStr, attachmentsJson);
      // 사진이 있으면 즉시(0ms), 텍스트만 있으면 500ms 후 빠르게 클라우드 동기화하여 탭 전환 시 누락 방지
      triggerAutoSync(selectedImage ? 0 : 500);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setInputText('');
      setSelectedImage(null);
      loadEntries();
      setTimeout(() => {
        if (flatListRef.current && !shouldAlignBottom) {
          if (messageOrder === 'bottom') {
            flatListRef.current.scrollToEnd({ animated: true });
          } else {
            flatListRef.current.scrollToOffset({ offset: 0, animated: true });
          }
        }
      }, 100);
    } catch (e) {
      showAlert('저장 실패', '메모를 저장하지 못했습니다.');
    }
  };

  // Delete Memo
  const handleDelete = (id: number) => {
    showAlert('삭제 확인', '이 타임라인 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          try {
            const deletedFiles = deleteDiary(id);
            triggerAutoSync();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            loadEntries();
            if (isSearching) {
              handleSearch(searchQuery);
            }

            // 백그라운드에서 구글 드라이브 tida-media 폴더의 사진 파일 정리
            if (deletedFiles && deletedFiles.length > 0) {
              (async () => {
                try {
                  const token = await getValidAccessToken();
                  if (token) {
                    for (const fName of deletedFiles) {
                      await deleteMediaFileFromDrive(token, fName);
                    }
                  }
                } catch (_) {}
              })();
            }
          } catch (e) {
            showAlert('삭제 오류', '기록을 삭제하지 못했습니다.');
          }
        },
      },
    ]);
  };

  // Search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const results = searchDiary(query);
      setSearchResults(results);
    } catch (e) {
      console.error('Search error:', e);
    }
  };

  const renderDiaryItem = ({ item }: { item: DiaryItem }) => {
    let attachments: Attachment[] = [];
    if (item.attachmentsJson) {
      try {
        attachments = JSON.parse(item.attachmentsJson);
      } catch (e) {}
    }

    const hasText = Boolean(item.content?.trim());
    if (!hasText && attachments.length === 0) {
      return null;
    }

    const isImageOnly = !hasText && attachments.length > 0;
    const bubblePadding = isImageOnly ? 8 : 24;
    const contentBubbleWidth = Math.max(100, maxBubbleWidth - bubblePadding);

    return (
      <View style={styles.messageRow}>
        {/* 1. 시간 뱃지 (PC버전과 동일한 좌측 하단 반투명 알약 뱃지) */}
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>
            {isSearching ? `${item.date.substring(2)} ${item.time}` : item.time}
          </Text>
        </View>

        {/* 2. 대화형 말풍선 (PC버전 동일 말풍선 디자인 & 길이에 맞춘 가변 너비) */}
        <TouchableOpacity
          activeOpacity={0.92}
          onLongPress={() => handleDelete(item.id)}
          style={[
            styles.speechBubble,
            { backgroundColor: bubbleBg },
            glassmorphismMode && styles.glassBubble,
            isImageOnly && styles.imageOnlyBubble,
            { maxWidth: maxBubbleWidth },
          ]}>
          {hasText ? (
            <Text
              style={[
                styles.bubbleText,
                {
                  color: bubbleTextColor,
                  textShadowColor: isBubbleDark ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.4)',
                  textShadowOffset: { width: 0, height: 0.5 },
                  textShadowRadius: 1,
                },
              ]}>
              {item.content}
            </Text>
          ) : null}

          {/* 사진 썸네일 (원본 비율 완벽 유지 & 짤림 방지 노크롭) */}
          {attachments.map((att, idx) => {
            const attDir = `${FileSystem.documentDirectory}attachments/`;
            const fileName = att.fileName || att.filePath?.split(/[/\\]/).pop();
            const normalizedUri = fileName ? `${attDir}${fileName}` : att.filePath;
            return (
              <AdaptiveImage
                key={fileName ? `${fileName}_${idx}` : `${att.filePath}_${idx}`}
                uri={normalizedUri}
                fileName={fileName}
                onPress={() => setPreviewImageUrl(normalizedUri)}
                hasText={hasText}
                maxAvailableWidth={contentBubbleWidth}
              />
            );
          })}
        </TouchableOpacity>

        {/* 3. 삭제 버튼 (말풍선 우측 하단 정렬 원형 X 버튼) */}
        <TouchableOpacity
          style={styles.deleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => handleDelete(item.id)}>
          <X size={11} color="rgba(255, 255, 255, 0.85)" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    );
  };

  const isToday = currentDate === getTodayStr();

  return (
    <AppBackground style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        {/* Top Header & Date Navigation */}
        <View style={[styles.header, { backgroundColor: cardBg }]}>
          {isSearching ? (
            <View style={styles.searchBarContainer}>
              <Search size={18} color={cardSubTextColor} />
              <TextInput
                style={[styles.searchInput, { color: cardTextColor }]}
                placeholder="타임라인 내용 검색..."
                placeholderTextColor={cardSubTextColor}
                value={searchQuery}
                onChangeText={handleSearch}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}>
                <X size={20} color={cardSubTextColor} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dateNavRow}>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  onPress={() => changeDate(-1)}
                  style={styles.navArrow}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="이전 날짜">
                  <ChevronLeft size={22} color={cardTextColor} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsCalendarOpen(true)}
                  style={styles.dateTextButton}
                  activeOpacity={0.7}
                  accessibilityLabel="달력 열기">
                  <Text style={[styles.dateText, { color: cardTextColor }]}>
                    {currentDate}
                  </Text>
                  <Text style={[styles.dayLabelText, { color: cardSubTextColor }]}>
                    ({getDayLabel(currentDate)})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => changeDate(1)}
                  style={styles.navArrow}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="다음 날짜">
                  <ChevronRight size={22} color={cardTextColor} />
                </TouchableOpacity>
              </View>

              <View style={styles.headerRightActions}>
                {!isToday && (
                  <TouchableOpacity
                    style={[
                      styles.todayButton,
                      {
                        backgroundColor: hexToRgba(mainTheme, 0.12),
                        borderColor: hexToRgba(mainTheme, 0.3),
                      },
                    ]}
                    onPress={jumpToToday}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityLabel="오늘 날짜로 돌아가기">
                    <RotateCcw size={12} color={mainTheme} style={{ marginRight: 4 }} />
                    <Text style={[styles.todayButtonText, { color: mainTheme }]}>오늘</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => setIsCalendarOpen(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="달력 열기">
                  <Calendar size={20} color={cardTextColor} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => setIsSearching(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="검색 열기">
                  <Search size={20} color={cardTextColor} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Timeline Entries List */}
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={isSearching ? searchResults : entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDiaryItem}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentHeight(h)}
          contentContainerStyle={[
            styles.listContent,
            { flexGrow: 1 },
            shouldAlignBottom && { justifyContent: 'flex-end' },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text
                style={[
                  styles.emptyText,
                  {
                    color: subTextColor,
                    textShadowColor: isBgDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  },
                ]}>
                {isSearching
                  ? '검색 결과가 없습니다.'
                  : '이 날짜에 작성된 기록이 없습니다.\n아래 입력창에 첫 생각을 남겨보세요 ✨'}
              </Text>
            </View>
          }
        />

        {/* Selected Image Thumbnail Preview */}
        {selectedImage && (
          <View style={[styles.imagePreviewBar, { backgroundColor: cardBg }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPreviewImageUrl(selectedImage)}
              style={styles.previewThumbnailWrapper}>
              <Image
                source={{ uri: selectedImage }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removeImageBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={() => setSelectedImage(null)}>
                <X size={13} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setPreviewImageUrl(selectedImage)}
              style={styles.previewInfoContainer}>
              <Text style={[styles.previewInfoTitle, { color: cardTextColor }]}>
                첨부 사진 1장
              </Text>
              <Text style={[styles.previewInfoSubtitle, { color: cardSubTextColor }]}>
                터치하여 전체 크기 미리보기
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Input Bar */}
        {!isSearching && (
          <View style={[styles.inputBar, { backgroundColor: cardBg }]}>
            <TouchableOpacity onPress={handlePickImage} style={styles.iconBtn}>
              <ImageIcon size={22} color={selectedImage ? mainTheme : cardSubTextColor} />
            </TouchableOpacity>

            <TextInput
              style={[styles.input, { color: cardTextColor }]}
              placeholder="지금 생각나는 것을 기록해보세요..."
              placeholderTextColor={cardSubTextColor}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />

            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() && !selectedImage}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() || selectedImage ? mainTheme : isPanelDark ? '#334155' : '#CBD5E1',
                },
              ]}>
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Fullscreen Image Preview Modal */}
        <Modal
          visible={!!previewImageUrl}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewImageUrl(null)}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalBackdrop}
            onPress={() => setPreviewImageUrl(null)}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => setPreviewImageUrl(null)}>
              <X size={26} color="#FFFFFF" />
            </TouchableOpacity>
            {previewImageUrl && (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.modalFullImage}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
        </Modal>

        {/* Calendar Picker Modal */}
        <CalendarPickerModal
          visible={isCalendarOpen}
          currentDate={currentDate}
          onSelectDate={(selected) => setCurrentDate(selected)}
          onClose={() => setIsCalendarOpen(false)}
        />
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navArrow: {
    padding: 6,
    borderRadius: 16,
  },
  dateTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  dayLabelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerIconButton: {
    padding: 6,
    borderRadius: 8,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  timeBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginRight: 6,
    marginBottom: 2,
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
  timeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: -0.2,
  },
  speechBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 4, // 말풍선 고유의 꼬리형 라운딩 (PC버전 동일 감성)
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  glassBubble: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  imageOnlyBubble: {
    padding: 4,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  deleteBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginBottom: 2,
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
  adaptiveImageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  imagePreviewBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 12,
  },
  previewThumbnailWrapper: {
    position: 'relative',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  previewInfoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  previewInfoTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewInfoSubtitle: {
    fontSize: 11,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalFullImage: {
    width: '94%',
    height: '80%',
  },
});
