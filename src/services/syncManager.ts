import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getAllDiaries, restoreAllDiaries, mergeDiaries, DiaryItem, Attachment } from './db';
import { useAppStore, Todolist } from '../store/store';
import { RoutineItem } from '../utils/routineHelper';
import {
  getValidAccessToken,
  getStoredGoogleUser,
  getLastBackupTime,
  setLastBackupTime,
} from './googleAuth';
import {
  findBackupFile,
  TidaCloudBackup,
  CloudFileInfo,
} from './googleDrive';
import { GOOGLE_CONFIG } from '../constants/googleConfig';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

type SyncListener = (status: SyncStatus, lastTime: string | null) => void;

let currentStatus: SyncStatus = 'idle';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInternalSyncing = false;
const listeners = new Set<SyncListener>();

function notifyListeners() {
  getLastBackupTime().then((lastTime) => {
    listeners.forEach((listener) => {
      try {
        listener(currentStatus, lastTime);
      } catch (err) {
        console.warn('Sync listener error:', err);
      }
    });
  });
}

function setStatus(status: SyncStatus) {
  currentStatus = status;
  notifyListeners();
  if (status === 'synced') {
    // 3초 후 idle로 복귀
    setTimeout(() => {
      if (currentStatus === 'synced') {
        currentStatus = 'idle';
        notifyListeners();
      }
    }, 3000);
  }
}

export function addSyncListener(listener: SyncListener): () => void {
  listeners.add(listener);
  getLastBackupTime().then((time) => listener(currentStatus, time));
  return () => {
    listeners.delete(listener);
  };
}

type SyncDataPulledListener = () => void;
const dataPulledListeners = new Set<SyncDataPulledListener>();

export function onSyncDataPulled(listener: SyncDataPulledListener): () => void {
  dataPulledListeners.add(listener);
  return () => {
    dataPulledListeners.delete(listener);
  };
}

export function notifySyncDataPulled() {
  dataPulledListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('Sync data pulled listener error:', e);
    }
  });
}

export function getCurrentSyncStatus(): SyncStatus {
  return currentStatus;
}

/**
 * 2개의 투두 목록 스마트 병합 (ID 기준)
 */
