const state = {
  students: [],
  teachers: [],
  classes: [],
  enrollments: [],
  attendance: [],
  grades: [],
  users: [],
  parentLinks: [],
  auth: { token: null, username: null, role: null }
};

function setMessage(text, isError = true) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#dc2626' : '#064e3b';
}

async function authFetch(path, options = {}) {
  options.headers = options.headers || {};
  if (state.auth.token) {
    options.headers.Authorization = `Bearer ${state.auth.token}`;
  }
  if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, options);
  const text = await res.text();
  let body = null;

  try {
    body = JSON.parse(text);
  } catch (_) {
    body = text;
  }

  if (!res.ok) {
    throw new Error(body?.error || body?.message || text || 'Request failed');
  }

  return body;
}

async function loadData() {
  state.students = await authFetch('/api/students');
  state.teachers = await authFetch('/api/teachers');
  state.classes = await authFetch('/api/classes');
  state.enrollments = await authFetch('/api/enrollments');
  state.attendance = await authFetch('/api/attendance');
  state.grades = await authFetch('/api/grades');
  if (state.auth.role === 'admin') {
    state.users = await authFetch('/api/users');
    state.parentLinks = await authFetch('/api/parent-students');
  } else if (state.auth.role === 'parent') {
    state.users = [];
    // parent-students will return only linked students for this parent
    state.parentLinks = await authFetch('/api/parent-students');
  } else {
    state.users = [];
    state.parentLinks = [];
  }
  renderLists();
}

