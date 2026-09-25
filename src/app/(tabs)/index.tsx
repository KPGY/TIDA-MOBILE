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

  // Load entries for current date
  const loadEntries = useCallback(() => {
    try {
      const list = getDiaryByDate(currentDate);
      if (messageOrder === 'bottom') {
        // Oldest at top, newest at bottom
        setEntries(list);
      } else {
        // Newest at top
        setEntries([...list].reverse());
      }
    } catch (e) {
      console.error('Error loading diary entries:', e);
    }
  }, [currentDate, messageOrder]);

  useEffect(() => {
    loadEntries();
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
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      showAlert('사진 선택 오류', '갤러리에서 사진을 불러오는 중 오류가 발생했습니다.');
    }
  };

  // Save Memo
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let attachmentsJson: string | null = null;
    if (selectedImage) {
      const attachments: Attachment[] = [
        {
          filePath: selectedImage,
          fileName: selectedImage.split('/').pop() || 'image.jpg',
        },
      ];
      attachmentsJson = JSON.stringify(attachments);
    }

    try {
      saveDiary(trimmed, currentDate, timeStr, attachmentsJson);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setInputText('');
      setSelectedImage(null);
      loadEntries();
      setTimeout(() => {
        if (flatListRef.current) {
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
            deleteDiary(id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            loadEntries();
            if (isSearching) {
              handleSearch(searchQuery);
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

    return (
      <View style={[styles.bubbleContainer, { backgroundColor: bubbleBg }]}>
        <View style={styles.bubbleHeader}>
          <Text
            style={[
              styles.bubbleTime,
              {
                color: bubbleSubTextColor,
                textShadowColor: isBubbleDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)',
                textShadowOffset: { width: 0, height: 0.5 },
                textShadowRadius: 1,
              },
            ]}>
            {isSearching ? `${item.date} ${item.time}` : item.time}
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => handleDelete(item.id)}>
            <Trash2 size={16} color={bubbleSubTextColor} />
          </TouchableOpacity>
        </View>

        {attachments.map((att, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.8}
            onPress={() => setPreviewImageUrl(att.filePath)}>
            <Image source={{ uri: att.filePath }} style={styles.bubbleImage} resizeMode="cover" />
          </TouchableOpacity>
        ))}

        {item.content ? (
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
          contentContainerStyle={styles.listContent}
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
            <Image source={{ uri: selectedImage }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={() => setSelectedImage(null)}>
              <X size={16} color="#FFFFFF" />
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
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
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
          </View>
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
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  bubbleContainer: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bubbleTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
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
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    left: 64,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 2,
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
