/**
 * Migration 007 — Add notifications table.
 *
 * Stores in-app notifications for users (e.g., submission review results).
 * Idempotent — checks for table existence before creating.
 */

module.exports = {
  version: 7,
  name: 'add-notifications',
  async up(db) {
    if (db.dialect === 'mssql') {
      await db.exec(`
        IF OBJECT_ID('notifications', 'U') IS NULL
        CREATE TABLE notifications (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL,
          type NVARCHAR(100) NOT NULL,
          message NVARCHAR(MAX) NOT NULL,
          data NVARCHAR(MAX),
          is_read BIT NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      await db.exec(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = 'idx_notifications_user_read'
            AND object_id = OBJECT_ID('notifications')
        )
          CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
      `);
      await db.exec(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = 'idx_notifications_user_created'
            AND object_id = OBJECT_ID('notifications')
        )
          CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
      `);
    } else {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read
          ON notifications(user_id, is_read);
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
          ON notifications(user_id, created_at DESC);
      `);
    }
  },
};
