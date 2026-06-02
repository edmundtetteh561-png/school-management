const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'school.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to SQLite database', err);
  }
});

const schema = [`
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT
);
`,`
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  subject TEXT
);
`,`
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  teacher_id INTEGER,
  room TEXT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
`,`
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);
`,`
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late')),
  notes TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);
`,`
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  assignment TEXT NOT NULL,
  score REAL,
  max_score REAL,
  comments TEXT,
  date TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);
`,`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student', 'parent')),
  teacher_id INTEGER,
  student_id INTEGER,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
`,`
CREATE TABLE IF NOT EXISTS parent_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_user_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  FOREIGN KEY (parent_user_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
`];

db.serialize(() => {
  schema.forEach((sql) => {
    db.run(sql, (err) => {
      if (err) {
        console.error('Database schema installation error:', err.message);
      }
    });
  });

  const defaultAdmin = {
    username: 'admin',
    password: 'admin123',
    role: 'admin'
  };

  db.get('SELECT id FROM users WHERE username = ?', [defaultAdmin.username], (err, row) => {
    if (err) {
      console.error('Could not query users table', err.message);
      return;
    }

    if (!row) {
      const bcrypt = require('bcryptjs');
      bcrypt.hash(defaultAdmin.password, 10, (hashErr, hash) => {
        if (hashErr) {
          console.error('Could not create admin user', hashErr.message);
          return;
        }

        db.run(
          'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [defaultAdmin.username, hash, defaultAdmin.role],
          (insertErr) => {
            if (insertErr) {
              console.error('Could not insert default admin user', insertErr.message);
            }
          }
        );
      });
    }
  });
});

module.exports = db;
