const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'school-management-secret';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const upload = multer({ dest: tmpDir });

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      teacher_id: user.teacher_id,
      student_id: user.student_id
    },
    JWT_SECRET,
    {
      expiresIn: '8h'
    }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    return next();
  };
}

function teacherOwnsClass(user, classId, callback) {
  if (!user.teacher_id) {
    return callback(null, false);
  }
  db.get('SELECT teacher_id FROM classes WHERE id = ?', [classId], (err, row) => {
    if (err) return callback(err);
    callback(null, Boolean(row && row.teacher_id === user.teacher_id));
  });
}

function teacherHasStudent(user, studentId, callback) {
  if (!user.teacher_id) return callback(null, false);
  const sql = `SELECT 1 FROM enrollments JOIN classes ON enrollments.class_id = classes.id WHERE enrollments.student_id = ? AND classes.teacher_id = ? LIMIT 1`;
  db.get(sql, [studentId, user.teacher_id], (err, row) => {
    if (err) return callback(err);
    callback(null, Boolean(row));
  });
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

function buildCsv(rows) {
  if (!rows.length) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];

  rows.forEach((row) => {
    csvRows.push(
      headers
        .map((key) => {
          const cell = row[key] == null ? '' : String(row[key]);
          return `"${cell.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
  });

  return csvRows.join('\n');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    bcrypt.compare(password, user.password_hash, (compareErr, valid) => {
      if (compareErr) {
        return res.status(500).json({ error: compareErr.message });
      }

      if (!valid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = createToken(user);
      res.json({ token, username: user.username, role: user.role });
    });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, teacher_id: req.user.teacher_id, student_id: req.user.student_id });
});

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  db.all('SELECT id, username, role, teacher_id, student_id FROM users ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, role, teacher_id, student_id } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password, and role are required' });
  }

  bcrypt.hash(password, 10, (hashErr, hash) => {
    if (hashErr) return res.status(500).json({ error: hashErr.message });

    db.run(
      'INSERT INTO users (username, password_hash, role, teacher_id, student_id) VALUES (?, ?, ?, ?, ?)',
      [username, hash, role, teacher_id || null, student_id || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, username, role, teacher_id, student_id });
      }
    );
  });
});

app.put('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { username, role, teacher_id, student_id } = req.body;
  db.run('UPDATE users SET username = ?, role = ?, teacher_id = ?, student_id = ? WHERE id = ?', [username, role, teacher_id || null, student_id || null, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id), username, role, teacher_id, student_id });
  });
});

app.get('/api/parent-students', requireAuth, (req, res) => {
  // Admins may view all parent<>student links; parents may view only their own linked students
  if (req.user.role === 'admin') {
    const sql = `SELECT parent_students.id, users.username AS parent_username, students.first_name || ' ' || students.last_name AS student_name,
                        parent_students.parent_user_id, parent_students.student_id
                 FROM parent_students
                 JOIN users ON parent_students.parent_user_id = users.id
                 JOIN students ON parent_students.student_id = students.id
                 ORDER BY parent_students.id`;
    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  if (req.user.role === 'parent') {
    const sql = `SELECT parent_students.id, students.id AS student_id, students.first_name || ' ' || students.last_name AS student_name
                 FROM parent_students
                 JOIN students ON parent_students.student_id = students.id
                 WHERE parent_students.parent_user_id = ?
                 ORDER BY parent_students.id`;
    db.all(sql, [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  res.status(403).json({ error: 'Access denied' });
});

app.post('/api/parent-students', requireAuth, requireRole('admin'), (req, res) => {
  const { parent_user_id, student_id } = req.body;
  if (!parent_user_id || !student_id) {
    return res.status(400).json({ error: 'parent_user_id and student_id are required' });
  }

  db.run(
    'INSERT INTO parent_students (parent_user_id, student_id) VALUES (?, ?)',
    [parent_user_id, student_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, parent_user_id, student_id });
    }
  );
});

app.put('/api/parent-students/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { parent_user_id, student_id } = req.body;
  if (!parent_user_id || !student_id) {
    return res.status(400).json({ error: 'parent_user_id and student_id are required' });
  }

  db.run(
    'UPDATE parent_students SET parent_user_id = ?, student_id = ? WHERE id = ?',
    [parent_user_id, student_id, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id), parent_user_id, student_id });
    }
  );
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'School management API is running.' });
});

app.get('/api/attendance', requireAuth, (req, res) => {
  const baseSql = `SELECT attendance.id, attendance.date, attendance.status, attendance.notes,
                          students.first_name || ' ' || students.last_name AS student_name,
                          classes.name AS class_name
                   FROM attendance
                   JOIN students ON attendance.student_id = students.id
                   JOIN classes ON attendance.class_id = classes.id`;

  if (req.user.role === 'admin') {
    db.all(`${baseSql} ORDER BY attendance.date DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  if (req.user.role === 'teacher') {
    db.all(
      `${baseSql} WHERE classes.teacher_id = ? ORDER BY attendance.date DESC`,
      [req.user.teacher_id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  if (req.user.role === 'student') {
    db.all(
      `${baseSql} WHERE attendance.student_id = ? ORDER BY attendance.date DESC`,
      [req.user.student_id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  if (req.user.role === 'parent') {
    db.all(
      `${baseSql} WHERE attendance.student_id IN (SELECT student_id FROM parent_students WHERE parent_user_id = ?) ORDER BY attendance.date DESC`,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  res.status(403).json({ error: 'Access denied' });
});

app.post('/api/attendance', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { student_id, class_id, date, status, notes } = req.body;
  if (!student_id || !class_id || !date || !status) {
    return res.status(400).json({ error: 'student_id, class_id, date, and status are required' });
  }

  function insert() {
    db.run(
      'INSERT INTO attendance (student_id, class_id, date, status, notes) VALUES (?, ?, ?, ?, ?)',
      [student_id, class_id, date, status, notes || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, student_id, class_id, date, status, notes });
      }
    );
  }

  if (req.user.role === 'teacher') {
    teacherOwnsClass(req.user, class_id, (err, owns) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only add attendance for their classes' });
      insert();
    });
    return;
  }

  insert();
});

app.get('/api/grades', requireAuth, (req, res) => {
  const baseSql = `SELECT grades.id, grades.assignment, grades.score, grades.max_score, grades.comments, grades.date,
                          students.first_name || ' ' || students.last_name AS student_name,
                          classes.name AS class_name
                   FROM grades
                   JOIN students ON grades.student_id = students.id
                   JOIN classes ON grades.class_id = classes.id`;

  if (req.user.role === 'admin') {
    db.all(`${baseSql} ORDER BY grades.date DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  if (req.user.role === 'teacher') {
    db.all(
      `${baseSql} WHERE classes.teacher_id = ? ORDER BY grades.date DESC`,
      [req.user.teacher_id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  if (req.user.role === 'student') {
    db.all(
      `${baseSql} WHERE grades.student_id = ? ORDER BY grades.date DESC`,
      [req.user.student_id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  if (req.user.role === 'parent') {
    db.all(
      `${baseSql} WHERE grades.student_id IN (SELECT student_id FROM parent_students WHERE parent_user_id = ?) ORDER BY grades.date DESC`,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
    return;
  }

  res.status(403).json({ error: 'Access denied' });
});

app.post('/api/grades', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { student_id, class_id, assignment, score, max_score, comments, date } = req.body;
  if (!student_id || !class_id || !assignment) {
    return res.status(400).json({ error: 'student_id, class_id, and assignment are required' });
  }

  function insert() {
    db.run(
      'INSERT INTO grades (student_id, class_id, assignment, score, max_score, comments, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [student_id, class_id, assignment, score || null, max_score || null, comments || null, date || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, student_id, class_id, assignment, score, max_score, comments, date });
      }
    );
  }

  if (req.user.role === 'teacher') {
    teacherOwnsClass(req.user, class_id, (err, owns) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only add grades for their classes' });
      insert();
    });
    return;
  }

  insert();
});

app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/students', requireAuth, requireRole('admin'), (req, res) => {
  const { first_name, last_name, grade } = req.body;
  const sql = 'INSERT INTO students (first_name, last_name, grade) VALUES (?, ?, ?)';
  db.run(sql, [first_name, last_name, grade], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, first_name, last_name, grade });
  });
});

app.put('/api/students/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, grade } = req.body;

  // Admins may update any student; teachers may update students in their classes
  if (req.user.role !== 'admin') {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Requires admin or teacher role' });
    }

    teacherHasStudent(req.user, id, (err, has) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!has) return res.status(403).json({ error: 'Teacher may only edit students in their classes' });

      db.run(
        'UPDATE students SET first_name = ?, last_name = ?, grade = ? WHERE id = ?',
        [first_name, last_name, grade, id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: Number(id), first_name, last_name, grade });
        }
      );
    });
    return;
  }

  db.run(
    'UPDATE students SET first_name = ?, last_name = ?, grade = ? WHERE id = ?',
    [first_name, last_name, grade, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id), first_name, last_name, grade });
    }
  );
});

app.get('/api/teachers', (req, res) => {
  db.all('SELECT * FROM teachers ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/teachers', requireAuth, requireRole('admin'), (req, res) => {
  const { first_name, last_name, subject } = req.body;
  const sql = 'INSERT INTO teachers (first_name, last_name, subject) VALUES (?, ?, ?)';
  db.run(sql, [first_name, last_name, subject], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, first_name, last_name, subject });
  });
});

app.put('/api/teachers/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, subject } = req.body;

  // Admins may update any teacher; teachers may update their own record
  if (req.user.role !== 'admin') {
    if (req.user.role !== 'teacher' || String(req.user.teacher_id) !== String(id)) {
      return res.status(403).json({ error: 'Requires admin or owner teacher' });
    }
  }

  db.run(
    'UPDATE teachers SET first_name = ?, last_name = ?, subject = ? WHERE id = ?',
    [first_name, last_name, subject, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id), first_name, last_name, subject });
    }
  );
});

app.get('/api/classes', (req, res) => {
  const sql = `SELECT classes.id, classes.name, classes.room, classes.teacher_id AS teacher_id, teachers.first_name || ' ' || teachers.last_name AS teacher_name
               FROM classes
               LEFT JOIN teachers ON classes.teacher_id = teachers.id
               ORDER BY classes.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/students/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  // Admin can delete any student; teacher can delete a student only if that student is in one of their classes
  if (req.user.role === 'admin') {
    db.run('DELETE FROM students WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id) });
    });
    return;
  }

  if (req.user.role === 'teacher') {
    teacherHasStudent(req.user, id, (err, has) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!has) return res.status(403).json({ error: 'Teacher may only delete students in their classes' });
      db.run('DELETE FROM students WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: Number(id) });
      });
    });
    return;
  }

  res.status(403).json({ error: 'Access denied' });
});

app.delete('/api/teachers/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM teachers WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

app.delete('/api/classes/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM classes WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

app.delete('/api/enrollments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM enrollments WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

app.delete('/api/parent-students/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM parent_students WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

// Delete attendance and grades (admin only)
app.delete('/api/attendance/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM attendance WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

app.delete('/api/grades/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM grades WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id) });
  });
});

// Allow admin or teacher to update attendance (teacher limited to their classes)
app.put('/api/attendance/:id', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { id } = req.params;
  const { student_id, class_id, date, status, notes } = req.body;
  if (!student_id || !class_id || !date || !status) {
    return res.status(400).json({ error: 'student_id, class_id, date, and status are required' });
  }

  function update() {
    db.run(
      'UPDATE attendance SET student_id = ?, class_id = ?, date = ?, status = ?, notes = ? WHERE id = ?',
      [student_id, class_id, date, status, notes || null, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: Number(id), student_id, class_id, date, status, notes });
      }
    );
  }

  if (req.user.role === 'teacher') {
    teacherOwnsClass(req.user, class_id, (err, owns) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only edit attendance for their classes' });
      update();
    });
    return;
  }

  update();
});

// Allow admin or teacher to delete attendance (teacher limited to their classes)
app.delete('/api/attendance/:id', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { id } = req.params;
  if (req.user.role === 'admin') {
    db.run('DELETE FROM attendance WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id) });
    });
    return;
  }

  // teacher: ensure the attendance row belongs to a class taught by this teacher
  db.get('SELECT class_id FROM attendance WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Attendance not found' });
    teacherOwnsClass(req.user, row.class_id, (err2, owns) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only delete attendance for their classes' });
      db.run('DELETE FROM attendance WHERE id = ?', [id], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ id: Number(id) });
      });
    });
  });
});

