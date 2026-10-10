import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

export interface Attachment {
  filePath: string;
  fileName: string;
}

export interface DiaryItem {
  id: number;
  content: string;
  date: string;
  time: string;
  attachmentsJson: string | null;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let hasMigratedPaths = false;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('tida_diary.db');
    dbInstance.execSync(`
      CREATE TABLE IF NOT EXISTS diary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        attachmentsJson TEXT
      );
      CREATE TABLE IF NOT EXISTS deleted_diaries (
        key TEXT PRIMARY KEY,
        deletedAt INTEGER NOT NULL
      );
    `);
    if (!hasMigratedPaths) {
      hasMigratedPaths = true;
      setTimeout(() => {
        fixLocalAttachmentPaths();
        cleanOldDeletedKeys();
      }, 0);
    }
  }
  return dbInstance;
}

export function normalizeAttachmentsJson(attachmentsJson: string | null): string | null {
  if (!attachmentsJson) return null;
  try {
    const atts: Attachment[] = JSON.parse(attachmentsJson);
    if (!Array.isArray(atts) || atts.length === 0) return attachmentsJson;
    const attDir = `${FileSystem.documentDirectory}attachments/`;
    let changed = false;
    const normalized = atts.map((att) => {
      const fileName = att.fileName || att.filePath?.split(/[/\\]/).pop() || 'image.jpg';
      const expectedPath = `${attDir}${fileName}`;
      if (att.filePath !== expectedPath || att.fileName !== fileName) {
        changed = true;
        return {
          ...att,
          fileName,
          filePath: expectedPath,
        };
      }
      return att;
    });
    return changed ? JSON.stringify(normalized) : attachmentsJson;
  } catch (_) {
    return attachmentsJson;
  }
}

export function saveDiary(
  content: string,
  date: string,
  time: string,
  attachmentsJson: string | null = null,
): number {
  const database = getDatabase();
  const normalizedAtts = normalizeAttachmentsJson(attachmentsJson);
  const result = database.runSync(
    'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
    [content, date, time, normalizedAtts],
  );
  return result.lastInsertRowId;
}

export function getDiaryByDate(date: string): DiaryItem[] {
  const database = getDatabase();
  const list = database.getAllSync<DiaryItem>(
    'SELECT * FROM diary WHERE date = ? ORDER BY id ASC',
    [date],
  );
  return list.map((item) => ({
    ...item,
    attachmentsJson: normalizeAttachmentsJson(item.attachmentsJson),
  }));
}

export function searchDiary(query: string): DiaryItem[] {
  const database = getDatabase();
  const trimmed = query.trim();
  if (!trimmed) return [];
  const list = database.getAllSync<DiaryItem>(
    'SELECT * FROM diary WHERE content LIKE ? ORDER BY date DESC, time DESC, id DESC',
    [`%${trimmed}%`],
  );
  return list.map((item) => ({
    ...item,
    attachmentsJson: normalizeAttachmentsJson(item.attachmentsJson),
  }));
}

export function getDiaryKey(item: { date: string; time: string; content: string }): string {
  return `${item.date}_${item.time}_${item.content.trim()}`;
}

export function getDeletedDiaryKeys(): string[] {
  try {
    const database = getDatabase();
    const rows = database.getAllSync<{ key: string }>('SELECT key FROM deleted_diaries');
    return rows.map((r) => r.key);
  } catch (e) {
    return [];
  }
}

export function recordDeletedDiaryKeys(keys: string[]): void {
  if (!keys || keys.length === 0) return;
  const database = getDatabase();
  database.execSync('BEGIN TRANSACTION;');
  try {
    const now = Date.now();
    for (const key of keys) {
      if (key && key.trim()) {
        database.runSync(
          'INSERT OR REPLACE INTO deleted_diaries (key, deletedAt) VALUES (?, ?)',
          [key.trim(), now],
        );
      }
    }
    database.execSync('COMMIT;');
  } catch (e) {
    database.execSync('ROLLBACK;');
  }
}

export function applyDeletionsByKeys(keys: string[]): number {
  if (!keys || keys.length === 0) return 0;
  const database = getDatabase();
  const current = getAllDiaries();
  const keySet = new Set(keys.map((k) => k.trim()));
  let deletedCount = 0;
  database.execSync('BEGIN TRANSACTION;');
  try {
    for (const item of current) {
      const key = getDiaryKey(item);
      if (keySet.has(key)) {
        database.runSync('DELETE FROM diary WHERE id = ?', [item.id]);
        deletedCount++;
      }
    }
    database.execSync('COMMIT;');
  } catch (e) {
    database.execSync('ROLLBACK;');
  }
  return deletedCount;
}

export function cleanOldDeletedKeys(days = 30): void {
  try {
    const database = getDatabase();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    database.runSync('DELETE FROM deleted_diaries WHERE deletedAt < ?', [cutoff]);
  } catch (_) {}
}