function buildTable(items, columns) {
  if (!items.length) {
    return '<p>No records found.</p>';
  }

  const headers = columns.map((col) => `<th>${col.label}</th>`).join('');
  const rows = items
    .map((item) =>
      `<tr data-id="${item.id}">${columns
        .map((col) => `<td>${item[col.key] ?? ''}</td>`)
        .join('')}</tr>`
    )
    .join('');

  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLists() {
  document.getElementById('students-list').innerHTML = buildTable(state.students, [
    { label: 'ID', key: 'id' },
    { label: 'First Name', key: 'first_name' },
    { label: 'Last Name', key: 'last_name' },
    { label: 'Grade', key: 'grade' }
  ]);

  document.getElementById('teachers-list').innerHTML = buildTable(state.teachers, [
    { label: 'ID', key: 'id' },
    { label: 'First Name', key: 'first_name' },
    { label: 'Last Name', key: 'last_name' },
    { label: 'Subject', key: 'subject' }
  ]);

  document.getElementById('classes-list').innerHTML = buildTable(state.classes, [
    { label: 'ID', key: 'id' },
    { label: 'Class Name', key: 'name' },
    { label: 'Teacher', key: 'teacher_name' },
    { label: 'Room', key: 'room' }
  ]);

  document.getElementById('enrollments-list').innerHTML = buildTable(state.enrollments, [
    { label: 'ID', key: 'id' },
    { label: 'Student', key: 'student_name' },
    { label: 'Class', key: 'class_name' }
  ]);

  document.getElementById('users-list').innerHTML = buildTable(state.users, [
    { label: 'ID', key: 'id' },
    { label: 'Username', key: 'username' },
    { label: 'Role', key: 'role' },
    { label: 'Teacher ID', key: 'teacher_id' },
    { label: 'Student ID', key: 'student_id' }
  ]);

  document.getElementById('parent-links-list').innerHTML = buildTable(state.parentLinks, [
    { label: 'ID', key: 'id' },
    { label: 'Parent Username', key: 'parent_username' },
    { label: 'Student', key: 'student_name' }
  ]);

  // Admin can edit and delete all management tables.
  if (state.auth.role === 'admin') {
    addEditButtons('students-list', openStudentEditModal, 'students');
    addEditButtons('teachers-list', openTeacherEditModal, 'teachers');
    addEditButtons('classes-list', openInlineEditClass, 'classes');
    addEditButtons('enrollments-list', openInlineEditEnrollment, 'enrollments');
    addEditButtons('users-list', openInlineEditUser, 'users');
    addEditButtons('parent-links-list', openParentLinkEditModal, 'parent-students');
  }

  // Teachers may edit and delete attendance and grades for their classes.
  if (state.auth.role === 'admin' || state.auth.role === 'teacher') {
    addEditButtons('attendance-list', openEditAttendanceModal, 'attendance');
    addEditButtons('grades-list', openEditGradeModal, 'grades');
  }

  // Ensure action headers and guidance exist for admin/teacher roles
  (function ensureActionHints() {
    const role = state.auth.role;
    if (!(role === 'admin' || role === 'teacher')) return;
    const lists = ['attendance-list', 'grades-list', 'students-list', 'teachers-list', 'enrollments-list'];
    lists.forEach((id) => {
      const container = document.getElementById(id);
      if (!container) return;
      const table = container.querySelector('table');
      const hintId = `${id}-empty-hint`;

      // Remove stale hint if table now exists
      const existingHint = document.getElementById(hintId);
      if (table) {
        if (existingHint) existingHint.remove();

        const theadRow = table.querySelector('thead tr');
        if (theadRow && !theadRow.querySelector('.actions-th')) {
          const th = document.createElement('th');
          th.textContent = 'Actions';
          th.className = 'actions-th';
          theadRow.appendChild(th);
        }

        // Ensure each row has a placeholder cell for actions so layout is consistent
        table.querySelectorAll('tbody tr').forEach((tr) => {
          if (!tr.querySelector('td.actions-td')) {
            const td = document.createElement('td');
            td.className = 'actions-td';
            tr.appendChild(td);
          }
        });
      } else {
        // If no records yet, show a small hint so users know edit/delete will appear
        if (!existingHint) {
          const p = document.createElement('p');
          p.id = hintId;
          p.className = 'hint';
          p.textContent = 'No records yet. Add entries to enable Edit/Delete controls here.';
          container.appendChild(p);
        }
      }
    });
  })();

  // render parent-specific simple list for parents
  const myStudentsEl = document.getElementById('my-students-list');
  if (myStudentsEl) {
    if (!state.parentLinks || !state.parentLinks.length) {
      myStudentsEl.innerHTML = '<p>No linked students.</p>';
    } else {
      myStudentsEl.innerHTML = '<ul>' + state.parentLinks.map((p) => `
        <li data-student-id="${p.student_id || p.id}">
          <span>${p.student_name}</span>
          <span class="my-student-actions">
            <button class="view-attendance">Attendance</button>
            <button class="view-grades">Grades</button>
          </span>
        </li>
      `).join('') + '</ul>';
    }
  }

  // click delegation for parent student actions
  if (myStudentsEl) {
    myStudentsEl.querySelectorAll('button').forEach((b) => b.removeEventListener && b.removeEventListener('click', () => {}));
    myStudentsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      const li = e.target.closest('li');
      if (btn && li) {
        const studentId = li.dataset.studentId;
        if (!studentId) return;

        if (btn.classList.contains('view-attendance')) {
          const items = state.attendance.filter((a) => String(a.student_id) === String(studentId));
          document.getElementById('attendance-list').innerHTML = buildTable(items, [
            { label: 'ID', key: 'id' },
            { label: 'Date', key: 'date' },
            { label: 'Status', key: 'status' },
            { label: 'Class', key: 'class_name' },
            { label: 'Notes', key: 'notes' }
          ]);
        }

        if (btn.classList.contains('view-grades')) {
          const items = state.grades.filter((g) => String(g.student_id) === String(studentId));
          document.getElementById('grades-list').innerHTML = buildTable(items, [
            { label: 'ID', key: 'id' },
            { label: 'Assignment', key: 'assignment' },
            { label: 'Score', key: 'score' },
            { label: 'Max Score', key: 'max_score' },
            { label: 'Class', key: 'class_name' },
            { label: 'Date', key: 'date' }
          ]);
        }

        return;
      }

      // if click on the li text (not a button), open modal
      if (!btn && li) {
        const studentId = li.dataset.studentId;
        if (studentId) openStudentModal(studentId);
      }
    });
  }

  // allow clicking student rows to open modal
  const studentsListEl = document.getElementById('students-list');
  if (studentsListEl) {
    const table = studentsListEl.querySelector('table');
    if (table) {
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const id = tr.dataset.id;
          if (id) openStudentModal(id);
        });
      });
    }
  }

  // render compact student view when a student is logged in
  const studentAreaEl = document.getElementById('student-area');
  if (studentAreaEl) {
    if (state.auth.role === 'student') {
      // state.attendance and state.grades are already scoped server-side for students
      document.getElementById('student-attendance').innerHTML = '<h3>Attendance</h3>' + buildTable(state.attendance, [
        { label: 'Date', key: 'date' },
        { label: 'Status', key: 'status' },
        { label: 'Class', key: 'class_name' },
        { label: 'Notes', key: 'notes' }
      ]);

      document.getElementById('student-grades').innerHTML = '<h3>Grades</h3>' + buildTable(state.grades, [
        { label: 'Assignment', key: 'assignment' },
        { label: 'Score', key: 'score' },
        { label: 'Max', key: 'max_score' },
        { label: 'Class', key: 'class_name' },
        { label: 'Date', key: 'date' }
      ]);
    } else {
      studentAreaEl.querySelector('#student-attendance').innerHTML = '';
      studentAreaEl.querySelector('#student-grades').innerHTML = '';
    }
  }

  document.getElementById('attendance-list').innerHTML = buildTable(state.attendance, [
    { label: 'ID', key: 'id' },
    { label: 'Date', key: 'date' },
    { label: 'Status', key: 'status' },
    { label: 'Student', key: 'student_name' },
    { label: 'Class', key: 'class_name' },
    { label: 'Notes', key: 'notes' }
  ]);

  document.getElementById('grades-list').innerHTML = buildTable(state.grades, [
    { label: 'ID', key: 'id' },
    { label: 'Assignment', key: 'assignment' },
    { label: 'Score', key: 'score' },
    { label: 'Max Score', key: 'max_score' },
    { label: 'Student', key: 'student_name' },
    { label: 'Class', key: 'class_name' },
    { label: 'Date', key: 'date' }
  ]);

  const studentSelect = document.getElementById('student-select');
  const classSelect = document.getElementById('class-select');
  const teacherSelect = document.getElementById('teacher-select');
  const attendanceStudentSelect = document.getElementById('attendance-student-select');
  const gradeStudentSelect = document.getElementById('grade-student-select');
  const attendanceClassSelect = document.getElementById('attendance-class-select');
  const gradeClassSelect = document.getElementById('grade-class-select');
  const userTeacherSelect = document.getElementById('user-teacher-select');
  const userStudentSelect = document.getElementById('user-student-select');
  const parentUserSelect = document.getElementById('parent-user-select');
  const parentStudentSelect = document.getElementById('parent-student-select');

  const studentOptions = '<option value="">Select student</option>' +
    state.students.map((student) =>
      `<option value="${student.id}">${student.first_name} ${student.last_name}</option>`
    ).join('');

  const classOptions = '<option value="">Select class</option>' +
    state.classes.map((cls) =>
      `<option value="${cls.id}">${cls.name}</option>`
    ).join('');

  const teacherOptions = '<option value="">Assign teacher</option>' +
    state.teachers.map((teacher) =>
      `<option value="${teacher.id}">${teacher.first_name} ${teacher.last_name}</option>`
    ).join('');

  const parentUserOptions = '<option value="">Select parent user</option>' +
    state.users
      .filter((user) => user.role === 'parent')
      .map((user) => `<option value="${user.id}">${user.username}</option>`)
      .join('');

  studentSelect.innerHTML = studentOptions;
  attendanceStudentSelect.innerHTML = studentOptions;
  gradeStudentSelect.innerHTML = studentOptions;
  parentStudentSelect.innerHTML = studentOptions;
  classSelect.innerHTML = classOptions;
  attendanceClassSelect.innerHTML = classOptions;
  gradeClassSelect.innerHTML = classOptions;

  teacherSelect.innerHTML = teacherOptions;
  userTeacherSelect.innerHTML = teacherOptions;
  userStudentSelect.innerHTML = studentOptions;
  parentUserSelect.innerHTML = parentUserOptions;

}

