import * as SQLite from 'expo-sqlite';

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
    `);
  }
  return dbInstance;
}

export function saveDiary(
  content: string,
  date: string,
  time: string,
  attachmentsJson: string | null = null,
): number {
  const database = getDatabase();
  const result = database.runSync(
    'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
    [content, date, time, attachmentsJson],
  );
  return result.lastInsertRowId;
}

export function getDiaryByDate(date: string): DiaryItem[] {
  const database = getDatabase();
  return database.getAllSync<DiaryItem>(
    'SELECT * FROM diary WHERE date = ? ORDER BY id ASC',
    [date],
  );
}

export function searchDiary(query: string): DiaryItem[] {
  const database = getDatabase();
  const trimmed = query.trim();
  if (!trimmed) return [];
  return database.getAllSync<DiaryItem>(
    'SELECT * FROM diary WHERE content LIKE ? ORDER BY date DESC, time DESC, id DESC',
    [`%${trimmed}%`],
  );
}

export function deleteDiary(id: number): void {
  const database = getDatabase();
  database.runSync('DELETE FROM diary WHERE id = ?', [id]);
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
  database.execSync('DELETE FROM diary; VACUUM;');
}

export function getAllDiaries(): DiaryItem[] {
  const database = getDatabase();
  return database.getAllSync<DiaryItem>(
    'SELECT * FROM diary ORDER BY date ASC, time ASC, id ASC',
  );
}

export function restoreAllDiaries(diaries: DiaryItem[]): void {
  const database = getDatabase();
  database.execSync('BEGIN TRANSACTION;');
  try {
    database.execSync('DELETE FROM diary;');
    for (const item of diaries) {
      database.runSync(
        'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
        [item.content, item.date, item.time, item.attachmentsJson ?? null],
      );
    }
    database.execSync('COMMIT;');
  } catch (err) {
    database.execSync('ROLLBACK;');
    throw err;
  }
}

export function mergeDiaries(incoming: DiaryItem[]): { addedCount: number } {
  const database = getDatabase();
  const existing = getAllDiaries();
  const existingKeys = new Set(existing.map((d) => `${d.date}_${d.time}_${d.content.trim()}`));

  let addedCount = 0;
  database.execSync('BEGIN TRANSACTION;');
  try {
    for (const item of incoming) {
      const key = `${item.date}_${item.time}_${item.content.trim()}`;
      if (!existingKeys.has(key)) {
        database.runSync(
          'INSERT INTO diary (content, date, time, attachmentsJson) VALUES (?, ?, ?, ?)',
          [item.content, item.date, item.time, item.attachmentsJson ?? null],
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
