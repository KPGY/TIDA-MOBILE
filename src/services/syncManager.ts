import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getAllDiaries,
  restoreAllDiaries,
  mergeDiaries,
  DiaryItem,
  Attachment,
  getDiaryKey,
  getDeletedDiaryKeys,
  recordDeletedDiaryKeys,
  applyDeletionsByKeys,
} from './db';
import { useAppStore, Todolist } from '../store/store';
import { RoutineItem } from '../utils/routineHelper';
import {
  getTokenWithRecovery,
  getStoredGoogleUser,
  getLastBackupTime,
  setLastBackupTime,
  onSessionExpired,
} from './googleAuth';
import {
  findBackupFile,
  TidaCloudBackup,
  CloudFileInfo,
  getOrCreateMediaFolder,
  listMediaFilesInFolder,
  uploadMediaFileToFolder,
  downloadMediaFileFromDrive,
  deleteMediaFileFromDrive,
} from './googleDrive';
import { GOOGLE_CONFIG } from '../constants/googleConfig';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

type SyncListener = (status: SyncStatus, lastTime: string | null) => void;

let currentStatus: SyncStatus = 'idle';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInternalSyncing = false;
let isSyncInProgress = false;
let isInitialPullDone = false;
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
 * 2개의 투두 목록 스마트 양방향 병합 (updatedAt 및 삭제 톰스톤 반영)
 */