function addEditButtons(listId, handler) {
  const container = document.getElementById(listId);
  if (!container) return;
  const table = container.querySelector('table');
  if (!table) return;

  const theadRow = table.querySelector('thead tr');
  if (theadRow && !theadRow.querySelector('.actions-th')) {
    const th = document.createElement('th');
    th.textContent = 'Actions';
    th.className = 'actions-th';
    theadRow.appendChild(th);

    table.querySelectorAll('tbody tr').forEach((tr) => {
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = 'Edit';
      btn.className = 'edit-btn';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handler(tr.dataset.id);
      });
      td.appendChild(btn);

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'delete-btn';
      del.style.marginLeft = '8px';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this record? This action cannot be undone.')) return;
        try {
          // map listId to endpoint
          let endpoint = listId.replace('-list', '');
          if (endpoint === 'parent-links') endpoint = 'parent-students';
          await authFetch(`/api/${endpoint}/${tr.dataset.id}`, { method: 'DELETE' });
          setMessage('Deleted.', false);
          await loadData();
        } catch (err) {
          setMessage(err.message);
        }
      });
      td.appendChild(del);
      tr.appendChild(td);
    });
  }
}

function enableRowEditing(tr, fields, onSave, onCancel) {
  // fields: array of {key, type:'text'|'select', options?}
  const tds = Array.from(tr.querySelectorAll('td'));
  // skip ID cell (assume first td is ID)
  fields.forEach((field, idx) => {
    const cell = tds[idx + 1];
    if (!cell) return;
    if (field.type === 'select') {
      const select = document.createElement('select');
      field.options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(opt.value) === String(field.value)) o.selected = true;
        select.appendChild(o);
      });
      cell._orig = cell.innerHTML;
      cell.innerHTML = '';
      cell.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.value = field.value || '';
      cell._orig = cell.innerHTML;
      cell.innerHTML = '';
      cell.appendChild(input);
    }
  });

  // actions cell is last td
  const actionsTd = tr.querySelector('td:last-child');
  if (!actionsTd) return;
  actionsTd._orig = actionsTd.innerHTML;
  actionsTd.innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginLeft = '8px';
  actionsTd.appendChild(saveBtn);
  actionsTd.appendChild(cancelBtn);

  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const values = {};
    fields.forEach((field, idx) => {
      const cell = tds[idx + 1];
      const input = cell.querySelector('input, select');
      values[field.key] = input ? input.value : '';
    });
    try {
      await onSave(values);
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // restore
    fields.forEach((field, idx) => {
      const cell = tds[idx + 1];
      if (cell && cell._orig !== undefined) cell.innerHTML = cell._orig;
    });
    if (actionsTd && actionsTd._orig !== undefined) actionsTd.innerHTML = actionsTd._orig;
  });
}