export function deleteDiary(id: number): string[] {
  const database = getDatabase();
  const rows = database.getAllSync<{ content: string; date: string; time: string; attachmentsJson: string | null }>(
    'SELECT content, date, time, attachmentsJson FROM diary WHERE id = ?',
    [id],
  );
  const deletedFileNames: string[] = [];
  if (rows && rows.length > 0) {
    const target = rows[0];
    // 삭제 톰스톤 기록 (원격 기기와 동기화 시 유령 부활 방지)
    const key = getDiaryKey(target);
    try {
      database.runSync(
        'INSERT OR REPLACE INTO deleted_diaries (key, deletedAt) VALUES (?, ?)',
        [key, Date.now()],
      );
    } catch (_) {}

    if (target.attachmentsJson) {
      try {
        const atts: Attachment[] = JSON.parse(target.attachmentsJson);
        if (Array.isArray(atts)) {
          for (const att of atts) {
            if (att.fileName) deletedFileNames.push(att.fileName);
            if (att.filePath) {
              FileSystem.deleteAsync(att.filePath, { idempotent: true }).catch(() => {});
            }
          }
        }
      } catch (_) {}
    }
  }
  database.runSync('DELETE FROM diary WHERE id = ?', [id]);
  return deletedFileNames;
}

export function getRecordedDatesForMonth(yearMonth: string): string[] {
  try {
    const database = getDatabase();
    const rows = database.getAllSync<{ date: string }>(
      'SELECT DISTINCT date FROM diary WHERE date LIKE ?',
      [`${yearMonth}%`],
    );
    return rows.map((r) => r.date);
  } catch (e) {
    console.error('Error fetching recorded dates for month:', e);
    return [];
  }
}

export function resetDiaryDatabase(): void {
  const database = getDatabase();
  database.execSync('DELETE FROM diary; DELETE FROM deleted_diaries; VACUUM;');
}

export function getAllDiaries(): DiaryItem[] {
  const database = getDatabase();
  const list = database.getAllSync<DiaryItem>(
    'SELECT * FROM diary ORDER BY date ASC, time ASC, id ASC',
  );
  return list.map((item) => ({
    ...item,
    attachmentsJson: normalizeAttachmentsJson(item.attachmentsJson),
  }));
}

export function restoreAllDiaries(diaries: DiaryItem[]): void {
  const database = getDatabase();
  database.execSync('BEGIN TRANSACTION;');
  try {
    database.execSync('DELETE FROM diary;');
    for (const item of diaries) {
      database.runSync(
        'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
        [item.content, item.date, item.time, normalizeAttachmentsJson(item.attachmentsJson ?? null)],
      );
    }
    database.execSync('COMMIT;');
  } catch (err) {
    database.execSync('ROLLBACK;');
    throw err;
  }
}

export function mergeDiaries(incoming: DiaryItem[], excludedKeys: Set<string> = new Set()): { addedCount: number } {
  const database = getDatabase();
  const existing = getAllDiaries();
  const existingKeys = new Set(existing.map((d) => getDiaryKey(d)));

  let addedCount = 0;
  database.execSync('BEGIN TRANSACTION;');
  try {
    for (const item of incoming) {
      const key = getDiaryKey(item);
      if (!existingKeys.has(key) && !excludedKeys.has(key)) {
        database.runSync(
          'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
          [item.content, item.date, item.time, normalizeAttachmentsJson(item.attachmentsJson ?? null)],
        );
        existingKeys.add(key);
        addedCount++;
      }
    }
    database.execSync('COMMIT;');
  } catch (err) {
    database.execSync('ROLLBACK;');
    throw err;
  }
  return { addedCount };
}

/**
 * DB에 저장된 과거/타 기기 절대경로(C:\ 등)를 현재 기기의 로컬 attachments 디렉토리 경로로 자동 일괄 보정
 */
export function fixLocalAttachmentPaths(): void {
  try {
    const database = getDatabase();
    const rows = database.getAllSync<{ id: number; attachmentsJson: string | null }>(
      'SELECT id, attachmentsJson FROM diary WHERE attachmentsJson IS NOT NULL',
    );
    const attDir = `${FileSystem.documentDirectory}attachments/`;
    for (const row of rows) {
      if (!row.attachmentsJson) continue;
      try {
        const atts: Attachment[] = JSON.parse(row.attachmentsJson);
        let changed = false;
        if (Array.isArray(atts)) {
          for (const att of atts) {
            const fileName = att.fileName || att.filePath?.split(/[/\\]/).pop();
            if (fileName) {
              const expectedPath = `${attDir}${fileName}`;
              if (att.filePath !== expectedPath || att.fileName !== fileName) {
                att.filePath = expectedPath;
                att.fileName = fileName;
                changed = true;
              }
            }
          }
        }
        if (changed) {
          database.runSync(
            'UPDATE diary SET attachmentsJson = ? WHERE id = ?',
            [JSON.stringify(atts), row.id],
          );
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('fixLocalAttachmentPaths error:', err);
  }
}
