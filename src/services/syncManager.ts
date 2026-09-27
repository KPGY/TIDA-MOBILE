import * as FileSystem from 'expo-file-system/legacy';
import { getAllDiaries, mergeDiaries, DiaryItem, Attachment } from './db';
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

  if (existingFile) {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: jsonContent,
    });
    if (!res.ok) throw new Error(`Upload update failed: ${res.status}`);
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

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!res.ok) throw new Error(`Upload create failed: ${res.status}`);
  }

  await setLastBackupTime(nowIso);
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
 * 앱 시작 시 (또는 포커스 시) 실행되는 시작 동기화
 * (클라우드에 최신 데이터가 있으면 스마트하게 병합하고, 로컬 최신 데이터가 있으면 드라이브 갱신)
 */
export async function performStartupSync(): Promise<void> {
  try {
    const user = await getStoredGoogleUser();
    if (!user) return;

    const accessToken = await getValidAccessToken();
    if (!accessToken) return;

    setStatus('syncing');

    const file = await findBackupFile(accessToken);
    if (!file) {
      // 클라우드에 아직 파일이 없으면 현재 로컬 데이터를 최초 업로드
      await executeUpload();
      setStatus('synced');
      return;
    }

    const localLastSync = await getLastBackupTime();
    const cloudModifiedTime = new Date(file.modifiedTime).getTime();
    const localSyncTime = localLastSync ? new Date(localLastSync).getTime() : 0;

    // 클라우드가 로컬보다 최신이거나 첫 동기화인 경우 다운로드 & 병합
    if (cloudModifiedTime > localSyncTime || localSyncTime === 0) {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const cloudData = (await res.json()) as TidaCloudBackup;

        isInternalSyncing = true;
        try {
          // 1. 첨부 사진 복원
          const attDir = `${FileSystem.documentDirectory}attachments/`;
          try {
            const dirInfo = await FileSystem.getInfoAsync(attDir);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(attDir, { intermediates: true });
            }
          } catch (_) {}

          if (cloudData.attachments && typeof cloudData.attachments === 'object') {
            for (const [fileName, base64] of Object.entries(cloudData.attachments)) {
              if (!fileName || !base64) continue;
              const targetPath = `${attDir}${fileName}`;
              try {
                const fInfo = await FileSystem.getInfoAsync(targetPath);
                if (!fInfo.exists) {
                  await FileSystem.writeAsStringAsync(targetPath, base64, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                }
              } catch (_) {}
            }
          }

          // 2. 타임라인 일기 스마트 병합
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
          mergeDiaries(remoteDiaries);

          // 3. 투두 & 루틴 스마트 병합
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

          const currentStore = useAppStore.getState();
          const mergedTodos = mergeTodoList(currentStore.todos || [], remoteTodos);
          const mergedRoutines = mergeRoutineList(currentStore.routines || [], remoteRoutines);

          useAppStore.setState((state) => ({
            ...state,
            todos: mergedTodos,
            routines: mergedRoutines,
          }));

          await setLastBackupTime(file.modifiedTime);
          notifySyncDataPulled();
        } finally {
          isInternalSyncing = false;
        }

        // 스마트 병합 후 로컬의 기존 데이터와 클라우드 데이터가 합쳐진 전체 합집합을
        // 즉시 클라우드에 다시 업로드하여, 기기 내 과거 데이터가 구글 드라이브에 누락 없이 반영되도록 보장
        await executeUpload();
        notifySyncDataPulled();
      }
    }

    setStatus('synced');
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