function openInlineEditClass(classId) {
  const tr = document.querySelector(`#classes-list table tbody tr[data-id="${classId}"]`);
  if (!tr) return setMessage('Row not found');
  const cls = state.classes.find((c) => String(c.id) === String(classId));
  if (!cls) return setMessage('Class not found');
  const teacherOptions = state.teachers.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` }));
  enableRowEditing(tr, [
    { key: 'name', type: 'text', value: cls.name },
    { key: 'teacher_id', type: 'select', options: teacherOptions, value: cls.teacher_id },
    { key: 'room', type: 'text', value: cls.room }
  ], async (values) => {
    await authFetch(`/api/classes/${classId}`, { method: 'PUT', body: JSON.stringify(values) });
    setMessage('Class updated.', false);
  });
}

function openInlineEditEnrollment(enrollmentId) {
  const tr = document.querySelector(`#enrollments-list table tbody tr[data-id="${enrollmentId}"]`);
  if (!tr) return setMessage('Row not found');
  const enr = state.enrollments.find((e) => String(e.id) === String(enrollmentId));
  if (!enr) return setMessage('Enrollment not found');
  const studentOptions = state.students.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` }));
  const classOptions = state.classes.map((c) => ({ value: c.id, label: c.name }));
  enableRowEditing(tr, [
    { key: 'student_id', type: 'select', options: studentOptions, value: enr.student_id },
    { key: 'class_id', type: 'select', options: classOptions, value: enr.class_id }
  ], async (values) => {
    await authFetch(`/api/enrollments/${enrollmentId}`, { method: 'PUT', body: JSON.stringify(values) });
    setMessage('Enrollment updated.', false);
  });
}

function openInlineEditUser(userId) {
  const tr = document.querySelector(`#users-list table tbody tr[data-id="${userId}"]`);
  if (!tr) return setMessage('Row not found');
  const usr = state.users.find((u) => String(u.id) === String(userId));
  if (!usr) return setMessage('User not found');
  const teacherOptions = [{ value: '', label: 'None' }].concat(state.teachers.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` })));
  const studentOptions = [{ value: '', label: 'None' }].concat(state.students.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` })));
  enableRowEditing(tr, [
    { key: 'username', type: 'text', value: usr.username },
    { key: 'role', type: 'select', options: [{ value: 'admin', label: 'admin' }, { value: 'teacher', label: 'teacher' }, { value: 'student', label: 'student' }, { value: 'parent', label: 'parent' }], value: usr.role },
    { key: 'teacher_id', type: 'select', options: teacherOptions, value: usr.teacher_id || '' },
    { key: 'student_id', type: 'select', options: studentOptions, value: usr.student_id || '' }
  ], async (values) => {
    // normalize empty strings to null for ids
    if (values.teacher_id === '') values.teacher_id = null;
    if (values.student_id === '') values.student_id = null;
    await authFetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(values) });
    setMessage('User updated.', false);
  });
}

