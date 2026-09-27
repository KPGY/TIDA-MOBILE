import * as FileSystem from 'expo-file-system/legacy';
import { getAllDiaries, restoreAllDiaries, DiaryItem, Attachment } from './db';
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
  // 4. 타임라인 첨부 사진 (fileName -> Base64 문자열)
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

    // 2. 타임라인 첨부 사진들을 Base64로 인코딩하여 수집
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
              } catch (readErr) {
                console.warn(`첨부파일(${att.fileName}) 읽기 실패:`, readErr);
              }
            }
          }
        }
      } catch (parseErr) {
        console.warn('attachmentsJson 파싱 오류:', parseErr);
      }
    }

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
      diary: diaries,
      todos,
      routines,
      attachments: attachmentsMap,
    };

    const jsonContent = JSON.stringify(backupData, null, 2);

    // 4. 구글 드라이브 기존 파일 확인 후 업데이트 또는 신규 생성
    const existingFile = await findBackupFile(accessToken);

    if (existingFile) {
      // 기존 파일 내용 업데이트 (PATCH)
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
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

      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
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
    }

    // 5. 마지막 백업 일시 저장
    await setLastBackupTime(backupDate);

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
              if (att.fileName) {
                // 로컬의 attachments 디렉토리 절대경로로 재매핑
                att.filePath = `${attDir}${att.fileName}`;
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
