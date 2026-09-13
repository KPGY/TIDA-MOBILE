import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Modal,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Image as ImageIcon,
  Trash2,
  Search,
  X,
  Calendar,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/store';
import {
  saveDiary,
  getDiaryByDate,
  searchDiary,
  deleteDiary,
  DiaryItem,
  Attachment,
} from '@/services/db';
import { getTodayStr } from '@/utils/routineHelper';

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
  } = useAppStore();

  const [currentDate, setCurrentDate] = useState<string>(getTodayStr());
  const [entries, setEntries] = useState<DiaryItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Search state
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<DiaryItem[]>([]);

  // Image preview modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';
  const bubbleTextColor = bubbleTextMode === 'light' ? '#FFFFFF' : '#0F172A';
  const bubbleSubTextColor = bubbleTextMode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.6)';

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

  // Date Navigation
  const changeDate = (offset: number) => {
    const parts = currentDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + offset);
    setCurrentDate(getTodayStr(d));
  };

  const jumpToToday = () => {
    setCurrentDate(getTodayStr());
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
      Alert.alert('사진 선택 오류', '갤러리에서 사진을 불러오는 중 오류가 발생했습니다.');
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
    } catch (e) {
      Alert.alert('저장 실패', '메모를 저장하지 못했습니다.');
    }
  };

  // Delete Memo
  const handleDelete = (id: number) => {
    Alert.alert('삭제 확인', '이 타임라인 기록을 삭제하시겠습니까?', [
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
            Alert.alert('삭제 오류', '기록을 삭제하지 못했습니다.');
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
      <View style={[styles.bubbleContainer, { backgroundColor: bubbleTheme }]}>
        <View style={styles.bubbleHeader}>
          <Text style={[styles.bubbleTime, { color: bubbleSubTextColor }]}>
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
          <Text style={[styles.bubbleText, { color: bubbleTextColor }]}>{item.content}</Text>
        ) : null}
      </View>
    );
  };

  const isToday = currentDate === getTodayStr();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top Header & Date Navigation */}
        <View style={[styles.header, { backgroundColor: panelTheme }]}>
          {isSearching ? (
            <View style={styles.searchBarContainer}>
              <Search size={18} color={subTextColor} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="타임라인 내용 검색..."
                placeholderTextColor={subTextColor}
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
                <X size={20} color={subTextColor} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dateNavRow}>
              <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navArrow}>
                  <ChevronLeft size={22} color={textColor} />
                </TouchableOpacity>

                <TouchableOpacity onPress={jumpToToday} style={styles.dateTextButton}>
                  <Text style={[styles.dateText, { color: textColor }]}>
                    {currentDate}
                    {isToday && <Text style={{ color: mainTheme, fontWeight: '700' }}> (오늘)</Text>}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => changeDate(1)} style={styles.navArrow}>
                  <ChevronRight size={22} color={textColor} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.searchIconButton}
                onPress={() => setIsSearching(true)}>
                <Search size={20} color={textColor} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Timeline Entries List */}
        <FlatList
          ref={flatListRef}
          data={isSearching ? searchResults : entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDiaryItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: subTextColor }]}>
                {isSearching
                  ? '검색 결과가 없습니다.'
                  : '이 날짜에 작성된 기록이 없습니다.\n아래 입력창에 첫 생각을 남겨보세요 ✨'}
              </Text>
            </View>
          }
        />

        {/* Selected Image Thumbnail Preview */}
        {selectedImage && (
          <View style={[styles.imagePreviewBar, { backgroundColor: panelTheme }]}>
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
          <View style={[styles.inputBar, { backgroundColor: panelTheme }]}>
            <TouchableOpacity onPress={handlePickImage} style={styles.iconBtn}>
              <ImageIcon size={22} color={selectedImage ? mainTheme : subTextColor} />
            </TouchableOpacity>

            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="지금 생각나는 것을 기록해보세요..."
              placeholderTextColor={subTextColor}
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
                    inputText.trim() || selectedImage ? mainTheme : isBgDark ? '#334155' : '#CBD5E1',
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
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  },
  dateTextButton: {
    paddingHorizontal: 8,
  },
  dateText: {
    fontSize: 17,
    fontWeight: '700',
  },
  searchIconButton: {
    padding: 6,
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