function openEditAttendanceModal(attId) {
  const id = String(attId);
  const att = state.attendance.find((a) => String(a.id) === id);
  if (!att) return setMessage('Attendance not found');

  const studentOptions = state.students.map((s) => `<option value="${s.id}" ${s.id == att.student_id ? 'selected' : ''}>${s.first_name} ${s.last_name}</option>`).join('');
  const classOptions = state.classes.map((c) => `<option value="${c.id}" ${c.id == att.class_id ? 'selected' : ''}>${c.name}</option>`).join('');

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>Edit Attendance</h2>
    <form id="edit-attendance-form">
      <label>Student<br/><select name="student_id">${studentOptions}</select></label>
      <label>Class<br/><select name="class_id">${classOptions}</select></label>
      <label>Date<br/><input type="date" name="date" value="${att.date || ''}" required /></label>
      <label>Status<br/>
        <select name="status" required>
          <option value="present" ${att.status==='present'?'selected':''}>Present</option>
          <option value="absent" ${att.status==='absent'?'selected':''}>Absent</option>
          <option value="late" ${att.status==='late'?'selected':''}>Late</option>
        </select>
      </label>
      <label>Notes<br/><input name="notes" value="${att.notes || ''}" /></label>
      <div style="margin-top:12px"><button type="submit">Save</button> <button type="button" id="cancel-edit-att">Cancel</button></div>
    </form>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('cancel-edit-att').onclick = closeStudentModal;
  document.getElementById('edit-attendance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await authFetch(`/api/attendance/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Attendance updated.', false);
      closeStudentModal();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });
}

function openEditGradeModal(gId) {
  const id = String(gId);
  const gr = state.grades.find((g) => String(g.id) === id);
  if (!gr) return setMessage('Grade not found');

  const studentOptions = state.students.map((s) => `<option value="${s.id}" ${s.id == gr.student_id ? 'selected' : ''}>${s.first_name} ${s.last_name}</option>`).join('');
  const classOptions = state.classes.map((c) => `<option value="${c.id}" ${c.id == gr.class_id ? 'selected' : ''}>${c.name}</option>`).join('');

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>Edit Grade</h2>
    <form id="edit-grade-form">
      <label>Student<br/><select name="student_id">${studentOptions}</select></label>
      <label>Class<br/><select name="class_id">${classOptions}</select></label>
      <label>Assignment<br/><input name="assignment" value="${gr.assignment || ''}" required /></label>
      <label>Score<br/><input type="number" name="score" value="${gr.score || ''}" /></label>
      <label>Max Score<br/><input type="number" name="max_score" value="${gr.max_score || ''}" /></label>
      <label>Date<br/><input type="date" name="date" value="${gr.date || ''}" /></label>
      <label>Comments<br/><input name="comments" value="${gr.comments || ''}" /></label>
      <div style="margin-top:12px"><button type="submit">Save</button> <button type="button" id="cancel-edit-grade">Cancel</button></div>
    </form>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('cancel-edit-grade').onclick = closeStudentModal;
  document.getElementById('edit-grade-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await authFetch(`/api/grades/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Grade updated.', false);
      closeStudentModal();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });
}

async function openStudentEditModal(studentId) {
  const sid = String(studentId);
  const student = state.students.find((s) => String(s.id) === sid);
  if (!student) {
    setMessage('Student not found');
    return;
  }

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>Edit Student</h2>
    <form id="edit-student-form">
      <label>First name<br/><input name="first_name" value="${student.first_name || ''}" required /></label>
      <label>Last name<br/><input name="last_name" value="${student.last_name || ''}" required /></label>
      <label>Grade<br/><input name="grade" value="${student.grade || ''}" /></label>
      <div style="margin-top:12px"><button type="submit">Save</button> <button type="button" id="cancel-edit">Cancel</button></div>
    </form>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('cancel-edit').onclick = closeStudentModal;
  document.getElementById('edit-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await authFetch(`/api/students/${sid}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Student updated.', false);
      closeStudentModal();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });
}

