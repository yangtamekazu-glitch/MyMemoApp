import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface Item {
  id: string;
  parentId: string | null;
  type: 'folder' | 'note';
  title: string;
  text: string;
  imageUri: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  folderIconUri?: string | null; // 🌟 フォルダ専用のアイコン画像を保存する場所を追加！
  fileUri: string | null;
  fileName: string | null;
}

interface HistoryItem {
  id: string | null;
  title: string;
}

const GOOGLE_COLORS = {
  blue: '#4285F4',
  red: '#EA4335',
  yellow: '#FBBC05',
  green: '#34A853',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  textMain: '#202124',
  textSecondary: '#5F6368',
  border: '#DADCE0'
};

export default function MemoApp() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([{ id: null, title: 'メモ帳' }]);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 🌟 現在「名前・アイコン」を編集中のフォルダを記憶するスイッチ
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem('my_memo_data');
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setItems(parsed);
        } else {
          setItems([
            { id: '1', parentId: null, type: 'folder', title: '無名１', text: '', imageUri: null, fileUri: null, fileName: null },
            { id: '2', parentId: null, type: 'folder', title: '無名２', text: '', imageUri: null, fileUri: null, fileName: null },
          ]);
        }
      } catch (error) {
        console.error("読み込みエラー", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem('my_memo_data', JSON.stringify(items));
    }
  }, [items, isLoaded]);

  const currentItems = items.filter(item => item.parentId === currentParentId);
  const currentTitle = history[history.length - 1].title;

  const goInside = (folder: Item) => {
    setCurrentParentId(folder.id);
    setHistory([...history, { id: folder.id, title: folder.title }]);
    setIsSelectMode(false);
    setSelectedIds([]);
    setEditingFolderId(null);
  };

  const goBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      setHistory(newHistory);
      setCurrentParentId(newHistory[newHistory.length - 1].id);
      setIsSelectMode(false);
      setSelectedIds([]);
      setEditingFolderId(null);
    }
  };

  const handleAdd = (type: 'folder' | 'note') => {
    setIsFabOpen(false);
    const newId = Date.now().toString();
    const newItem: Item = {
      id: newId,
      parentId: currentParentId,
      type: type,
      title: '',
      text: '',
      imageUri: null,
      folderIconUri: null,
      fileUri: null,
      fileName: null,
    };
    setItems(prev => [...prev, newItem]);

    // 💡 フォルダを追加した時は、自動的に「編集モード」にする！
    if (type === 'folder') {
      setEditingFolderId(newId);
    }
  };

  const updateItem = (id: string, updates: Partial<Item>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const deleteSelectedItems = () => {
    Alert.alert("削除の確認", `${selectedIds.length}件の項目を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除", style: "destructive", onPress: () => {
          const idsToDelete = new Set<string>(selectedIds);
          let oldSize = 0;
          while (idsToDelete.size > oldSize) {
            oldSize = idsToDelete.size;
            items.forEach(item => {
              if (item.parentId !== null && idsToDelete.has(item.parentId)) idsToDelete.add(item.id);
            });
          }
          setItems(prev => prev.filter(item => !idsToDelete.has(item.id)));
          setIsSelectMode(false);
          setSelectedIds([]);
        }
      }
    ]);
  };

  // 🌟 フォルダ専用のアイコン（写真）を選ぶ機能
  const pickFolderIcon = async (id: string) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // アイコンなので「正方形」に固定して切り取ります
      quality: 0.5,
    });
    if (!result.canceled) {
      updateItem(id, { folderIconUri: result.assets[0].uri });
    }
  };

  const pickImage = async (id: string) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      updateItem(id, {
        imageUri: asset.uri,
        imageWidth: asset.width,
        imageHeight: asset.height
      });
    }
  };

  const pickDocument = async (id: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        updateItem(id, { fileUri: file.uri, fileName: file.name });
      }
    } catch (error) {
      Alert.alert("エラー", "ファイルの読み込みに失敗しました");
    }
  };

  const openFile = async (uri: string) => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri);
    } else {
      Alert.alert('エラー', 'このデバイスではファイルを開けません');
    }
  };

  const onDragEnd = ({ data }: any) => {
    const otherItems = items.filter(item => item.parentId !== currentParentId);
    setItems([...otherItems, ...data]);
  };

  const renderItem = ({ item, drag, isActive }: any) => {
    const isEditing = editingFolderId === item.id;

    return (
      <ScaleDecorator>
        <View style={[styles.itemCard, isActive && styles.itemCardActive]}>

          {/* 🌟 Folder View */}
          {item.type === 'folder' && (
            <View style={styles.folderContainer}>

              {/* アイコンと文字のエリア */}
              <TouchableOpacity
                style={styles.folderMainArea}
                activeOpacity={isEditing ? 1 : 0.7}
                onPress={() => {
                  if (isSelectMode) toggleSelection(item.id);
                  else if (!isEditing) goInside(item); // 編集モードじゃない時だけ中に入る
                }}
              >
                {/* フォルダアイコン */}
                <View style={styles.folderIconWrapper}>
                  {item.folderIconUri ? (
                    <Image source={{ uri: item.folderIconUri }} style={styles.customFolderIcon} />
                  ) : (
                    <MaterialIcons name="folder" size={36} color={GOOGLE_COLORS.blue} />
                  )}

                  {/* 編集モード中だけ「カメラマーク」を表示し、タップで写真を選べるようにする */}
                  {isEditing && (
                    <>
                      <View style={styles.editIconBadge}>
                        <MaterialIcons name="camera-alt" size={12} color="#FFF" />
                      </View>
                      <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => pickFolderIcon(item.id)}
                      />
                    </>
                  )}
                </View>

                {/* フォルダ名 */}
                {isEditing ? (
                  <TextInput
                    style={styles.folderInput}
                    value={item.title}
                    onChangeText={(text) => updateItem(item.id, { title: text })}
                    placeholder="無題のフォルダ"
                    placeholderTextColor={GOOGLE_COLORS.textSecondary}
                    autoFocus
                    onSubmitEditing={() => setEditingFolderId(null)}
                  />
                ) : (
                  <Text style={[styles.folderText, !item.title && { color: GOOGLE_COLORS.textSecondary }]}>
                    {item.title || "無題のフォルダ"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* 右側のボタンエリア */}
              <View style={styles.folderActionArea}>
                {isSelectMode ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => toggleSelection(item.id)}>
                    <MaterialIcons
                      name={selectedIds.includes(item.id) ? "check-circle" : "radio-button-unchecked"}
                      size={28}
                      color={selectedIds.includes(item.id) ? GOOGLE_COLORS.blue : GOOGLE_COLORS.border}
                    />
                  </TouchableOpacity>
                ) : isEditing ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => setEditingFolderId(null)}>
                    <MaterialIcons name="check" size={26} color={GOOGLE_COLORS.green} />
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity style={styles.iconButton} onPress={() => setEditingFolderId(item.id)}>
                      <MaterialIcons name="edit" size={22} color={GOOGLE_COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onLongPress={drag}>
                      <MaterialIcons name="drag-indicator" size={24} color={GOOGLE_COLORS.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Note View */}
          {item.type === 'note' && (
            <View style={styles.noteContainer}>
              <View style={styles.noteHeader}>
                <TextInput
                  style={styles.noteTitleInput}
                  value={item.title}
                  onChangeText={(text) => updateItem(item.id, { title: text })}
                  placeholder="タイトル"
                  placeholderTextColor={GOOGLE_COLORS.textSecondary}
                  selectionColor={GOOGLE_COLORS.blue}
                  editable={!isSelectMode}
                />

                {isSelectMode ? (
                  <View style={styles.iconButton}>
                    <MaterialIcons
                      name={selectedIds.includes(item.id) ? "check-circle" : "radio-button-unchecked"}
                      size={28}
                      color={selectedIds.includes(item.id) ? GOOGLE_COLORS.blue : GOOGLE_COLORS.border}
                    />
                  </View>
                ) : (
                  <TouchableOpacity style={styles.iconButton} onLongPress={drag}>
                    <MaterialIcons name="drag-indicator" size={24} color={GOOGLE_COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.noteInput}
                value={item.text}
                onChangeText={(text) => updateItem(item.id, { text: text })}
                placeholder="メモを入力..."
                placeholderTextColor={GOOGLE_COLORS.textSecondary}
                multiline
                selectionColor={GOOGLE_COLORS.blue}
                editable={!isSelectMode}
              />

              {item.imageUri && (
                <View style={styles.attachmentContainer}>
                  <Image
                    source={{ uri: item.imageUri }}
                    style={[
                      styles.image,
                      item.imageWidth && item.imageHeight
                        ? { aspectRatio: item.imageWidth / item.imageHeight }
                        : { height: 200 }
                    ]}
                    resizeMode="contain"
                  />
                </View>
              )}

              {item.fileName && (
                <TouchableOpacity
                  style={styles.fileCard}
                  onPress={() => item.fileUri && !isSelectMode && openFile(item.fileUri)}
                  activeOpacity={isSelectMode ? 1 : 0.7}
                >
                  <MaterialIcons name="insert-drive-file" size={24} color={GOOGLE_COLORS.blue} />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileNameText} numberOfLines={1} ellipsizeMode="tail">
                      {item.fileName}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.chipButton} onPress={() => !isSelectMode && pickImage(item.id)}>
                  <MaterialIcons name="image" size={18} color={item.imageUri ? GOOGLE_COLORS.blue : GOOGLE_COLORS.textSecondary} />
                  <Text style={[styles.chipText, item.imageUri && { color: GOOGLE_COLORS.blue }]}>
                    {item.imageUri ? "画像変更" : "画像"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chipButton} onPress={() => !isSelectMode && pickDocument(item.id)}>
                  <MaterialIcons name="attach-file" size={18} color={item.fileName ? GOOGLE_COLORS.blue : GOOGLE_COLORS.textSecondary} />
                  <Text style={[styles.chipText, item.fileName && { color: GOOGLE_COLORS.blue }]}>
                    {item.fileName ? "ファイル変更" : "ファイル"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isSelectMode && (
            <TouchableOpacity
              style={[
                StyleSheet.absoluteFillObject,
                { zIndex: 10, borderRadius: 12, backgroundColor: selectedIds.includes(item.id) ? 'rgba(66, 133, 244, 0.05)' : 'transparent' }
              ]}
              activeOpacity={0.5}
              onPress={() => toggleSelection(item.id)}
            />
          )}

        </View>
      </ScaleDecorator>
    );
  };

  if (!isLoaded) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={GOOGLE_COLORS.blue} /></View>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen
          options={{
            headerTitle: isSelectMode ? `${selectedIds.length}件選択` : currentTitle,
            headerBackVisible: false,
            headerLeft: () => isSelectMode ? (
              <TouchableOpacity onPress={() => { setIsSelectMode(false); setSelectedIds([]); }} style={styles.headerButton}>
                <Text style={styles.headerCancelText}>キャンセル</Text>
              </TouchableOpacity>
            ) : currentParentId !== null ? (
              <TouchableOpacity onPress={goBack} style={styles.headerButton}>
                <MaterialIcons name="arrow-back" size={24} color={GOOGLE_COLORS.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            ),
            headerRight: () => isSelectMode ? (
              <TouchableOpacity
                onPress={deleteSelectedItems}
                style={styles.headerButton}
                disabled={selectedIds.length === 0}
              >
                <MaterialIcons
                  name="delete"
                  size={24}
                  color={selectedIds.length > 0 ? GOOGLE_COLORS.red : GOOGLE_COLORS.border}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsSelectMode(true)} style={styles.headerButton}>
                <MaterialIcons name="more-vert" size={26} color={GOOGLE_COLORS.textSecondary} />
              </TouchableOpacity>
            ),
            headerStyle: { backgroundColor: GOOGLE_COLORS.surface },
            headerTintColor: GOOGLE_COLORS.textMain,
            headerTitleStyle: { fontWeight: '500', fontSize: 20 },
            headerShadowVisible: true,
          }}
        />

        <DraggableFlatList
          data={currentItems}
          onDragEnd={onDragEnd}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100, padding: 12 }}
          showsVerticalScrollIndicator={false}
          dragHitSlop={{ top: 0, left: 0, bottom: 0, right: 0 }}
          activationDistance={isSelectMode ? 999 : 10}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="lightbulb-outline" size={64} color={GOOGLE_COLORS.border} />
              <Text style={styles.emptyText}>右下の＋ボタンからメモやフォルダを追加できます</Text>
            </View>
          }
        />

        {isFabOpen && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 9 }]}
            activeOpacity={1}
            onPress={() => setIsFabOpen(false)}
          />
        )}

        {!isSelectMode && isFabOpen && (
          <View style={styles.fabMenuContainer}>
            <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleAdd('folder')}>
              <Text style={styles.fabMenuItemText}>フォルダ</Text>
              <View style={[styles.fabMiniIcon, { backgroundColor: GOOGLE_COLORS.surface }]}>
                <MaterialIcons name="create-new-folder" size={24} color={GOOGLE_COLORS.blue} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleAdd('note')}>
              <Text style={styles.fabMenuItemText}>メモ</Text>
              <View style={[styles.fabMiniIcon, { backgroundColor: GOOGLE_COLORS.surface }]}>
                <MaterialIcons name="note-add" size={24} color={GOOGLE_COLORS.blue} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {!isSelectMode && (
          <TouchableOpacity
            style={[styles.mainFab, isFabOpen && styles.mainFabActive]}
            onPress={() => setIsFabOpen(!isFabOpen)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={isFabOpen ? 'close' : 'add'}
              size={32}
              color={isFabOpen ? GOOGLE_COLORS.textMain : '#FFF'}
            />
          </TouchableOpacity>
        )}

      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: GOOGLE_COLORS.background },
  container: { flex: 1, backgroundColor: GOOGLE_COLORS.background },
  headerButton: { padding: 8, marginHorizontal: -4, borderRadius: 20 },
  headerSpacer: { width: 24 },
  headerCancelText: { fontSize: 16, fontWeight: '500', color: GOOGLE_COLORS.textSecondary, marginLeft: 4 },

  itemCard: {
    backgroundColor: GOOGLE_COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden'
  },
  itemCardActive: {
    shadowOpacity: 0.2,
    elevation: 5,
    transform: [{ scale: 1.02 }],
  },

  // 🌟 新しくなったフォルダのスタイル
  folderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingLeft: 16
  },
  folderMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderActionArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8
  },
  folderIconWrapper: {
    marginRight: 16,
    position: 'relative'
  },
  customFolderIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    resizeMode: 'cover'
  },
  editIconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: GOOGLE_COLORS.blue,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: GOOGLE_COLORS.surface
  },
  folderInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: GOOGLE_COLORS.textMain,
    padding: 0
  },
  folderText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: GOOGLE_COLORS.textMain,
  },
  iconButton: {
    padding: 6,
    borderRadius: 20
  },

  noteContainer: { padding: 16, paddingTop: 12 },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  noteTitleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: GOOGLE_COLORS.textMain,
    padding: 0
  },
  noteInput: {
    fontSize: 16,
    color: GOOGLE_COLORS.textMain,
    lineHeight: 24,
    minHeight: 40,
    padding: 0,
    marginTop: 4
  },

  attachmentContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border,
    backgroundColor: '#f8f9fa'
  },
  image: {
    width: '100%',
  },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOOGLE_COLORS.background,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border
  },
  fileInfo: { flex: 1, marginLeft: 12 },
  fileNameText: { fontSize: 14, color: GOOGLE_COLORS.textMain, fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOOGLE_COLORS.background,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border
  },
  chipText: {
    fontSize: 13,
    color: GOOGLE_COLORS.textSecondary,
    fontWeight: '500',
    marginLeft: 6
  },

  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: GOOGLE_COLORS.textSecondary,
    fontWeight: '500',
    textAlign: 'center'
  },

  fabMenuContainer: {
    position: 'absolute',
    bottom: 96,
    right: 20,
    alignItems: 'flex-end',
    gap: 16,
    zIndex: 10
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  fabMenuItemText: {
    backgroundColor: GOOGLE_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '500',
    color: GOOGLE_COLORS.textMain,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  fabMiniIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border
  },
  mainFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: GOOGLE_COLORS.blue,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    zIndex: 11
  },
  mainFabActive: {
    backgroundColor: GOOGLE_COLORS.surface,
    borderWidth: 1,
    borderColor: GOOGLE_COLORS.border
  }
});