function mergeTodoList(
  local: Todolist[],
  incoming: Todolist[],
  deletedIds: Set<string> = new Set(),
): Todolist[] {
  const map = new Map<string, Todolist>();
  (local || []).forEach((t) => {
    if (t?.id && !deletedIds.has(t.id)) {
      map.set(t.id, { ...t });
    }
  });

  incoming.forEach((remote) => {
    if (!remote?.id || deletedIds.has(remote.id)) return;
    if (!map.has(remote.id)) {
      // 로컬에 없는 신규 항목 추가
      map.set(remote.id, remote);
    } else {
      // 둘 다 존재하는 경우: 최신 updatedAt 기준 상태 병합
      const existing = map.get(remote.id)!;
      const localTime = existing.updatedAt || 0;
      const remoteTime = remote.updatedAt || 0;

      // 서브투두 병합
      const subMap = new Map<string, any>();
      (existing.subTodos || []).forEach((st) => subMap.set(st.id, st));
      (remote.subTodos || []).forEach((st) => {
        if (!subMap.has(st.id)) {
          subMap.set(st.id, st);
        } else {
          const localSt = subMap.get(st.id);
          const completedStatus = remoteTime > localTime ? st.completed : localSt.completed;
          subMap.set(st.id, {
            ...localSt,
            ...st,
            completed: completedStatus,
          });
        }
      });

      const base = remoteTime > localTime ? remote : existing;
      map.set(remote.id, {
        ...base,
        subTodos: Array.from(subMap.values()),
        order: existing.order ?? remote.order,
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 2개의 루틴 목록 스마트 병합 (updatedAt 및 삭제 톰스톤 반영)
 */
function mergeRoutineList(
  local: RoutineItem[],
  incoming: RoutineItem[],
  deletedIds: Set<string> = new Set(),
): RoutineItem[] {
  const map = new Map<string, RoutineItem>();
  (local || []).forEach((r) => {
    if (r?.id && !deletedIds.has(r.id)) {
      map.set(r.id, { ...r });
    }
  });

  incoming.forEach((remote) => {
    if (!remote?.id || deletedIds.has(remote.id)) return;
    if (!map.has(remote.id)) {
      map.set(remote.id, remote);
    } else {
      const existing = map.get(remote.id)!;
      const localTime = existing.updatedAt || 0;
      const remoteTime = remote.updatedAt || 0;

      // 한 기기에서 최근 1분 이내에 명시적으로 수정되었다면 해당 상태 우선,
      // 그 외에는 completedDates 합집합으로 병합하여 두 기기의 체크 기록을 모두 보존
      let mergedCompletedDates: string[];
      if (Math.abs(remoteTime - localTime) > 60000 && remoteTime > localTime) {
        mergedCompletedDates = remote.completedDates || [];
      } else if (Math.abs(remoteTime - localTime) > 60000 && localTime > remoteTime) {
        mergedCompletedDates = existing.completedDates || [];
      } else {
        mergedCompletedDates = Array.from(
          new Set([...(existing.completedDates || []), ...(remote.completedDates || [])]),
        ).sort();
      }

      // 서브루틴 완료일자 통합
      const existingSubs: any[] = existing.subRoutines || [];
      const remoteSubs: any[] = remote.subRoutines || [];
      const subMap = new Map<string, any>();
      existingSubs.forEach((s) => {
        if (s?.id) subMap.set(s.id, { ...s });
      });
      remoteSubs.forEach((s) => {
        if (!s?.id) return;
        if (!subMap.has(s.id)) {
          subMap.set(s.id, s);
        } else {
          const exSr = subMap.get(s.id);
          const combinedSrDates = Array.from(
            new Set([...(exSr.completedDates || []), ...(s.completedDates || [])]),
          ).sort();
          subMap.set(s.id, { ...exSr, ...s, completedDates: combinedSrDates });
        }
      });

      const base = remoteTime > localTime ? remote : existing;
      map.set(remote.id, {
        ...base,
        completedDates: mergedCompletedDates,
        subRoutines: Array.from(subMap.values()),
        order: existing.order ?? remote.order,
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 조용한 백그라운드 데이터 업로드 (클라우드 최신화)
 */
async function executeUpload(): Promise<boolean> {
  const accessToken = await getTokenWithRecovery();
  if (!accessToken) return false;

  const existingFile = await findBackupFile(accessToken);
  const diaries = getAllDiaries();
  const storeState = useAppStore.getState();
  const nowIso = new Date().toISOString();

  // 클라우드 백업용 다이어리: 기기간 절대경로 오염을 방지하기 위해 파일명 기반 상대경로로 정규화
  const sanitizedDiaries = diaries.map((item) => {
    if (!item.attachmentsJson) return item;
    try {
      const atts: Attachment[] = JSON.parse(item.attachmentsJson);
      if (Array.isArray(atts)) {
        const cleaned = atts.map((att) => {
          const fName = att.fileName || att.filePath?.split(/[/\\]/).pop() || 'image.jpg';
          return {
            ...att,
            fileName: fName,
            filePath: `attachments/${fName}`,
          };
        });
        return {
          ...item,
          attachmentsJson: JSON.stringify(cleaned),
        };
      }
    } catch (_) {}
    return item;
  });

  // 2. 가벼운 순수 텍스트 백업 데이터 생성 (Base64 제외 -> 수 KB 초고속 전송)
  // 2. 미디어 파일 먼저 구글 드라이브에 안전하게 업로드
  // (사진이 먼저 올라가 있어야 PC가 텍스트를 감지했을 때 사진을 바로 함께 다운로드하여 25초 지연/엑박 방지)
  try {
    const folderId = await getOrCreateMediaFolder(accessToken);
    if (folderId) {
      const remoteFiles = await listMediaFilesInFolder(accessToken, folderId);
      const attDir = `${FileSystem.documentDirectory}attachments/`;

      for (const item of diaries) {
        if (!item.attachmentsJson) continue;
        try {
          const atts: Attachment[] = JSON.parse(item.attachmentsJson);
          if (Array.isArray(atts)) {
            for (const att of atts) {
              const fName = att.fileName || att.filePath?.split(/[/\\]/).pop();
              if (fName && !remoteFiles.has(fName)) {
                let targetUri = att.filePath;
                if (!targetUri || !(await FileSystem.getInfoAsync(targetUri)).exists) {
                  targetUri = `${attDir}${fName}`;
                }
                const info = await FileSystem.getInfoAsync(targetUri);
                if (info.exists) {
                  const uploadedId = await uploadMediaFileToFolder(accessToken, folderId, fName, targetUri);
                  if (uploadedId) remoteFiles.set(fName, uploadedId);
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (mediaErr) {
    console.warn('Media pre-upload error, proceeding with manifest:', mediaErr);
  }

  // 3. 사진 업로드 완료 후 순수 텍스트 백업 데이터 생성 및 클라우드 최신화
  const backupData: TidaCloudBackup = {
    manifest: {
      app: 'TIDA',
      version: '1.0.0',
      backupDate: nowIso,
      platform: 'mobile',
      description: 'TIDA Auto-Sync Data',
    },
    diary: sanitizedDiaries,
    todos: storeState.todos || [],
    routines: storeState.routines || [],
    deletedDiaryKeys: getDeletedDiaryKeys(),
    deletedTodoIds: storeState.deletedTodoIds || [],
    deletedRoutineIds: storeState.deletedRoutineIds || [],
    attachments: {}, // 하위 호환성을 위해 빈 객체 유지
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
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
  if (isInternalSyncing || !isInitialPullDone || isSyncInProgress) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    if (isInternalSyncing || isSyncInProgress) return;
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
    if (isSyncInProgress) return;
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
  if (isSyncInProgress) return;
  isSyncInProgress = true;

  try {
    const user = await getStoredGoogleUser();
    if (!user) return;

    const accessToken = await getTokenWithRecovery();
    if (!accessToken) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

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

          // 1. 타임라인 일기 첨부파일 경로 로컬 보정
          const remoteDiaries = Array.isArray(cloudData.diary) ? cloudData.diary : [];
          for (const item of remoteDiaries) {
            if (item.attachmentsJson) {
              try {
                const atts: Attachment[] = JSON.parse(item.attachmentsJson);
                if (Array.isArray(atts)) {
                  for (const att of atts) {
                    const fName = att.fileName || att.filePath?.split(/[/\\]/).pop();
                    if (fName) {
                      att.fileName = fName;
                      att.filePath = `${attDir}${fName}`;
                    }
                  }
                  item.attachmentsJson = JSON.stringify(atts);
                }
              } catch (_) {}
            }
          }

          const rawData = cloudData as any;
          const remoteTodos: Todolist[] = Array.isArray(cloudData.todos)
            ? cloudData.todos
            : Array.isArray(rawData.settings?.todos)
              ? rawData.settings.todos
              : [];
          const remoteRoutines: RoutineItem[] = Array.isArray(cloudData.routines)
            ? cloudData.routines
            : Array.isArray(rawData.settings?.routines)
              ? rawData.settings.routines
              : [];

          // 2. 원격 삭제 톰스톤 적용 (유령 부활 완벽 차단)
          const remoteDeletedDiaryKeys = cloudData.deletedDiaryKeys || [];
          if (remoteDeletedDiaryKeys.length > 0) {
            recordDeletedDiaryKeys(remoteDeletedDiaryKeys);
            applyDeletionsByKeys(remoteDeletedDiaryKeys);
          }
          const allDeletedDiaryKeys = new Set(getDeletedDiaryKeys());

          const currentStore = useAppStore.getState();
          const remoteDeletedTodoIds = cloudData.deletedTodoIds || [];
          const remoteDeletedRoutineIds = cloudData.deletedRoutineIds || [];
          const allDeletedTodoIds = new Set([
            ...(currentStore.deletedTodoIds || []),
            ...remoteDeletedTodoIds,
          ]);
          const allDeletedRoutineIds = new Set([
            ...(currentStore.deletedRoutineIds || []),
            ...remoteDeletedRoutineIds,
          ]);

          // 3. 로컬에만 있는 다이어리 중, 삭제된 적이 없는 신규 일기 식별
          const remoteKeys = new Set(remoteDiaries.map((d) => getDiaryKey(d)));
          const currentDiaries = getAllDiaries();
          const localNewDiaries = currentDiaries.filter((d) => {
            const key = getDiaryKey(d);
            return !remoteKeys.has(key) && !allDeletedDiaryKeys.has(key);
          });

          // 4. 다이어리 복원 및 병합
          if (localNewDiaries.length > 0) {
            restoreAllDiaries([...remoteDiaries, ...localNewDiaries]);
          } else {
            if (remoteDiaries.length > 0 || currentDiaries.length === 0) {
              restoreAllDiaries(remoteDiaries);
            }
          }

          // 5. 투두 & 루틴 스마트 양방향 병합
          const currentTodos = currentStore.todos || [];
          const currentRoutines = currentStore.routines || [];
          const mergedTodos = mergeTodoList(currentTodos, remoteTodos, allDeletedTodoIds);
          const mergedRoutines = mergeRoutineList(currentRoutines, remoteRoutines, allDeletedRoutineIds);

          useAppStore.setState((state) => ({
            ...state,
            todos: mergedTodos,
            routines: mergedRoutines,
            deletedTodoIds: Array.from(allDeletedTodoIds).slice(-100),
            deletedRoutineIds: Array.from(allDeletedRoutineIds).slice(-100),
          }));

          // 6. 로컬에 새로운 일기가 있었거나 첫 동기화인 경우 합본 재업로드
          if (localNewDiaries.length > 0 || localSyncTime === 0) {
            await executeUpload();
          } else {
            await setLastBackupTime(file.modifiedTime);
          }

          // 화면 즉시 갱신
          notifySyncDataPulled();

          // 7. 첨부 사진 복원은 백그라운드 비동기로 처리 (화면 블로킹 없음)
          const remoteAttachments = cloudData.attachments;
          (async () => {
            try {
              const dirInfo = await FileSystem.getInfoAsync(attDir);
              if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(attDir, { intermediates: true });
              }

              let anyDownloaded = false;

              // 7-1. 레거시 Base64 첨부파일 복원
              if (remoteAttachments && typeof remoteAttachments === 'object') {
                for (const [fileName, base64] of Object.entries(remoteAttachments)) {
                  if (!fileName || !base64) continue;
                  const targetPath = `${attDir}${fileName}`;
                  const fInfo = await FileSystem.getInfoAsync(targetPath);
                  if (!fInfo.exists) {
                    try {
                      await FileSystem.writeAsStringAsync(targetPath, base64, {
                        encoding: FileSystem.EncodingType.Base64,
                      });
                      anyDownloaded = true;
                    } catch (_) {}
                  }
                }
              }

              // 7-2. tida-media 폴더에서 누락된 사진 파일 다운로드
              const missingFiles: string[] = [];
              for (const item of remoteDiaries) {
                if (!item.attachmentsJson) continue;
                try {
                  const atts: Attachment[] = JSON.parse(item.attachmentsJson);
                  if (Array.isArray(atts)) {
                    for (const att of atts) {
                      const fName = att.fileName || att.filePath?.split(/[/\\]/).pop();
                      if (fName) {
                        const targetPath = `${attDir}${fName}`;
                        const fInfo = await FileSystem.getInfoAsync(targetPath);
                        if (!fInfo.exists) {
                          missingFiles.push(fName);
                        }
                      }
                    }
                  }
                } catch (_) {}
              }

              if (missingFiles.length > 0) {
                const folderId = await getOrCreateMediaFolder(accessToken);
                if (folderId) {
                  const mediaFilesMap = await listMediaFilesInFolder(accessToken, folderId);
                  for (const fName of missingFiles) {
                    const fileId = mediaFilesMap.get(fName);
                    if (fileId) {
                      const localTarget = `${attDir}${fName}`;
                      const success = await downloadMediaFileFromDrive(accessToken, fileId, localTarget);
                      if (success) anyDownloaded = true;
                    }
                  }
                }
              }

              if (anyDownloaded) {
                notifySyncDataPulled();
              }
            } catch (attErr) {
              console.warn('Background attachments download error:', attErr);
            }
          })();
        } finally {
          isInternalSyncing = false;
        }

        setStatus('synced');
      } else {
        setStatus('error');
      }
    } else {
      setStatus('synced');
    }
  } catch (err) {
    console.warn('Startup sync error:', err);
    setStatus('error');
  } finally {
    isSyncInProgress = false;
    isInitialPullDone = true;
  }
}

/**
 * 수동 즉시 동기화 (설정 등에서 [지금 동기화] 눌렀을 때 안전하게 양방향 병합 실행)
 */
export async function performImmediateSync(): Promise<boolean> {
  if (isSyncInProgress) return false;
  try {
    const user = await getStoredGoogleUser();
    if (!user) return false;

    setStatus('syncing');
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // 1. 최신 클라우드 확인 및 스마트 양방향 병합
    await performStartupSync();
    // 2. 병합된 최신 결과를 클라우드에 확실히 커밋
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
    // 앱 초기 pull 완료 전이나 동기화 진행 중에는 업로드 트리거 방지 (레이스 컨디션 차단)
    if (isInternalSyncing || !isInitialPullDone || isSyncInProgress) return;

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
export function startPeriodicSyncCheck(intervalMs = 30000): () => void {
  const timer = setInterval(async () => {
    if (AppState.currentState !== 'active') return;
    if (isInternalSyncing || currentStatus === 'syncing') return;
    try {
      const user = await getStoredGoogleUser();
      if (!user) return;
      const accessToken = await getTokenWithRecovery();
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

/**
 * 세션 만료 이벤트 핸들러 등록
 * onSessionExpired 발생 시 동기화 상태를 'error'로 표시하고
 * 리스너(UI 레이어)에게 재로그인이 필요함을 알림
 * → _layout.tsx에서 앱 시작 시 한 번만 호출하면 됨
 */
export function initSessionExpiredHandler(onNeedRelogin: () => void): () => void {
  return onSessionExpired(() => {
    setStatus('error');
    onNeedRelogin();
  });
}