async function openTeacherEditModal(teacherId) {
  const tid = String(teacherId);
  const teacher = state.teachers.find((t) => String(t.id) === tid);
  if (!teacher) return setMessage('Teacher not found');

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>Edit Teacher</h2>
    <form id="edit-teacher-form">
      <label>First name<br/><input name="first_name" value="${teacher.first_name || ''}" required /></label>
      <label>Last name<br/><input name="last_name" value="${teacher.last_name || ''}" required /></label>
      <label>Subject<br/><input name="subject" value="${teacher.subject || ''}" /></label>
      <div style="margin-top:12px"><button type="submit">Save</button> <button type="button" id="cancel-edit-teacher">Cancel</button></div>
    </form>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('cancel-edit-teacher').onclick = closeStudentModal;
  document.getElementById('edit-teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await authFetch(`/api/teachers/${tid}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Teacher updated.', false);
      closeStudentModal();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });
}

async function openParentLinkEditModal(linkId) {
  const lid = String(linkId);
  const link = state.parentLinks.find((p) => String(p.id) === lid);
  if (!link) return setMessage('Link not found');

  const parentOptions = state.users.filter((u) => u.role === 'parent').map((u) => `<option value="${u.id}" ${u.id === link.parent_user_id ? 'selected' : ''}>${u.username}</option>`).join('');
  const studentOptions = state.students.map((s) => `<option value="${s.id}" ${s.id === link.student_id ? 'selected' : ''}>${s.first_name} ${s.last_name}</option>`).join('');

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>Edit Parent Link</h2>
    <form id="edit-link-form">
      <label>Parent user<br/><select name="parent_user_id" required><option value="">Select parent</option>${parentOptions}</select></label>
      <label>Student<br/><select name="student_id" required><option value="">Select student</option>${studentOptions}</select></label>
      <div style="margin-top:12px"><button type="submit">Save</button> <button type="button" id="cancel-edit-link">Cancel</button></div>
    </form>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('cancel-edit-link').onclick = closeStudentModal;
  document.getElementById('edit-link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await authFetch(`/api/parent-students/${lid}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Parent link updated.', false);
      closeStudentModal();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  });
}