function mergeTodoList(local: Todolist[], incoming: Todolist[]): Todolist[] {
  const map = new Map<string, Todolist>();
  local.forEach((t) => map.set(t.id, { ...t }));

  incoming.forEach((remote) => {
    if (!map.has(remote.id)) {
      // 로컬에 없는 신규 항목 추가
      map.set(remote.id, remote);
    } else {
      // 둘 다 존재하는 경우: 서브투두 및 상태 병합
      const existing = map.get(remote.id)!;
      const subMap = new Map<string, any>();
      (existing.subTodos || []).forEach((st) => subMap.set(st.id, st));
      (remote.subTodos || []).forEach((st) => {
        if (!subMap.has(st.id)) {
          subMap.set(st.id, st);
        } else {
          // 둘 중 완료된 상태가 있으면 완료로 유지
          const localSt = subMap.get(st.id);
          subMap.set(st.id, {
            ...localSt,
            completed: localSt.completed || st.completed,
          });
        }
      });

      map.set(remote.id, {
        ...existing,
        completed: existing.completed || remote.completed,
        subTodos: Array.from(subMap.values()),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

/**
 * 2개의 루틴 목록 스마트 병합 (완료일자 합집합)
 */
function mergeRoutineList(local: RoutineItem[], incoming: RoutineItem[]): RoutineItem[] {
  const map = new Map<string, RoutineItem>();
  local.forEach((r) => map.set(r.id, { ...r }));

  incoming.forEach((remote) => {
    if (!map.has(remote.id)) {
      map.set(remote.id, remote);
    } else {
      const existing = map.get(remote.id)!;
      // 완료일자 합집합(Set)으로 통합 (어느 한 기기에서 체크한 기록도 유실되지 않음)
      const mergedDates = Array.from(
        new Set([...(existing.completedDates || []), ...(remote.completedDates || [])]),
      );

      // 서브루틴 완료일자 통합
      const subMap = new Map<string, any>();
      (existing.subRoutines || []).forEach((sr) => subMap.set(sr.id, { ...sr }));
      (remote.subRoutines || []).forEach((sr) => {
        if (!subMap.has(sr.id)) {
          subMap.set(sr.id, sr);
        } else {
          const exSr = subMap.get(sr.id);
          const combinedSrDates = Array.from(
            new Set([...(exSr.completedDates || []), ...(sr.completedDates || [])]),
          );
          subMap.set(sr.id, { ...exSr, completedDates: combinedSrDates });
        }
      });

      map.set(remote.id, {
        ...existing,
        completedDates: mergedDates,
        subRoutines: Array.from(subMap.values()),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

/**
 * 조용한 백그라운드 데이터 업로드 (클라우드 최신화)
 */
async function executeUpload(): Promise<boolean> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return false;

  const diaries = getAllDiaries();
  const attachmentsMap: Record<string, string> = {};

  for (const item of diaries) {
    if (!item.attachmentsJson) continue;
    try {
      const atts: Attachment[] = JSON.parse(item.attachmentsJson);
      if (Array.isArray(atts)) {
        for (const att of atts) {
          if (att.filePath && att.fileName && !attachmentsMap[att.fileName]) {
            try {
              const info = await FileSystem.getInfoAsync(att.filePath);
              if (info.exists) {
                const base64 = await FileSystem.readAsStringAsync(att.filePath, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                attachmentsMap[att.fileName] = base64;
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  const storeState = useAppStore.getState();
  const nowIso = new Date().toISOString();

  const backupData: TidaCloudBackup = {
    manifest: {
      app: 'TIDA',
      version: '1.0.0',
      backupDate: nowIso,
      platform: 'mobile',
      description: 'TIDA Auto-Sync Data',
    },
    diary: diaries,
    todos: storeState.todos || [],
    routines: storeState.routines || [],
    attachments: attachmentsMap,
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
  const existingFile = await findBackupFile(accessToken);
  let savedModifiedTime = nowIso;

  if (existingFile) {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media&fields=id,name,modifiedTime`;
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: jsonContent,
    });
    if (!res.ok) throw new Error(`Upload update failed: ${res.status}`);
    const data = await res.json().catch(() => null);
    if (data?.modifiedTime) {
      savedModifiedTime = data.modifiedTime;
    }
  } else {
    const boundary = 'tida_sync_' + Date.now();
    const metadata = JSON.stringify({
      name: GOOGLE_CONFIG.BACKUP_FILE_NAME,
      mimeType: 'application/json',
      description: 'TIDA Data Sync (Timeline, Photos, Todos, Routines)',
    });
    const multipartBody =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonContent}\r\n` +
      `--${boundary}--`;

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!res.ok) throw new Error(`Upload create failed: ${res.status}`);
    const data = await res.json().catch(() => null);
    if (data?.modifiedTime) {
      savedModifiedTime = data.modifiedTime;
    }
  }

  await setLastBackupTime(savedModifiedTime);
  return true;
}

/**
 * 데이터 변경 시 호출하는 디바운스 자동 동기화 트리거
 * (2.5초간 추가 조작이 없으면 백그라운드에서 조용히 업로드)
 */
export function triggerAutoSync(delayMs = 2500) {
  if (isInternalSyncing) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    try {
      const user = await getStoredGoogleUser();
      if (!user) return; // 미연동 시 스킵

      setStatus('syncing');
      await executeUpload();
      setStatus('synced');
    } catch (err) {
      console.warn('Debounced auto-sync error:', err);
      setStatus('error');
    }
  }, delayMs);
}

/**
 * 대기 중인 디바운스 자동 동기화가 있다면 즉시 실행
 * (앱이 백그라운드로 전환되거나 닫힐 때 변경사항 누락 완전 방지)
 */
export async function flushAutoSync(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    try {
      const user = await getStoredGoogleUser();
      if (!user) return;
      setStatus('syncing');
      await executeUpload();
      setStatus('synced');
    } catch (err) {
      console.warn('Flush auto-sync error:', err);
      setStatus('error');
    }
  }
}

/**
 * 앱 시작 시 (또는 포커스 시) 실행되는 시작 동기화
 * 클라우드가 로컬보다 최신이면 클라우드 상태를 진실(Single Source of Truth)로 받아들여
 * 로컬 데이터를 완전히 최신 상태로 갱신 (삭제/체크해제 등 완벽 반영)
 */
export async function performStartupSync(): Promise<void> {
  try {
    const user = await getStoredGoogleUser();
    if (!user) return;

    const accessToken = await getValidAccessToken();
    if (!accessToken) return;

    const file = await findBackupFile(accessToken);
    if (!file) {
      // 클라우드에 아직 파일이 없으면 현재 로컬 데이터를 최초 업로드
      setStatus('syncing');
      await executeUpload();
      setStatus('synced');
      return;
    }

    const localLastSync = await getLastBackupTime();
    const cloudModifiedTime = new Date(file.modifiedTime).getTime();
    const localSyncTime = localLastSync ? new Date(localLastSync).getTime() : 0;

    // 클라우드가 로컬보다 최신이거나 첫 동기화인 경우 다운로드 & 최신 상태로 갱신
    if (cloudModifiedTime > localSyncTime || localSyncTime === 0) {
      setStatus('syncing');
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const cloudData = (await res.json()) as TidaCloudBackup;

        isInternalSyncing = true;
        try {
          const attDir = `${FileSystem.documentDirectory}attachments/`;

          // 1. 타임라인 일기 최신 상태로 복원 (클라우드에서 삭제된 글은 로컬에서도 완벽 제거)
          const remoteDiaries = Array.isArray(cloudData.diary) ? cloudData.diary : [];
          for (const item of remoteDiaries) {
            if (item.attachmentsJson) {
              try {
                const atts: Attachment[] = JSON.parse(item.attachmentsJson);
                if (Array.isArray(atts)) {
                  for (const att of atts) {
                    if (att.fileName) {
                      att.filePath = `${attDir}${att.fileName}`;
                    }
                  }
                  item.attachmentsJson = JSON.stringify(atts);
                }
              } catch (_) {}
            }
          }

          const rawData = cloudData as any;
          const remoteTodos = Array.isArray(cloudData.todos)
            ? cloudData.todos
            : Array.isArray(rawData.settings?.todos)
              ? rawData.settings.todos
              : [];
          const remoteRoutines = Array.isArray(cloudData.routines)
            ? cloudData.routines
            : Array.isArray(rawData.settings?.routines)
              ? rawData.settings.routines
              : [];

          // 첫 연동(localSyncTime === 0)인데 로컬에도 기존 데이터가 있는 경우:
          // 클라우드와 로컬을 합집합으로 병합하여 기존 로컬 데이터 유실 방지
          const currentDiaries = getAllDiaries();
          const currentStore = useAppStore.getState();
          const currentTodos = currentStore.todos || [];
          const currentRoutines = currentStore.routines || [];
          const isInitialSyncWithLocalData =
            localSyncTime === 0 &&
            (currentDiaries.length > 0 || currentTodos.length > 0 || currentRoutines.length > 0);

          if (isInitialSyncWithLocalData) {
            // 1. 다이어리 합집합 병합
            mergeDiaries(remoteDiaries);

            // 2. 투두 & 루틴 스마트 병합
            const mergedTodos = mergeTodoList(currentTodos, remoteTodos);
            const mergedRoutines = mergeRoutineList(currentRoutines, remoteRoutines);

            useAppStore.setState((state) => ({
              ...state,
              todos: mergedTodos,
              routines: mergedRoutines,
            }));

            // 합본을 클라우드에 재업로드하여 양쪽 데이터 모두 보존
            await executeUpload();
          } else {
            // 평상시 동기화: 클라우드 최신 스냅샷으로 100% 덮어쓰기 (삭제/체크해제 완벽 반영)
            restoreAllDiaries(remoteDiaries);

            useAppStore.setState((state) => ({
              ...state,
              todos: remoteTodos,
              routines: remoteRoutines,
            }));

            await setLastBackupTime(file.modifiedTime);
          }

          // ★ [초고속 반영] 텍스트가 복원되었으므로 화면을 즉시 갱신 (0.2초 이내)
          notifySyncDataPulled();

          // 3. 첨부 사진 복원은 백그라운드 비동기로 처리 (화면 블로킹 없음)
          const remoteAttachments = cloudData.attachments;
          if (remoteAttachments && typeof remoteAttachments === 'object') {
            (async () => {
              try {
                const dirInfo = await FileSystem.getInfoAsync(attDir);
                if (!dirInfo.exists) {
                  await FileSystem.makeDirectoryAsync(attDir, { intermediates: true });
                }
                for (const [fileName, base64] of Object.entries(remoteAttachments)) {
                  if (!fileName || !base64) continue;
                  const targetPath = `${attDir}${fileName}`;
                  const fInfo = await FileSystem.getInfoAsync(targetPath);
                  if (!fInfo.exists) {
                    await FileSystem.writeAsStringAsync(targetPath, base64, {
                      encoding: FileSystem.EncodingType.Base64,
                    });
                  }
                }
                // 사진 파일 저장이 끝나면 타임라인 이미지 새로고침
                notifySyncDataPulled();
              } catch (attErr) {
                console.warn('Background attachments download error:', attErr);
              }
            })();
          }
        } finally {
          isInternalSyncing = false;
        }

        // 최신 클라우드 데이터를 내려받았으므로 불필요한 재업로드(executeUpload)는 생략
        setStatus('synced');
      } else {
        setStatus('error');
      }
    } else {
      // 이미 로컬이 최신 상태인 경우 별도 작업 없음
      setStatus('synced');
    }
  } catch (err) {
    console.warn('Startup sync error:', err);
    setStatus('error');
  }
}

/**
 * 수동 즉시 동기화 (설정 등에서 [지금 동기화] 눌렀을 때 조용히 실행)
 */
export async function performImmediateSync(): Promise<boolean> {
  try {
    const user = await getStoredGoogleUser();
    if (!user) return false;

    setStatus('syncing');
    await performStartupSync();
    await executeUpload();
    setStatus('synced');
    return true;
  } catch (err) {
    console.warn('Immediate sync error:', err);
    setStatus('error');
    return false;
  }
}

/**
 * Zustand 스토어(todos, routines) 변경 감지 자동 리스너 초기화
 */
export function initStoreSyncListener(): () => void {
  return useAppStore.subscribe((state, prevState) => {
    if (isInternalSyncing) return;

    const todosChanged = state.todos !== prevState.todos;
    const routinesChanged = state.routines !== prevState.routines;

    if (todosChanged || routinesChanged) {
      triggerAutoSync();
    }
  });
}

/**
 * 앱이 켜져 있는 동안 주기적으로(기본 3분) 상대 기기(PC 등)의 최신 변경사항을 확인하고 자동 동기화
 * (앱이 화면에 표시되는 active 상태일 때만 동작하여 배터리/데이터 보존)
 */
export function startPeriodicSyncCheck(intervalMs = 180000): () => void {
  const timer = setInterval(async () => {
    if (AppState.currentState !== 'active') return;
    if (isInternalSyncing || currentStatus === 'syncing') return;
    try {
      const user = await getStoredGoogleUser();
      if (!user) return;
      const accessToken = await getValidAccessToken();
      if (!accessToken) return;

      const file = await findBackupFile(accessToken);
      if (!file) return;

      const localLastSync = await getLastBackupTime();
      const cloudModifiedTime = new Date(file.modifiedTime).getTime();
      const localSyncTime = localLastSync ? new Date(localLastSync).getTime() : 0;

      if (cloudModifiedTime > localSyncTime) {
        await performStartupSync();
      }
    } catch (_) {}
  }, intervalMs);

  return () => clearInterval(timer);
}