// Grades: allow admin or teacher to update/delete (teacher limited to their classes)
app.put('/api/grades/:id', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { id } = req.params;
  const { student_id, class_id, assignment, score, max_score, comments, date } = req.body;
  if (!student_id || !class_id || !assignment) {
    return res.status(400).json({ error: 'student_id, class_id, and assignment are required' });
  }

  function update() {
    db.run(
      'UPDATE grades SET student_id = ?, class_id = ?, assignment = ?, score = ?, max_score = ?, comments = ?, date = ? WHERE id = ?',
      [student_id, class_id, assignment, score || null, max_score || null, comments || null, date || null, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: Number(id), student_id, class_id, assignment, score, max_score, comments, date });
      }
    );
  }

  if (req.user.role === 'teacher') {
    teacherOwnsClass(req.user, class_id, (err, owns) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only edit grades for their classes' });
      update();
    });
    return;
  }

  update();
});

app.delete('/api/grades/:id', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { id } = req.params;
  if (req.user.role === 'admin') {
    db.run('DELETE FROM grades WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(id) });
    });
    return;
  }

  db.get('SELECT class_id FROM grades WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Grade not found' });
    teacherOwnsClass(req.user, row.class_id, (err2, owns) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!owns) return res.status(403).json({ error: 'Teacher may only delete grades for their classes' });
      db.run('DELETE FROM grades WHERE id = ?', [id], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ id: Number(id) });
      });
    });
  });
});