function openStudentModal(studentId) {
  const sid = String(studentId);
  const student = state.students.find((s) => String(s.id) === sid) || { id: sid, first_name: '', last_name: '' };
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim() || `Student ${sid}`;

  const attendance = state.attendance.filter((a) => String(a.student_id) === sid);
  const grades = state.grades.filter((g) => String(g.student_id) === sid);

  const body = document.getElementById('student-modal-body');
  body.innerHTML = `
    <h2>${name}</h2>
    <p><strong>Grade:</strong> ${student.grade || 'N/A'}</p>
    <section>
      <h3>Recent Attendance</h3>
      ${buildTable(attendance.slice(0, 20), [
        { label: 'Date', key: 'date' },
        { label: 'Status', key: 'status' },
        { label: 'Class', key: 'class_name' },
        { label: 'Notes', key: 'notes' }
      ])}
    </section>
    <section>
      <h3>Recent Grades</h3>
      ${buildTable(grades.slice(0, 20), [
        { label: 'Assignment', key: 'assignment' },
        { label: 'Score', key: 'score' },
        { label: 'Max', key: 'max_score' },
        { label: 'Class', key: 'class_name' },
        { label: 'Date', key: 'date' }
      ])}
    </section>
  `;

  const modal = document.getElementById('student-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const close = document.getElementById('student-modal-close');
  close.onclick = closeStudentModal;
  modal.querySelector('.modal-backdrop').onclick = closeStudentModal;
}

function closeStudentModal() {
  const modal = document.getElementById('student-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const close = document.getElementById('student-modal-close');
  if (close) close.onclick = null;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = null;
}

function getAccessiblePages(role) {
  const pages = {
    admin: ['dashboard', 'students', 'teachers', 'classes', 'enrollments', 'attendance', 'grades', 'export', 'import'],
    teacher: ['dashboard', 'students', 'teachers', 'classes', 'enrollments', 'attendance', 'grades'],
    parent: ['dashboard', 'students', 'attendance', 'grades'],
    student: ['dashboard', 'attendance', 'grades']
  };
  return pages[role] || ['dashboard'];
}

function syncNavigation(role) {
  const allowedPages = getAccessiblePages(role);
  document.querySelectorAll('.site-nav a').forEach((link) => {
    const page = link.getAttribute('href').slice(1);
    link.classList.toggle('hidden', !allowedPages.includes(page));
  });
}

function updateAuthUI() {
  const loginCard = document.getElementById('login-card');
  const dashboardPage = document.getElementById('page-dashboard');
  const welcomeText = document.getElementById('welcome-text');
  const roleText = document.getElementById('role-text');
  const accessNote = document.getElementById('access-note');
  const nav = document.getElementById('site-nav');

  const role = state.auth.role;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isParent = role === 'parent';
  const isStudent = role === 'student';
  const isLoggedIn = Boolean(state.auth.token);
  const allowedPages = getAccessiblePages(role);

  loginCard.classList.toggle('hidden', isLoggedIn);
  nav.classList.toggle('hidden', !isLoggedIn);
  if (dashboardPage) dashboardPage.classList.toggle('hidden', !isLoggedIn);
  syncNavigation(role);

  const studentForm = document.getElementById('student-form');
  const teacherForm = document.getElementById('teacher-form');
  const classForm = document.getElementById('class-form');
  const enrollmentForm = document.getElementById('enrollment-form');
  const attendanceForm = document.getElementById('attendance-form');
  const gradeForm = document.getElementById('grade-form');
  const exportCard = document.getElementById('export-card');
  const importCard = document.getElementById('import-card');

  if (studentForm) studentForm.classList.toggle('hidden', !isAdmin);
  if (teacherForm) teacherForm.classList.toggle('hidden', !isAdmin);
  if (classForm) classForm.classList.toggle('hidden', !isAdmin);
  if (enrollmentForm) enrollmentForm.classList.toggle('hidden', !isAdmin);
  if (attendanceForm) attendanceForm.classList.toggle('hidden', !(isAdmin || isTeacher));
  if (gradeForm) gradeForm.classList.toggle('hidden', !(isAdmin || isTeacher));
  if (exportCard) exportCard.classList.toggle('hidden', !isAdmin);
  if (importCard) importCard.classList.toggle('hidden', !isAdmin);

  const parentArea = document.getElementById('parent-area');
  if (parentArea) parentArea.classList.toggle('hidden', !isParent);
  const studentArea = document.getElementById('student-area');
  if (studentArea) studentArea.classList.toggle('hidden', !isStudent);

  if (isLoggedIn) {
    if (isAdmin) {
      accessNote.innerHTML = '<p>Admins can manage students, teachers, classes, enrollments, users, and parent links. Import/export is available.</p>';
    } else if (isTeacher) {
      accessNote.innerHTML = '<p>Teachers can view classes, take attendance, and add grades for their assigned courses.</p>';
    } else if (isParent) {
      accessNote.innerHTML = '<p>Parents can view linked student attendance and grades, and keep families up to date.</p>';
    } else if (isStudent) {
      accessNote.innerHTML = '<p>Students can view their own attendance and grade records.</p>';
    } else {
      accessNote.innerHTML = '<p>Your access is limited to school data.</p>';
    }
  }

  welcomeText.textContent = isLoggedIn ? `Hello, ${state.auth.username}` : 'Welcome back!';
  roleText.textContent = isLoggedIn ? `Role: ${role}` : '';

  const currentPage = getCurrentPage();
  if (!allowedPages.includes(currentPage)) {
    setPage('dashboard');
  } else if (isLoggedIn) {
    setPage(currentPage);
  }
}

function setAuth(auth) {
  state.auth = auth;
  localStorage.setItem('schoolAuth', JSON.stringify(auth));
}

function clearAuth() {
  state.auth = { token: null, username: null, role: null };
  localStorage.removeItem('schoolAuth');
}

function getCurrentPage() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const page = document.getElementById(`page-${hash}`) ? hash : 'dashboard';
  return page;
}

function setPage(page) {
  const targetPage = document.getElementById(`page-${page}`) ? page : 'dashboard';
  const pages = document.querySelectorAll('.page');
  pages.forEach((section) => {
    section.classList.toggle('hidden', section.id !== `page-${targetPage}`);
  });

  document.querySelectorAll('.site-nav a').forEach((link) => {
    const target = link.getAttribute('href').slice(1);
    link.classList.toggle('active', target === targetPage);
  });
}

function hideAllPages() {
  document.querySelectorAll('.page').forEach((section) => section.classList.add('hidden'));
}

function wirePageNavigation() {
  document.querySelectorAll('.site-nav a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const page = link.getAttribute('href').slice(1);
      const allowedPages = getAccessiblePages(state.auth.role);
      if (!state.auth.token || !allowedPages.includes(page)) return;
      setPage(page);
      history.pushState(null, '', `#${page}`);
    });
  });

  window.addEventListener('hashchange', () => {
    if (!state.auth.token) return;
    const currentPage = getCurrentPage();
    const allowedPages = getAccessiblePages(state.auth.role);
    if (!allowedPages.includes(currentPage)) {
      setPage('dashboard');
      history.replaceState(null, '', '#dashboard');
      return;
    }
    setPage(currentPage);
  });
}

