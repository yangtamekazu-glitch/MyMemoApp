import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

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
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [inputHeights, setInputHeights] = useState<Record<string, number>>({});
  const isReadyForAutoSave = useRef(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([{ id: null, title: 'メモ帳' }]);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  const [dragDelaySec, setDragDelaySec] = useState(0.5);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isMoving, setIsMoving] = useState(false);
  const [movingItemIds, setMovingItemIds] = useState<string[]>([]);

  const pastStatesRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const isTyping = useRef(false);

  const pushHistory = (currentState: Item[]) => {
    const stateStr = JSON.stringify(currentState);
    if (pastStatesRef.current.length > 0 && pastStatesRef.current[pastStatesRef.current.length - 1] === stateStr) {
      return;
    }
    pastStatesRef.current.push(stateStr);
    if (pastStatesRef.current.length > 30) {
      pastStatesRef.current.shift();
    }
    setCanUndo(true);
  };

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
    transform: [{ rotate: `${fabRotation.value}deg` }]
  }));

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ scale: menuScale.value }],
    pointerEvents: isFabOpen ? 'auto' : 'none',
  }));

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

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

      const savedOrderStr = await AsyncStorage.getItem('my_memo_order');
      if (savedOrderStr) {
        try {
          const savedOrder: string[] = JSON.parse(savedOrderStr);
          loadedItems.sort((a, b) => {
            const indexA = savedOrder.indexOf(a.id);
            const indexB = savedOrder.indexOf(b.id);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
        } catch (e) {
          console.error("Order parse error:", e);
        }
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
          { id: Date.now().toString() + '_1', parentId: null, type: 'folder', title: '新しいフォルダ', text: '', imageUri: null, fileUri: null, fileName: null },
          { id: Date.now().toString() + '_2', parentId: null, type: 'folder', title: 'アイデア', text: '', imageUri: null, fileUri: null, fileName: null },
        ];
        const defaultData = loadedItems.map(item => mapToDB(item, user.id));
        await supabase.from('memos').upsert(defaultData);
      }

      setItems(loadedItems);

      // 初期データセット完了後、ステートが安定するまで自動保存をロックする
      setTimeout(() => {
        isReadyForAutoSave.current = true;
      }, 1000);

      const savedDelay = await AsyncStorage.getItem('dragDelaySec');
      if (savedDelay !== null) {
        setDragDelaySec(parseFloat(savedDelay));
      }

    } catch (error) {
      console.error("読み込みエラー", error);
      Alert.alert("エラー", "データの読み込みに失敗しました。再読み込みしてください。");
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const upsertData = items.map(item => mapToDB(item, user.id));
        const { error } = await supabase.from('memos').upsert(upsertData);
        if (error) throw error;

        await AsyncStorage.setItem('my_memo_order', JSON.stringify(items.map(i => i.id)));

        if (Platform.OS === 'web') {
          window.alert("現在のメモと配置を保存しました。");
        } else {
          Alert.alert("保存完了", "現在のメモと配置を保存しました。");
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert("ログインしていません");
        } else {
          Alert.alert("エラー", "ログインしていません");
        }
      }
    } catch (err) {
      console.error("Save failed:", err);
      if (Platform.OS === 'web') {
        window.alert("保存に失敗しました。");
      } else {
        Alert.alert("エラー", "保存に失敗しました。");
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    // 初期ロード中、空データ、または自動保存ロック中は絶対に保存させない
    if (!isLoaded || items.length === 0 || !isReadyForAutoSave.current) return;

    const timer = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const upsertData = items.map(item => mapToDB(item, user.id));
          const { error } = await supabase.from('memos').upsert(upsertData);
          if (error) console.error("Save Error:", error);
          await AsyncStorage.setItem('my_memo_order', JSON.stringify(items.map(i => i.id)));
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [items, isLoaded]);

  const changeDragDelay = async (sec: number) => {
    setDragDelaySec(sec);
    await AsyncStorage.setItem('dragDelaySec', sec.toString());
  };

  const jumpToItem = (item: Item) => {
    animateLayout();
    setIsSearchOpen(false);
    setIsSettingsOpen(false);

    const buildHistory = (targetParentId: string | null) => {
      if (targetParentId === null) return [{ id: null, title: 'メモ帳' }];
      const h: { id: string | null; title: string }[] = [];
      let curr: string | null = targetParentId;
      while (curr !== null) {
        const parentFolder = items.find(i => i.id === curr);
        if (!parentFolder) break;
        h.unshift({ id: parentFolder.id, title: parentFolder.title || '無題のフォルダ' });
        curr = parentFolder.parentId;
      }
      return [{ id: null, title: 'メモ帳' }, ...h];
    };

    setHistory(buildHistory(item.parentId));
    setCurrentParentId(item.parentId);
    setIsSelectMode(false);
    setSelectedIds([]);
    setEditingFolderId(null);
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
    setItems(prev => {
      pushHistory(prev);
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
      if (type === 'folder') {
        setTimeout(() => setEditingFolderId(newId), 50);
      }
      return [...prev, newItem];
    });
  };

  const updateItem = (id: string, updates: Partial<Item>, isTextEdit: boolean = false) => {
    setItems(prev => {
      if (isTextEdit) {
        if (!isTyping.current) {
          pushHistory(prev);
          isTyping.current = true;
        }
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
          isTyping.current = false;
        }, 1500);
      } else {
        pushHistory(prev);
      }
      return prev.map(item => item.id === id ? { ...item, ...updates } : item);
    });
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
      
      setItems(prev => {
        pushHistory(prev);
        return prev.filter(item => !idsToDelete.has(item.id));
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('memos').delete().in('id', Array.from(idsToDelete));
      }
      setIsSelectMode(false);
      setSelectedIds([]);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${selectedIds.length}件の項目を削除しますか？`)) {
        executeDelete();
      }
    } else {
      Alert.alert("削除の確認", `${selectedIds.length}件の項目を削除しますか？`, [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: executeDelete }
      ]);
    }
  };

  const handleUndo = async () => {
    if (pastStatesRef.current.length === 0) return;
    const previousStateStr = pastStatesRef.current.pop();
    if (previousStateStr) {
      animateLayout();
      const previousState = JSON.parse(previousStateStr);
      setItems(previousState);
      setCanUndo(pastStatesRef.current.length > 0);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user && previousState.length > 0) {
        const upsertData = previousState.map((item: Item) => mapToDB(item, user.id));
        await supabase.from('memos').upsert(upsertData);
      }
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

  const [isSummarizing, setIsSummarizing] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);

  const handleRecord = async (id: string) => {
    try {
      if (recording && recordingItemId === id) {
        // 録音停止＆送信
        setRecordingItemId(null);
        setRecording(null);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        
        if (!uri) return;

        let base64Audio = '';
        if (Platform.OS === 'web') {
          const response = await fetch(uri);
          const blob = await response.blob();
          base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              resolve(dataUrl.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          base64Audio = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
        }

        setIsSummarizing(id);
        
        const { data, error } = await supabase.functions.invoke('transcribe', {
          body: {
            audio: base64Audio,
            mimeType: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/m4a' // expo-av records in m4a by default
          },
        });

        if (error) throw error;
        const transcript = data?.transcript;

        if (transcript) {
          setItems(prev => {
            pushHistory(prev);
            return prev.map(item => {
              if (item.id === id) {
                const newText = item.text ? `${item.text}\n[音声入力: ${transcript.trim()}]` : `[音声入力: ${transcript.trim()}]`;
                return { ...item, text: newText };
              }
              return item;
            });
          });
        }
      } else {
        // 録音開始
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status === 'granted') {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
          const { recording: newRecording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          setRecording(newRecording);
          setRecordingItemId(id);
        } else {
          Alert.alert("エラー", "マイクへのアクセスが許可されていません");
        }
      }
    } catch (e: any) {
      console.error("Recording/Transcription Error:", e);
      const errMsg = e.message || "文字起こしに失敗しました";
      if (Platform.OS === 'web') window.alert(`エラー: ${errMsg}`);
      else Alert.alert("エラー", `文字起こしに失敗しました: ${errMsg}`);
    } finally {
      setIsSummarizing(null);
    }
  };

  const handleSummarize = async (id: string, text: string) => {
    if (!text || text.trim() === '') {
      if (Platform.OS === 'web') window.alert("メモが空です");
      else Alert.alert("エラー", "メモが空です");
      return;
    }
    
    setIsSummarizing(id);
    try {
      const { data, error } = await supabase.functions.invoke('summarize', {
        body: { text },
      });

      if (error) throw error;
      const summary = data?.summary;
      
      if (summary) {
        setItems(prev => {
          pushHistory(prev);
          return prev.map(item => {
            if (item.id === id) {
              const newText = `[AI要約]\n${summary.trim()}\n\n---\n${item.text}`;
              return { ...item, text: newText };
            }
            return item;
          });
        });
      }
    } catch (e: any) {
      console.error("Summarize Error:", e);
      const errMsg = e.message || "要約に失敗しました";
      if (Platform.OS === 'web') window.alert(`エラー: ${errMsg}`);
      else Alert.alert("エラー", `要約に失敗しました: ${errMsg}`);
    } finally {
      setIsSummarizing(null);
    }
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
    setItems(prev => {
      pushHistory(prev);
      return prev.map(item =>
        movingItemIds.includes(item.id) ? { ...item, parentId: currentParentId } : item
      );
    });
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

  const handleFolderIconPress = (id: string, currentUri: string | undefined | null) => {
    if (Platform.OS === 'web') {
      if (currentUri) {
        const confirm = window.confirm("アイコンを変更しますか？「キャンセル」を押すと初期アイコンに戻します。");
        if (confirm) {
          pickFolderIcon(id);
        } else {
          updateItem(id, { folderIconUri: null });
        }
      } else {
        pickFolderIcon(id);
      }
    } else {
      if (currentUri) {
        Alert.alert(
          "アイコンの変更",
          "どうしますか？",
          [
            { text: "キャンセル", style: "cancel" },
            { text: "初期アイコンに戻す", onPress: () => updateItem(id, { folderIconUri: null }) },
            { text: "別の画像を選ぶ", onPress: () => pickFolderIcon(id) }
          ]
        );
      } else {
        pickFolderIcon(id);
      }
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

  const moveItemUp = (id: string) => {
    animateLayout();
    setItems(prev => {
      pushHistory(prev);
      const currentParentItems = prev.filter(item => item.parentId === currentParentId);
      const currentIdx = currentParentItems.findIndex(item => item.id === id);
      if (currentIdx <= 0) return prev;
      const targetId = currentParentItems[currentIdx - 1].id;

      const idx1 = prev.findIndex(item => item.id === id);
      const idx2 = prev.findIndex(item => item.id === targetId);

      const newItems = [...prev];
      const temp = newItems[idx1];
      newItems[idx1] = newItems[idx2];
      newItems[idx2] = temp;
      return newItems;
    });
  };

  const moveItemDown = (id: string) => {
    animateLayout();
    setItems(prev => {
      pushHistory(prev);
      const currentParentItems = prev.filter(item => item.parentId === currentParentId);
      const currentIdx = currentParentItems.findIndex(item => item.id === id);
      if (currentIdx === -1 || currentIdx >= currentParentItems.length - 1) return prev;
      const targetId = currentParentItems[currentIdx + 1].id;

      const idx1 = prev.findIndex(item => item.id === id);
      const idx2 = prev.findIndex(item => item.id === targetId);

      const newItems = [...prev];
      const temp = newItems[idx1];
      newItems[idx1] = newItems[idx2];
      newItems[idx2] = temp;
      return newItems;
    });
  };

  const renderTree = (parentId: string | null, depth: number = 0) => {
    const children = items.filter(i => i.parentId === parentId);
    return children.map(child => (
      <View key={child.id}>
        <TouchableOpacity 
          style={[styles.treeItem, { paddingLeft: 16 + depth * 20 }]} 
          onPress={() => jumpToItem(child)}
        >
          <MaterialIcons name={child.type === 'folder' ? 'folder' : 'note'} size={20} color={child.type === 'folder' ? THEME_COLORS.blue : THEME_COLORS.green} style={{ marginRight: 8 }} />
          <Text style={styles.treeItemText} numberOfLines={1}>
            {child.title || (child.type === 'folder' ? '無題のフォルダ' : '無題のメモ')}
          </Text>
        </TouchableOpacity>
        {child.type === 'folder' && renderTree(child.id, depth + 1)}
      </View>
    ));
  };

  const renderItem = ({ item, drag, isActive }: any) => {
    const isEditing = editingFolderId === item.id;
    const isThisItemMoving = isMoving && movingItemIds.includes(item.id);

    const content = (
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={isDragMode ? drag : undefined}
        delayLongPress={dragDelaySec * 1000}
        disabled={!isDragMode}
      >
        <View style={[
          styles.itemCard,
          isThisItemMoving && { opacity: 0.4 },
          isActive && styles.itemCardActive
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
                        onPress={() => handleFolderIconPress(item.id, item.folderIconUri)}
                      />
                    </>
                  )}
                </View>

                {isEditing ? (
                  <TextInput
                    style={styles.folderInput}
                    value={item.title}
                    onChangeText={(text) => updateItem(item.id, { title: text }, true)}
                    placeholder="無題のフォルダ"
                    placeholderTextColor={THEME_COLORS.textSecondary}
                    autoFocus
                    editable={!isDragMode}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8 }}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => setEditingFolderId(item.id)}>
                      <MaterialIcons name="edit" size={22} color={THEME_COLORS.textSecondary} />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'column', backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 8 }}>
                      <TouchableOpacity style={{ padding: 2 }} onPress={() => moveItemUp(item.id)}>
                        <MaterialIcons name="arrow-upward" size={22} color={THEME_COLORS.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={{ padding: 2 }} onPress={() => moveItemDown(item.id)}>
                        <MaterialIcons name="arrow-downward" size={22} color={THEME_COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {item.type === 'note' && (
            <View style={styles.noteContainer}>
              <View style={styles.noteHeader}>
                <TextInput
                  style={[styles.noteTitleInput, { marginRight: 36 }]}
                  value={item.title}
                  onChangeText={(text) => updateItem(item.id, { title: text }, true)}
                  placeholder="タイトル"
                  placeholderTextColor={THEME_COLORS.textSecondary}
                  selectionColor={THEME_COLORS.blue}
                  editable={!isSelectMode && !isThisItemMoving && !isDragMode}
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
                  <View style={{ position: 'absolute', right: -4, top: -4, backgroundColor: '#F3F4F6', borderRadius: 8 }}>
                    <TouchableOpacity style={{ padding: 8 }} onPress={() => moveItemUp(item.id)} disabled={isThisItemMoving}>
                      <MaterialIcons name="arrow-upward" size={22} color={THEME_COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TextInput
                style={[styles.noteInput, { height: Math.max(78, inputHeights[item.id] || 78) }]}
                value={item.text}
                onChangeText={(text) => updateItem(item.id, { text: text }, true)}
                onContentSizeChange={(e) => {
                  setInputHeights(prev => ({
                    ...prev,
                    [item.id]: e.nativeEvent.contentSize.height
                  }));
                }}
                placeholder="メモを入力..."
                placeholderTextColor={THEME_COLORS.textSecondary}
                multiline
                numberOfLines={3}
                scrollEnabled={false}
                selectionColor={THEME_COLORS.blue}
                editable={!isSelectMode && !isThisItemMoving && !isDragMode}
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
                <TouchableOpacity
                  style={[styles.chipButton, recordingItemId === item.id && { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}
                  onPress={() => !isSelectMode && handleRecord(item.id)}
                  disabled={isThisItemMoving || (recording !== null && recordingItemId !== item.id) || isSummarizing === item.id}
                >
                  {recordingItemId === item.id ? (
                    <MaterialIcons name="stop" size={18} color={THEME_COLORS.red} />
                  ) : (
                    <MaterialIcons name="mic" size={18} color={recording !== null ? THEME_COLORS.textSecondary : THEME_COLORS.blue} />
                  )}
                  <Text style={[styles.chipText, { color: recordingItemId === item.id ? THEME_COLORS.red : (recording !== null ? THEME_COLORS.textSecondary : THEME_COLORS.blue) }]}>
                    {recordingItemId === item.id ? "停止" : "音声"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.chipButton, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]} 
                  onPress={() => !isSelectMode && handleSummarize(item.id, item.text)} 
                  disabled={isThisItemMoving || isSummarizing === item.id}
                >
                  {isSummarizing === item.id ? (
                    <ActivityIndicator size="small" color={THEME_COLORS.green} style={{ width: 18, height: 18 }} />
                  ) : (
                    <MaterialIcons name="auto-awesome" size={18} color={THEME_COLORS.green} />
                  )}
                  <Text style={[styles.chipText, { color: THEME_COLORS.green }]}>
                    {isSummarizing === item.id ? "要約中..." : "AI要約"}
                  </Text>
                </TouchableOpacity>
                {!isSelectMode && (
                  <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: -4, marginBottom: -4 }}>
                      <TouchableOpacity style={{ padding: 8 }} onPress={() => moveItemDown(item.id)} disabled={isThisItemMoving}>
                        <MaterialIcons name="arrow-downward" size={22} color={THEME_COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
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
      </TouchableOpacity>
    );

    if (isDragMode) {
      return (
        <ScaleDecorator>
          {content}
        </ScaleDecorator>
      );
    }
    return content;
  };

  if (!isLoaded) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={THEME_COLORS.blue} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen
          options={{
            headerTitle: isSelectMode ? `${selectedIds.length}件選択` : isMoving ? '移動先の選択' : currentTitle,
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
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(true)}
                onLongPress={() => {
                  setIsDragMode(prev => {
                    const nextMode = !prev;
                    if (Platform.OS === 'web') {
                      window.alert(nextMode ? "ドラッグモードをオンにしました\n長押しで配置変更できます" : "ドラッグモードをオフにしました");
                    } else {
                      Alert.alert("ドラッグモード", nextMode ? "オンにしました\n長押しで配置変更できます" : "オフにしました");
                    }
                    return nextMode;
                  });
                }}
                style={styles.headerButton}
              >
                <MaterialIcons name="settings" size={24} color={isDragMode ? THEME_COLORS.blue : THEME_COLORS.textSecondary} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={handleUndo} style={styles.headerButton} disabled={!canUndo}>
                  <MaterialIcons name="undo" size={26} color={canUndo ? THEME_COLORS.blue : THEME_COLORS.border} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
                  <MaterialIcons name="save" size={26} color={THEME_COLORS.blue} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onRefresh} style={styles.headerButton} disabled={refreshing}>
                  {refreshing ? (
                    <ActivityIndicator size="small" color={THEME_COLORS.blue} style={{ width: 26, height: 26 }} />
                  ) : (
                    <MaterialIcons name="refresh" size={26} color={THEME_COLORS.blue} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { animateLayout(); setIsSelectMode(true); }} style={styles.headerButton}>
                  <MaterialIcons name="checklist" size={26} color={THEME_COLORS.blue} />
                </TouchableOpacity>
              </View>
            ),
            headerStyle: { backgroundColor: THEME_COLORS.background },
            headerTintColor: THEME_COLORS.textMain,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
            headerShadowVisible: false,
          }}
        />

        {isDragMode ? (
          <DraggableFlatList
            data={currentItems}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => {
              setItems(prev => {
                pushHistory(prev);
                const newItems = [...prev];
                let dataIndex = 0;
                for (let i = 0; i < newItems.length; i++) {
                  if (newItems[i].parentId === currentParentId) {
                    newItems[i] = data[dataIndex++];
                  }
                }
                return newItems;
              });
            }}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: isMoving ? 450 : 400, padding: 16 }}
            showsVerticalScrollIndicator={false}
            activationDistance={10}
          />
        ) : (
          <FlatList
            data={currentItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: isMoving ? 450 : 400, padding: 16 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={THEME_COLORS.blue}
                colors={[THEME_COLORS.blue]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialIcons name="note" size={64} color={'#D1D5DB'} />
                <Text style={styles.emptyText}>この階層には何もありません</Text>
              </View>
            }
          />
        )}

        {isMoving && (
          <View style={styles.moveBanner}>
            <Text style={styles.moveBannerText}>${movingItemIds.length}件の項目を移動中</Text>
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
          <View style={styles.searchFabWrapper}>
            <TouchableOpacity
              style={styles.searchFab}
              onPress={() => setIsSearchOpen(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="search" size={28} color={'#FFF'} />
            </TouchableOpacity>
          </View>
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

        <Modal visible={isSettingsOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.settingsCard, { maxHeight: '80%', paddingHorizontal: 0, paddingBottom: 0 }]}>
              <Text style={[styles.settingsTitle, { paddingHorizontal: 24 }]}>フォルダ・メモ一覧</Text>
              <Text style={[styles.settingsSubtitle, { paddingHorizontal: 24 }]}>タップするとその場所へ移動します</Text>

              <ScrollView style={{ width: '100%', flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
                {renderTree(null)}
              </ScrollView>

              <TouchableOpacity
                style={[styles.closeSettingsButton, { margin: 24 }]}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.closeSettingsText}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={isSearchOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.settingsCard, { maxHeight: '80%', paddingHorizontal: 0, paddingBottom: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, padding: 12, fontSize: 16, color: THEME_COLORS.textMain }}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="キーワード検索..."
                  placeholderTextColor={THEME_COLORS.textSecondary}
                  autoFocus
                />
                <TouchableOpacity onPress={() => { setIsSearchOpen(false); setSearchQuery(''); }} style={{ padding: 12, marginLeft: 8 }}>
                  <MaterialIcons name="close" size={24} color={THEME_COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={items.filter(item => 
                  searchQuery.trim() !== '' && 
                  ((item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                   (item.text || '').toLowerCase().includes(searchQuery.toLowerCase()))
                )}
                keyExtractor={item => item.id}
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.searchResultItem} onPress={() => jumpToItem(item)}>
                    <MaterialIcons name={item.type === 'folder' ? 'folder' : 'note'} size={24} color={item.type === 'folder' ? THEME_COLORS.blue : THEME_COLORS.green} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title || (item.type === 'folder' ? '無題のフォルダ' : '無題のメモ')}</Text>
                      {item.type === 'note' && !!item.text && (
                        <Text style={styles.searchResultText} numberOfLines={1}>{item.text}</Text>
                      )}
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={THEME_COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  searchQuery.trim() !== '' ? (
                    <Text style={{ textAlign: 'center', marginTop: 40, color: THEME_COLORS.textSecondary }}>見つかりませんでした</Text>
                  ) : (
                    <Text style={{ textAlign: 'center', marginTop: 40, color: THEME_COLORS.textSecondary }}>キーワードを入力してください</Text>
                  )
                }
              />
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </View>
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
    minHeight: 78, // 26 * 3 = 78 (3行分)
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
    flexWrap: 'wrap',
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
  },
  searchFabWrapper: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    zIndex: 11
  },
  searchFab: {
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
  treeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  treeItemText: {
    fontSize: 16,
    color: THEME_COLORS.textMain,
    flex: 1
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  searchResultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.textMain,
    marginBottom: 4
  },
  searchResultText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary
  }
});

