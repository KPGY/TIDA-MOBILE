import * as FileSystem from 'expo-file-system/legacy';
import { getAllDiaries, restoreAllDiaries, DiaryItem, Attachment, getDeletedDiaryKeys, recordDeletedDiaryKeys } from './db';
import { useAppStore, Todolist } from '../store/store';
import { RoutineItem } from '../utils/routineHelper';
import {
  getValidAccessToken,
  setLastBackupTime,
} from './googleAuth';
import { GOOGLE_CONFIG } from '../constants/googleConfig';

export interface TidaCloudBackup {
  manifest: {
    app: string;
    version: string;
    backupDate: string;
    platform: string;
    description: string;
  };
  // 1. 타임라인 일기 데이터
  diary: DiaryItem[];
  // 2. 투두 데이터
  todos: Todolist[];
  // 3. 루틴 데이터
  routines: RoutineItem[];
  // 4. 삭제 톰스톤 (기기간 유령 부활 방지)
  deletedDiaryKeys?: string[];
  deletedTodoIds?: string[];
  deletedRoutineIds?: string[];
  // 5. 타임라인 첨부 사진 (fileName -> Base64 문자열)
  attachments?: Record<string, string>;
}

export interface CloudFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

/**
 * 구글 드라이브에서 tida_backup.json 파일 검색
 */
export async function findBackupFile(accessToken: string): Promise<CloudFileInfo | null> {
  const query = encodeURIComponent(`name='${GOOGLE_CONFIG.BACKUP_FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)&spaces=drive`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`드라이브 파일 목록 조회 실패 (${response.status})`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0] as CloudFileInfo;
  }
  return null;
}

let cachedMediaFolderId: string | null = null;

/**
 * 미디어 폴더 캐시 초기화 (로그아웃 또는 계정 변경 시 호출)
 * 초기화하지 않으면 이전 계정의 폴더 ID가 남아 잘못된 폴더에 업로드할 수 있음
 */
export function clearMediaFolderCache(): void {
  cachedMediaFolderId = null;
}

/**
 * 구글 드라이브의 'tida-media' 폴더 ID 조회 또는 생성
 */
export async function getOrCreateMediaFolder(accessToken: string): Promise<string | null> {
  if (cachedMediaFolderId) return cachedMediaFolderId;
  try {
    const q = encodeURIComponent(`name='${GOOGLE_CONFIG.MEDIA_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        cachedMediaFolderId = data.files[0].id;
        return cachedMediaFolderId;
      }
    }
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: GOOGLE_CONFIG.MEDIA_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (createRes.ok) {
      const folder = await createRes.json();
      cachedMediaFolderId = folder.id;
      return cachedMediaFolderId;
    }
  } catch (err) {
    console.warn('getOrCreateMediaFolder error:', err);
  }
  return null;
}

/**
 * tida-media 폴더 내의 파일 목록 (fileName -> fileId 맵)
 */
export async function listMediaFilesInFolder(accessToken: string, folderId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.files) {
        for (const f of data.files) {
          if (f.name && f.id) map.set(f.name, f.id);
        }
      }
    }
  } catch (err) {
    console.warn('listMediaFilesInFolder error:', err);
  }
  return map;
}

/**
 * tida-media 폴더로 로컬 미디어 단건 업로드 (순수 바이너리 Resumable Upload)
 */
export async function uploadMediaFileToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  fileUri: string,
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;

    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpeg';
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';

    // 1. Resumable Upload 세션 시작 요청
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const sessionRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!sessionRes.ok) {
      console.warn(`Failed to create resumable upload session: ${sessionRes.status}`);
      return null;
    }

    const sessionUrl = sessionRes.headers.get('Location') || sessionRes.headers.get('location');
    if (!sessionUrl) {
      console.warn('No Location header in Google Drive resumable upload response');
      return null;
    }

    // 2. 바이너리 스트림으로 직접 파일 업로드 (Base64 인코딩 없이 원본 바이너리 그대로 전송)
    const uploadResult = await FileSystem.uploadAsync(sessionUrl, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': mimeType,
      },
    });

    if (uploadResult.status === 200 || uploadResult.status === 201) {
      const data = JSON.parse(uploadResult.body);
      return (data.id as string) || null;
    } else {
      console.warn(`uploadAsync failed with status ${uploadResult.status}:`, uploadResult.body);
    }
  } catch (err) {
    console.warn(`uploadMediaFileToFolder error for ${fileName}:`, err);
  }
  return null;
}

/**
 * tida-media 폴더에서 파일 다운로드
 */
export async function downloadMediaFileFromDrive(
  accessToken: string,
  fileId: string,
  destPath: string,
): Promise<boolean> {
  try {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await FileSystem.downloadAsync(downloadUrl, destPath, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.status >= 200 && res.status < 300;
  } catch (err) {
    console.warn(`downloadMediaFileFromDrive error for ${destPath}:`, err);
    return false;
  }
}

/**
 * tida-media 폴더에서 특정 파일 백그라운드 삭제
 */
export async function deleteMediaFileFromDrive(
  accessToken: string,
  fileName: string,
): Promise<void> {
  try {
    const folderId = await getOrCreateMediaFolder(accessToken);
    if (!folderId) return;
    const q = encodeURIComponent(`'${folderId}' in parents and name='${fileName}' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        for (const f of data.files) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
      }
    }
  } catch (_) {}
}