function loadStoredAuth() {
  const stored = localStorage.getItem('schoolAuth');
  if (!stored) {
    return;
  }

  try {
    state.auth = JSON.parse(stored);
  } catch (error) {
    clearAuth();
  }
}

async function downloadCsv(type) {
  try {
    const response = await fetch(`/api/export/${type}`, {
      headers: {
        Authorization: `Bearer ${state.auth.token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Export failed');
    }

    const csv = await response.text();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${type} successfully.`, false);
  } catch (error) {
    setMessage(error.message);
  }
}

async function handleImport(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const type = formData.get('type');

  if (!type) {
    setMessage('Select a valid import type.');
    return;
  }

  try {
    await authFetch(`/api/import/${type}`, {
      method: 'POST',
      body: formData
    });
    setMessage(`${type} imported successfully.`, false);
    form.reset();
    await loadData();
  } catch (error) {
    setMessage(error.message);
  }
}

function wireForm(formId, apiPath, payloadBuilder) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = payloadBuilder(Object.fromEntries(formData.entries()));

    try {
      await authFetch(apiPath, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      await loadData();
      setMessage('Saved successfully.', false);
    } catch (error) {
      setMessage(error.message);
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  loadStoredAuth();
  updateAuthUI();

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const result = await authFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setAuth(result);
      updateAuthUI();
      await loadData();
      setPage(getCurrentPage());
      setMessage('Login successful.', false);
    } catch (error) {
      setMessage(error.message);
    }
  });

  document.getElementById('logout-button').addEventListener('click', () => {
    clearAuth();
    updateAuthUI();
    hideAllPages();
    setMessage('Logged out.', false);
  });

  wirePageNavigation();

  document.querySelectorAll('[data-type]').forEach((button) => {
    button.addEventListener('click', () => downloadCsv(button.dataset.type));
  });

  document.getElementById('import-form').addEventListener('submit', handleImport);

  wireForm('student-form', '/api/students', ({ first_name, last_name, grade }) => ({ first_name, last_name, grade }));
  wireForm('teacher-form', '/api/teachers', ({ first_name, last_name, subject }) => ({ first_name, last_name, subject }));
  wireForm('class-form', '/api/classes', ({ name, room, teacher_id }) => ({ name, room, teacher_id: teacher_id || null }));
  wireForm('enrollment-form', '/api/enrollments', ({ student_id, class_id }) => ({ student_id, class_id }));

  wireForm('attendance-form', '/api/attendance', ({ student_id, class_id, date, status, notes }) => ({ student_id, class_id, date, status, notes }));
  wireForm('grade-form', '/api/grades', ({ student_id, class_id, assignment, score, max_score, comments, date }) => ({ student_id, class_id, assignment, score, max_score, comments, date }));
  wireForm('user-form', '/api/users', ({ username, password, role, teacher_id, student_id }) => ({ username, password, role, teacher_id: teacher_id || null, student_id: student_id || null }));
  wireForm('parent-link-form', '/api/parent-students', ({ parent_user_id, student_id }) => ({ parent_user_id, student_id }));

  if (state.auth.token) {
    try {
      await loadData();
      setPage(getCurrentPage());
    } catch (error) {
      clearAuth();
      updateAuthUI();
      setMessage('Session expired. Please log in again.');
    }
  } else {
    hideAllPages();
  }
});



