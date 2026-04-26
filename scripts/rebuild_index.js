const fs = require('fs');

const content = `import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { supabase } from '../../utils/supabase';

const mapToDB = (item: Item, userId: string) => ({
  id: item.id,
  user_id: userId,
  parent_id: item.parentId,
  type: item.type,
  title: item.title,
  text: item.text,
  image_uri: item.imageUri,
  image_width: item.imageWidth,
  image_height: item.imageHeight,
  folder_icon_uri: item.folderIconUri,
  file_uri: item.fileUri,
  file_name: item.fileName,
});

const mapFromDB = (row: any): Item => ({
  id: row.id,
  parentId: row.parent_id,
  type: row.type as 'folder' | 'note',
  title: row.title || '',
  text: row.text || '',
  imageUri: row.image_uri,
  imageWidth: row.image_width,
  imageHeight: row.image_height,
  folderIconUri: row.folder_icon_uri,
  fileUri: row.file_uri,
  fileName: row.file_name,
});

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, LayoutAnimation, UIManager } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

interface Item {
  id: string;
  parentId: string | null;
  type: 'folder' | 'note';
  title: string;
  text: string;
  imageUri: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  folderIconUri?: string | null;
  fileUri: string | null;
  fileName: string | null;
}

interface HistoryItem {
  id: string | null;
  title: string;
}

const THEME_COLORS = {
  blue: '#007AFF', // iOS style vivid blue
  red: '#FF3B30',
  yellow: '#FFCC00',
  green: '#34C759',
  background: '#F4F6F8', // Soft grayish blue background
  surface: '#FFFFFF',
  textMain: '#111827', // Dark gray/black
  textSecondary: '#6B7280', // Soft gray
  border: 'transparent', // borderless design
  shadow: '#000000'
};

export default function MemoApp() {
  const uploadToStorage = async (uri: string, folder: string) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split('.').pop() || 'png';
      const path = \\\`\\\${folder}/\\\${Date.now()}_\\\${Math.random().toString(36).substring(7)}.\\\${ext}\\\`;
      const { error } = await supabase.storage.from('memo-assets').upload(path, blob);
      if (error) throw error;
      const { data } = supabase.storage.from('memo-assets').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('Upload Error:', e);
      return uri; // fallback to local uri
    }
  };

  const [items, setItems] = useState<Item[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([{ id: null, title: 'メモ帳' }]);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  const [dragDelaySec, setDragDelaySec] = useState(0.5);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isMoving, setIsMoving] = useState(false);
  const [movingItemIds, setMovingItemIds] = useState<string[]>([]);

  // Reanimated values for FAB
  const fabRotation = useSharedValue(0);
  const menuOpacity = useSharedValue(0);
  const menuScale = useSharedValue(0.8);

  useEffect(() => {
    if (isFabOpen) {
      fabRotation.value = withSpring(45);
      menuOpacity.value = withTiming(1, { duration: 200 });
      menuScale.value = withSpring(1);
    } else {
      fabRotation.value = withSpring(0);
      menuOpacity.value = withTiming(0, { duration: 200 });
      menuScale.value = withSpring(0.8);
    }
  }, [isFabOpen]);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: \\\`\\\${fabRotation.value}deg\\\` }]
  }));

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ scale: menuScale.value }],
    pointerEvents: isFabOpen ? 'auto' : 'none',
  }));

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoaded(true);
          return;
        }

        const { data: dbData, error } = await supabase.from('memos').select('*').eq('user_id', user.id);
        if (error) throw error;

        let loadedItems: Item[] = [];
        if (dbData && dbData.length > 0) {
          loadedItems = dbData.map(mapFromDB);
        }

        const savedData = await AsyncStorage.getItem('my_memo_data');
        if (savedData) {
          const parsed: Item[] = JSON.parse(savedData);
          const migratedFlag = await AsyncStorage.getItem('my_memo_data_migrated');
          if (!migratedFlag && parsed.length > 0) {
            const upsertData = parsed.map(item => mapToDB(item, user.id));
            const { error: upsertError } = await supabase.from('memos').upsert(upsertData);
            if (!upsertError) {
              await AsyncStorage.setItem('my_memo_data_migrated', 'true');
              const existingIds = new Set(loadedItems.map(i => i.id));
              const missingLocals = parsed.filter(i => !existingIds.has(i.id));
              loadedItems = [...loadedItems, ...missingLocals];
            }
          }
        }

        if (loadedItems.length === 0) {
          loadedItems = [
            { id: '1', parentId: null, type: 'folder', title: '新しいフォルダ', text: '', imageUri: null, fileUri: null, fileName: null },
            { id: '2', parentId: null, type: 'folder', title: 'アイデア', text: '', imageUri: null, fileUri: null, fileName: null },
          ];
          const defaultData = loadedItems.map(item => mapToDB(item, user.id));
          await supabase.from('memos').upsert(defaultData);
        }

        setItems(loadedItems);

        const savedDelay = await AsyncStorage.getItem('dragDelaySec');
        if (savedDelay !== null) {
          setDragDelaySec(parseFloat(savedDelay));
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
    if (!isLoaded || items.length === 0) return;
    const timer = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const upsertData = items.map(item => mapToDB(item, user.id));
        await supabase.from('memos').upsert(upsertData);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [items, isLoaded]);

  const changeDragDelay = async (sec: number) => {
    setDragDelaySec(sec);
    await AsyncStorage.setItem('dragDelaySec', sec.toString());
  };

  const currentItems = items.filter(item => item.parentId === currentParentId);
  const currentTitle = history[history.length - 1].title;

  const goInside = (folder: Item) => {
    animateLayout();
    setCurrentParentId(folder.id);
    setHistory([...history, { id: folder.id, title: folder.title }]);
    setIsSelectMode(false);
    setSelectedIds([]);
    setEditingFolderId(null);
  };

  const goBack = () => {
    if (history.length > 1) {
      animateLayout();
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
    animateLayout();
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
    const executeDelete = async () => {
      animateLayout();
      const idsToDelete = new Set<string>(selectedIds);
      let oldSize = 0;
      while (idsToDelete.size > oldSize) {
        oldSize = idsToDelete.size;
        items.forEach(item => {
          if (item.parentId !== null && idsToDelete.has(item.parentId)) idsToDelete.add(item.id);
        });
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('memos').delete().in('id', Array.from(idsToDelete));
      }
      setItems(prev => prev.filter(item => !idsToDelete.has(item.id)));
      setIsSelectMode(false);
      setSelectedIds([]);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(\\\`\\\${selectedIds.length}件の項目を削除しますか？\\\`)) {
        executeDelete();
      }
    } else {
      Alert.alert("削除の確認", \\\`\\\${selectedIds.length}件の項目を削除しますか？\\\`, [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: executeDelete }
      ]);
    }
  };

  const startMoving = () => {
    animateLayout();
    setMovingItemIds([...selectedIds]);
    setIsSelectMode(false);
    setSelectedIds([]);
    setIsMoving(true);
  };

  const cancelMove = () => {
    animateLayout();
    setIsMoving(false);
    setMovingItemIds([]);
  };

  const isChildOfMovingItems = (targetParentId: string | null): boolean => {
    if (targetParentId === null) return false;
    if (movingItemIds.includes(targetParentId)) return true;
    const parentFolder = items.find(item => item.id === targetParentId);
    if (parentFolder) {
      return isChildOfMovingItems(parentFolder.parentId);
    }
    return false;
  };

  const executeMove = () => {
    if (isChildOfMovingItems(currentParentId)) {
      if (Platform.OS === 'web') {
        window.alert("移動させたいフォルダ自身や、その内側の階層には移動できません。上の階層などを選んでください。");
      } else {
        Alert.alert("エラー", "移動させたいフォルダ自身や、その内側の階層には移動できません。上の階層などを選んでください。");
      }
      return;
    }
    animateLayout();
    setItems(prev => prev.map(item =>
      movingItemIds.includes(item.id) ? { ...item, parentId: currentParentId } : item
    ));
    setIsMoving(false);
    setMovingItemIds([]);
  };

  const pickFolderIcon = async (id: string) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      const publicUrl = await uploadToStorage(result.assets[0].uri, 'icons');
      updateItem(id, { folderIconUri: publicUrl });
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
      const publicUrl = await uploadToStorage(asset.uri, 'images');
      updateItem(id, {
        imageUri: publicUrl,
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
        const publicUrl = await uploadToStorage(file.uri, 'files');
        updateItem(id, { fileUri: publicUrl, fileName: file.name });
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
    const isThisItemMoving = isMoving && movingItemIds.includes(item.id);

    return (
      <ScaleDecorator>
        <View style={[
          styles.itemCard,
          isActive && styles.itemCardActive,
          isThisItemMoving && { opacity: 0.4 }
        ]}>

          {item.type === 'folder' && (
            <View style={styles.folderContainer}>
              <TouchableOpacity
                style={styles.folderMainArea}
                activeOpacity={isEditing ? 1 : 0.7}
                disabled={isThisItemMoving}
                onPress={() => {
                  if (isSelectMode) toggleSelection(item.id);
                  else if (!isEditing) goInside(item);
                }}
              >
                <View style={styles.folderIconWrapper}>
                  {item.folderIconUri ? (
                    <Image source={{ uri: item.folderIconUri }} style={styles.customFolderIcon} />
                  ) : (
                    <MaterialIcons name="folder" size={40} color={THEME_COLORS.blue} style={{ opacity: 0.9 }} />
                  )}
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

                {isEditing ? (
                  <TextInput
                    style={styles.folderInput}
                    value={item.title}
                    onChangeText={(text) => updateItem(item.id, { title: text })}
                    placeholder="無題のフォルダ"
                    placeholderTextColor={THEME_COLORS.textSecondary}
                    autoFocus
                    onSubmitEditing={() => setEditingFolderId(null)}
                  />
                ) : (
                  <Text style={[styles.folderText, !item.title && { color: THEME_COLORS.textSecondary }]}>
                    {item.title || "無題のフォルダ"}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.folderActionArea}>
                {isSelectMode ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => toggleSelection(item.id)}>
                    <MaterialIcons
                      name={selectedIds.includes(item.id) ? "check-circle" : "radio-button-unchecked"}
                      size={28}
                      color={selectedIds.includes(item.id) ? THEME_COLORS.blue : '#D1D5DB'}
                    />
                  </TouchableOpacity>
                ) : isEditing ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => setEditingFolderId(null)}>
                    <MaterialIcons name="check" size={26} color={THEME_COLORS.green} />
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity style={styles.iconButton} onPress={() => setEditingFolderId(item.id)}>
                      <MaterialIcons name="edit" size={22} color={THEME_COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} delayLongPress={dragDelaySec * 1000} onLongPress={drag}>
                      <MaterialIcons name="drag-indicator" size={24} color={THEME_COLORS.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {item.type === 'note' && (
            <View style={styles.noteContainer}>
              <View style={styles.noteHeader}>
                <TextInput
                  style={styles.noteTitleInput}
                  value={item.title}
                  onChangeText={(text) => updateItem(item.id, { title: text })}
                  placeholder="タイトル"
                  placeholderTextColor={THEME_COLORS.textSecondary}
                  selectionColor={THEME_COLORS.blue}
                  editable={!isSelectMode && !isThisItemMoving}
                />

                {isSelectMode ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => toggleSelection(item.id)}>
                    <MaterialIcons
                      name={selectedIds.includes(item.id) ? "check-circle" : "radio-button-unchecked"}
                      size={28}
                      color={selectedIds.includes(item.id) ? THEME_COLORS.blue : '#D1D5DB'}
                    />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.iconButton} delayLongPress={dragDelaySec * 1000} onLongPress={drag} disabled={isThisItemMoving}>
                    <MaterialIcons name="drag-indicator" size={24} color={THEME_COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.noteInput}
                value={item.text}
                onChangeText={(text) => updateItem(item.id, { text: text })}
                placeholder="メモを入力..."
                placeholderTextColor={THEME_COLORS.textSecondary}
                multiline
                selectionColor={THEME_COLORS.blue}
                editable={!isSelectMode && !isThisItemMoving}
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
                    resizeMode="cover"
                  />
                </View>
              )}

              {item.fileName && (
                <TouchableOpacity
                  style={styles.fileCard}
                  onPress={() => item.fileUri && !isSelectMode && openFile(item.fileUri)}
                  activeOpacity={isSelectMode ? 1 : 0.7}
                  disabled={isThisItemMoving}
                >
                  <MaterialIcons name="insert-drive-file" size={24} color={THEME_COLORS.blue} />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileNameText} numberOfLines={1} ellipsizeMode="tail">
                      {item.fileName}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.chipButton, item.imageUri && styles.chipButtonActive]} onPress={() => !isSelectMode && pickImage(item.id)} disabled={isThisItemMoving}>
                  <MaterialIcons name="image" size={18} color={item.imageUri ? THEME_COLORS.blue : THEME_COLORS.textSecondary} />
                  <Text style={[styles.chipText, item.imageUri && { color: THEME_COLORS.blue }]}>
                    {item.imageUri ? "画像変更" : "画像"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chipButton, item.fileName && styles.chipButtonActive]} onPress={() => !isSelectMode && pickDocument(item.id)} disabled={isThisItemMoving}>
                  <MaterialIcons name="attach-file" size={18} color={item.fileName ? THEME_COLORS.blue : THEME_COLORS.textSecondary} />
                  <Text style={[styles.chipText, item.fileName && { color: THEME_COLORS.blue }]}>
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
                { zIndex: 10, borderRadius: 20, backgroundColor: selectedIds.includes(item.id) ? 'rgba(0, 122, 255, 0.05)' : 'transparent' }
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
    return <View style={styles.loading}><ActivityIndicator size="large" color={THEME_COLORS.blue} /></View>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen
          options={{
            headerTitle: isSelectMode ? \\\`\\\${selectedIds.length}件選択\\\` : isMoving ? '移動先の選択' : currentTitle,
            headerBackVisible: false,
            headerLeft: () => isSelectMode ? (
              <TouchableOpacity onPress={() => { animateLayout(); setIsSelectMode(false); setSelectedIds([]); }} style={styles.headerButton}>
                <Text style={styles.headerCancelText}>キャンセル</Text>
              </TouchableOpacity>
            ) : currentParentId !== null ? (
              <TouchableOpacity onPress={goBack} style={styles.headerButton}>
                <MaterialIcons name="arrow-back-ios" size={22} color={THEME_COLORS.blue} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsSettingsOpen(true)} style={styles.headerButton}>
                <MaterialIcons name="settings" size={24} color={THEME_COLORS.textSecondary} />
              </TouchableOpacity>
            ),
            headerRight: () => isSelectMode ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={startMoving} style={styles.headerButton} disabled={selectedIds.length === 0}>
                  <MaterialIcons name="drive-file-move" size={24} color={selectedIds.length > 0 ? THEME_COLORS.blue : THEME_COLORS.border} />
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteSelectedItems} style={styles.headerButton} disabled={selectedIds.length === 0}>
                  <MaterialIcons name="delete" size={24} color={selectedIds.length > 0 ? THEME_COLORS.red : THEME_COLORS.border} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { animateLayout(); setIsSelectMode(true); }} style={styles.headerButton}>
                <MaterialIcons name="checklist" size={26} color={THEME_COLORS.blue} />
              </TouchableOpacity>
            ),
            headerStyle: { backgroundColor: THEME_COLORS.background },
            headerTintColor: THEME_COLORS.textMain,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
            headerShadowVisible: false,
          }}
        />

        <DraggableFlatList
          data={currentItems}
          onDragEnd={onDragEnd}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: isMoving ? 160 : 120, padding: 16 }}
          showsVerticalScrollIndicator={false}
          dragHitSlop={{ top: 0, left: 0, bottom: 0, right: 0 }}
          activationDistance={isSelectMode ? 999 : 10}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="note" size={64} color={'#D1D5DB'} />
              <Text style={styles.emptyText}>この階層には何もありません</Text>
            </View>
          }
        />

        {isMoving && (
          <View style={styles.moveBanner}>
            <Text style={styles.moveBannerText}>\\\${movingItemIds.length}件の項目を移動中</Text>
            <Text style={styles.moveBannerSubText}>上の戻るボタンやフォルダを押して、移動先を開いてください</Text>
            <View style={styles.moveBannerButtons}>
              <TouchableOpacity onPress={cancelMove} style={styles.moveCancelBtn}>
                <Text style={styles.moveCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={executeMove} style={styles.moveExecuteBtn}>
                <Text style={styles.moveExecuteText}>ここに決定</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isFabOpen && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.6)', zIndex: 9 }]}
            activeOpacity={1}
            onPress={() => setIsFabOpen(false)}
          />
        )}

        {!isSelectMode && !isMoving && (
          <Animated.View style={[styles.fabMenuContainer, menuAnimatedStyle]}>
            <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleAdd('folder')}>
              <Text style={styles.fabMenuItemText}>フォルダ</Text>
              <View style={styles.fabMiniIcon}>
                <MaterialIcons name="create-new-folder" size={22} color={THEME_COLORS.blue} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleAdd('note')}>
              <Text style={styles.fabMenuItemText}>メモ</Text>
              <View style={styles.fabMiniIcon}>
                <MaterialIcons name="note-add" size={22} color={THEME_COLORS.blue} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {!isSelectMode && !isMoving && (
          <Animated.View style={[styles.mainFabWrapper, fabAnimatedStyle]}>
            <TouchableOpacity
              style={styles.mainFab}
              onPress={() => setIsFabOpen(!isFabOpen)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="add"
                size={32}
                color={'#FFF'}
              />
            </TouchableOpacity>
          </Animated.View>
        )}

        <Modal visible={isSettingsOpen} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsSettingsOpen(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>設定</Text>
              <Text style={styles.settingsSubtitle}>ドラッグ開始までの長押し時間</Text>

              <View style={{ width: '100%', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 36, fontWeight: '700', color: THEME_COLORS.blue, marginBottom: 16 }}>
                  {dragDelaySec.toFixed(1)}<Text style={{ fontSize: 16, color: THEME_COLORS.textSecondary }}> 秒</Text>
                </Text>

                <Slider
                  style={{ width: '100%', height: 40 }}
                  minimumValue={0.1}
                  maximumValue={3.0}
                  step={0.1}
                  value={dragDelaySec}
                  onValueChange={(val) => setDragDelaySec(val)}
                  onSlidingComplete={(val) => changeDragDelay(val)}
                  minimumTrackTintColor={THEME_COLORS.blue}
                  maximumTrackTintColor={'#D1D5DB'}
                  thumbTintColor={Platform.OS === 'web' ? '#fff' : THEME_COLORS.blue}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 12, marginTop: -4 }}>
                  <Text style={{ color: THEME_COLORS.textSecondary, fontSize: 12 }}>短め (0.1秒)</Text>
                  <Text style={{ color: THEME_COLORS.textSecondary, fontSize: 12 }}>長め (3.0秒)</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeSettingsButton}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.closeSettingsText}>閉じる</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME_COLORS.background },
  container: { flex: 1, backgroundColor: THEME_COLORS.background },
  headerButton: { padding: 8, marginHorizontal: 4, borderRadius: 20 },
  headerSpacer: { width: 24 },
  headerCancelText: { fontSize: 16, fontWeight: '600', color: THEME_COLORS.textSecondary },

  itemCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: THEME_COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  itemCardActive: {
    shadowOpacity: 0.15,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },

  folderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
    width: 44,
    height: 44,
    borderRadius: 12,
    resizeMode: 'cover'
  },
  editIconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: THEME_COLORS.blue,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME_COLORS.surface
  },
  folderInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.textMain,
    padding: 0
  },
  folderText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.textMain,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20
  },

  noteContainer: { padding: 20 },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  noteTitleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: THEME_COLORS.textMain,
    padding: 0,
    marginRight: 8
  },
  noteInput: {
    fontSize: 16,
    color: THEME_COLORS.textMain,
    lineHeight: 26,
    minHeight: 40,
    padding: 0,
  },

  attachmentContainer: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB'
  },
  image: {
    width: '100%',
  },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  fileInfo: { flex: 1, marginLeft: 12 },
  fileNameText: { fontSize: 15, color: THEME_COLORS.textMain, fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  chipText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    fontWeight: '600',
    marginLeft: 6
  },

  emptyContainer: {
    paddingTop: 100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    marginTop: 20,
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    fontWeight: '500',
    textAlign: 'center'
  },

  fabMenuContainer: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    alignItems: 'flex-end',
    gap: 16,
    zIndex: 10
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  fabMenuItemText: {
    backgroundColor: THEME_COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.textMain,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  fabMiniIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  mainFabWrapper: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 11
  },
  mainFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME_COLORS.blue,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME_COLORS.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsCard: {
    backgroundColor: THEME_COLORS.surface,
    width: '85%',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  settingsTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME_COLORS.textMain,
    marginBottom: 8,
  },
  settingsSubtitle: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    marginBottom: 24,
  },
  closeSettingsButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
  },
  closeSettingsText: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.textMain,
  },

  moveBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME_COLORS.surface,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 15,
    zIndex: 20
  },
  moveBannerText: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME_COLORS.textMain,
    marginBottom: 6
  },
  moveBannerSubText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 16
  },
  moveBannerButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  moveCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F3F4F6'
  },
  moveCancelText: {
    color: THEME_COLORS.textSecondary,
    fontWeight: '700'
  },
  moveExecuteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: THEME_COLORS.blue
  },
  moveExecuteText: {
    color: '#FFFFFF',
    fontWeight: '700'
  }
});
`;

fs.writeFileSync('c:/AppDev/MyMemoApp/app/(tabs)/index.tsx', content);
console.log('Done!');