/**
 * 클라우드에 현재 백업 파일이 있는지 정보 확인
 */
export async function getCloudBackupInfo(): Promise<{
  exists: boolean;
  file?: CloudFileInfo;
  error?: string;
}> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { exists: false, error: '구글 로그인이 필요합니다.' };
    }

    const file = await findBackupFile(accessToken);
    return {
      exists: !!file,
      file: file ?? undefined,
    };
  } catch (err: any) {
    return {
      exists: false,
      error: err.message || '클라우드 백업 정보 조회에 실패했습니다.',
    };
  }
}

/**
 * 순수 데이터(타임라인, 사진, 투두, 루틴)만 구글 드라이브로 백업 (업로드)
 * 테마, 색상, 레이아웃 등 상태값은 제외
 */
export async function uploadBackupToGoogleDrive(): Promise<{
  success: boolean;
  backupDate?: string;
  diaryCount?: number;
  todoCount?: number;
  routineCount?: number;
  photoCount?: number;
  error?: string;
}> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        success: false,
        error: '로그인 정보가 만료되었거나 연동되지 않았습니다. 다시 로그인해주세요.',
      };
    }

    // 1. 타임라인 SQLite 일기 데이터 가져오기
    const diaries = getAllDiaries();

    // 2. 타임라인 첨부 사진들을 Base64로 인코딩하여 수집 및 클라우드 업로드용 상대경로 정규화
    const attachmentsMap: Record<string, string> = {};
    const attDir = `${FileSystem.documentDirectory}attachments/`;
    for (const item of diaries) {
      if (!item.attachmentsJson) continue;
      try {
        const atts: Attachment[] = JSON.parse(item.attachmentsJson);
        if (Array.isArray(atts)) {
          for (const att of atts) {
            const fName = att.fileName || att.filePath?.split(/[/\\]/).pop();
            if (fName && !attachmentsMap[fName]) {
              try {
                let targetUri = att.filePath;
                if (!targetUri || !(await FileSystem.getInfoAsync(targetUri)).exists) {
                  targetUri = `${attDir}${fName}`;
                }
                const info = await FileSystem.getInfoAsync(targetUri);
                if (info.exists) {
                  const base64 = await FileSystem.readAsStringAsync(targetUri, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  attachmentsMap[fName] = base64;
                }
              } catch (readErr) {
                console.warn(`첨부파일(${fName}) 읽기 실패:`, readErr);
              }
            }
          }
        }
      } catch (parseErr) {
        console.warn('attachmentsJson 파싱 오류:', parseErr);
      }
    }

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

    // 3. Zustand Store에서 순수 데이터(투두, 루틴)만 가져오기 (테마/상태값 제외)
    const storeState = useAppStore.getState();
    const todos = storeState.todos || [];
    const routines = storeState.routines || [];
    const backupDate = new Date().toISOString();

    const backupData: TidaCloudBackup = {
      manifest: {
        app: 'TIDA',
        version: '1.0.0',
        backupDate,
        platform: 'mobile',
        description: 'TIDA Pure Data Backup (Timeline, Photos, Todos, Routines)',
      },
      diary: sanitizedDiaries,
      todos,
      routines,
      deletedDiaryKeys: getDeletedDiaryKeys(),
      deletedTodoIds: storeState.deletedTodoIds || [],
      deletedRoutineIds: storeState.deletedRoutineIds || [],
      attachments: attachmentsMap,
    };

    const jsonContent = JSON.stringify(backupData, null, 2);
    let savedModifiedTime = backupDate;

    // 4. 구글 드라이브 기존 파일 확인 후 업데이트 또는 신규 생성
    const existingFile = await findBackupFile(accessToken);

    if (existingFile) {
      // 기존 파일 내용 업데이트 (PATCH)
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media&fields=id,name,modifiedTime`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonContent,
      });

      if (!updateRes.ok) {
        throw new Error(`파일 업데이트 실패 (${updateRes.status})`);
      }
      const data = await updateRes.json().catch(() => null);
      if (data?.modifiedTime) {
        savedModifiedTime = data.modifiedTime;
      }
    } else {
      // 신규 파일 생성 (Multipart POST)
      const boundary = 'tida_sync_boundary_' + Date.now();
      const metadata = JSON.stringify({
        name: GOOGLE_CONFIG.BACKUP_FILE_NAME,
        mimeType: 'application/json',
        description: 'TIDA Data Backup for Mobile and PC Sync (Timeline, Photos, Todos, Routines)',
      });

      const multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${jsonContent}\r\n` +
        `--${boundary}--`;

      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!uploadRes.ok) {
        throw new Error(`파일 업로드 실패 (${uploadRes.status})`);
      }
      const data = await uploadRes.json().catch(() => null);
      if (data?.modifiedTime) {
        savedModifiedTime = data.modifiedTime;
      }
    }

    // 5. 마지막 백업 일시 저장 (구글 드라이브 서버 시계 기준)
    await setLastBackupTime(savedModifiedTime);

    return {
      success: true,
      backupDate,
      diaryCount: diaries.length,
      todoCount: todos.length,
      routineCount: routines.length,
      photoCount: Object.keys(attachmentsMap).length,
    };
  } catch (error: any) {
    console.error('Upload backup failed:', error);
    return {
      success: false,
      error: error.message || '백업 업로드 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 구글 드라이브에서 최신 백업 데이터를 다운로드하여 복원
 * 순수 데이터(타임라인 일기, 사진 파일, 투두, 루틴)만 복원하고, 테마 및 상태값은 현재 설정 그대로 유지
 */
export async function restoreBackupFromGoogleDrive(): Promise<{
  success: boolean;
  diaryCount?: number;
  todoCount?: number;
  routineCount?: number;
  photoCount?: number;
  backupDate?: string;
  error?: string;
}> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        success: false,
        error: '로그인 정보가 만료되었거나 연동되지 않았습니다. 다시 로그인해주세요.',
      };
    }

    // 1. 파일 검색
    const file = await findBackupFile(accessToken);
    if (!file) {
      return {
        success: false,
        error: '구글 드라이브에서 TIDA 백업 파일을 찾을 수 없습니다.',
      };
    }

    // 2. 파일 다운로드
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`백업 파일 다운로드 실패 (${res.status})`);
    }

    const backupData = (await res.json()) as TidaCloudBackup;

    // 3. 백업 데이터 형식 유효성 확인
    if (!backupData || (!backupData.diary && !backupData.todos && !backupData.routines)) {
      return {
        success: false,
        error: '유효한 TIDA 백업 데이터 형식이 아닙니다.',
      };
    }

    // 4. 첨부 사진 복원 (attachments 폴더에 파일 쓰기)
    const attDir = `${FileSystem.documentDirectory}attachments/`;
    try {
      const dirInfo = await FileSystem.getInfoAsync(attDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(attDir, { intermediates: true });
      }
    } catch (e) {
      console.warn('attachments 폴더 생성 실패:', e);
    }

    let photoRestoredCount = 0;
    if (backupData.attachments && typeof backupData.attachments === 'object') {
      for (const [fileName, base64] of Object.entries(backupData.attachments)) {
        if (!fileName || !base64) continue;
        try {
          const targetPath = `${attDir}${fileName}`;
          await FileSystem.writeAsStringAsync(targetPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          photoRestoredCount++;
        } catch (writeErr) {
          console.warn(`사진 복원 실패 (${fileName}):`, writeErr);
        }
      }
    }

    // 5. SQLite 타임라인 일기 데이터 복원 (첨부파일 경로 로컬 보정)
    const diariesToRestore = Array.isArray(backupData.diary) ? backupData.diary : [];
    for (const item of diariesToRestore) {
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
    restoreAllDiaries(diariesToRestore);

    // 6. Zustand Store 복원: 투두와 루틴만 복원하고 테마/설정값은 건드리지 않음!
    // (PC 구버전 및 다양한 포맷 호환을 위해 fallback 포함)
    const rawData = backupData as any;
    const restoredTodos = Array.isArray(backupData.todos)
      ? backupData.todos
      : Array.isArray(rawData.settings?.todos)
        ? rawData.settings.todos
        : [];

    const restoredRoutines = Array.isArray(backupData.routines)
      ? backupData.routines
      : Array.isArray(rawData.settings?.routines)
        ? rawData.settings.routines
        : [];

    useAppStore.setState((state) => ({
      ...state,
      todos: restoredTodos,
      routines: restoredRoutines,
      // ⭐️ 테마, 배경화면, 글래스모피즘, 폰트, 시작페이지 등은 현재 상태 그대로 유지
    }));

    return {
      success: true,
      diaryCount: diariesToRestore.length,
      todoCount: restoredTodos.length,
      routineCount: restoredRoutines.length,
      photoCount: photoRestoredCount,
      backupDate: backupData.manifest?.backupDate || file.modifiedTime,
    };
  } catch (error: any) {
    console.error('Restore backup failed:', error);
    return {
      success: false,
      error: error.message || '백업 복원 중 오류가 발생했습니다.',
    };
  }
}