app.post('/api/classes', requireAuth, requireRole('admin'), (req, res) => {
  const { name, teacher_id, room } = req.body;
  const sql = 'INSERT INTO classes (name, teacher_id, room) VALUES (?, ?, ?)';
  db.run(sql, [name, teacher_id || null, room], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, teacher_id, room });
  });
});

app.put('/api/classes/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { name, teacher_id, room } = req.body;
  db.run('UPDATE classes SET name = ?, teacher_id = ?, room = ? WHERE id = ?', [name, teacher_id || null, room, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id), name, teacher_id, room });
  });
});

app.get('/api/enrollments', (req, res) => {
  const sql = `SELECT enrollments.id, students.first_name || ' ' || students.last_name AS student_name,
         classes.name AS class_name,
         enrollments.student_id AS student_id,
         enrollments.class_id AS class_id
               FROM enrollments
               JOIN students ON enrollments.student_id = students.id
               JOIN classes ON enrollments.class_id = classes.id
               ORDER BY enrollments.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/enrollments', requireAuth, requireRole('admin'), (req, res) => {
  const { student_id, class_id } = req.body;
  const sql = 'INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)';
  db.run(sql, [student_id, class_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, student_id, class_id });
  });
});

app.put('/api/enrollments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { student_id, class_id } = req.body;
  if (!student_id || !class_id) return res.status(400).json({ error: 'student_id and class_id are required' });
  db.run('UPDATE enrollments SET student_id = ?, class_id = ? WHERE id = ?', [student_id, class_id, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(id), student_id, class_id });
  });
});

app.get('/api/export/:type', requireAuth, requireRole('admin'), (req, res) => {
  const type = req.params.type;
  let query;

  switch (type) {
    case 'students':
      query = 'SELECT * FROM students ORDER BY id';
      break;
    case 'teachers':
      query = 'SELECT * FROM teachers ORDER BY id';
      break;
    case 'classes':
      query = `SELECT id, name, teacher_id, room FROM classes ORDER BY id`;
      break;
    case 'enrollments':
      query = 'SELECT * FROM enrollments ORDER BY id';
      break;
    case 'attendance':
      query = `SELECT attendance.id, attendance.date, attendance.status, attendance.notes, attendance.student_id, attendance.class_id FROM attendance ORDER BY attendance.date DESC`;
      break;
    case 'grades':
      query = `SELECT grades.id, grades.assignment, grades.score, grades.max_score, grades.comments, grades.date, grades.student_id, grades.class_id FROM grades ORDER BY grades.date DESC`;
      break;
    default:
      return res.status(400).json({ error: 'Export type must be students, teachers, classes, enrollments, attendance, or grades' });
  }

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const csv = buildCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    res.send(csv);
  });
});

function importRows(rows, insertRow, callback) {
  let completed = 0;
  let errors = [];

  if (!rows.length) {
    return callback(errors, 0);
  }

  rows.forEach((row) => {
    insertRow(row, (err) => {
      if (err) {
        errors.push(err.message);
      }
      completed += 1;
      if (completed === rows.length) {
        callback(errors, rows.length);
      }
    });
  });
}

app.post('/api/import/:type', requireAuth, requireRole('admin'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const text = fs.readFileSync(req.file.path, 'utf8');
  fs.unlinkSync(req.file.path);

  const rows = parseCsv(text);
  if (!rows.length) {
    return res.status(400).json({ error: 'CSV file contains no data' });
  }

  const type = req.params.type;

  switch (type) {
    case 'students':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO students (first_name, last_name, grade) VALUES (?, ?, ?)';
        db.run(sql, [row.first_name, row.last_name, row.grade], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    case 'teachers':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO teachers (first_name, last_name, subject) VALUES (?, ?, ?)';
        db.run(sql, [row.first_name, row.last_name, row.subject], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    case 'classes':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO classes (name, teacher_id, room) VALUES (?, ?, ?)';
        db.run(sql, [row.name, row.teacher_id || null, row.room], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    case 'enrollments':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)';
        db.run(sql, [row.student_id, row.class_id], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    case 'attendance':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO attendance (student_id, class_id, date, status, notes) VALUES (?, ?, ?, ?, ?)';
        db.run(sql, [row.student_id, row.class_id, row.date, row.status, row.notes || null], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    case 'grades':
      importRows(rows, (row, done) => {
        const sql = 'INSERT INTO grades (student_id, class_id, assignment, score, max_score, comments, date) VALUES (?, ?, ?, ?, ?, ?, ?)';
        db.run(sql, [row.student_id, row.class_id, row.assignment, row.score || null, row.max_score || null, row.comments || null, row.date || null], done);
      }, (errors, count) => {
        res.json({ imported: count, errors });
      });
      break;
    default:
      res.status(400).json({ error: 'Import type must be students, teachers, classes, enrollments, attendance, or grades' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`School management app running at http://localhost:${port}`);
});
