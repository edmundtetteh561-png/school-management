const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const APP_PATH = path.join(__dirname, '..');
const PORT = process.env.PORT || 3001;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['server.js'], {
      cwd: APP_PATH,
      env: { ...process.env, PORT: PORT.toString() },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error('Server startup timeout'));
    }, 10000);

    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('School management app running')) {
        clearTimeout(timeout);
        resolve(server);
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function waitForStatus() {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try {
      const res = await request('/api/status');
      if (res.status === 200) {
        return;
      }
    } catch (_) {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('API did not respond in time');
}

(async () => {
  console.log('Starting server for tests...');
  const server = await startServer();

  try {
    await waitForStatus();

    const statusRes = await request('/api/status');
    assert.strictEqual(statusRes.status, 200, 'Status endpoint should return 200');
    console.log('Status endpoint OK');

    const loginRes = await request(
      '/api/login',
      'POST',
      JSON.stringify({ username: 'admin', password: 'admin123' }),
      { 'Content-Type': 'application/json' }
    );
    assert.strictEqual(loginRes.status, 200, 'Login should return 200');

    const loginData = JSON.parse(loginRes.body);
    assert.ok(loginData.token, 'Login response should include token');
    assert.strictEqual(loginData.role, 'admin', 'Default user should be admin');
    console.log('Login and auth OK');

    const meRes = await request('/api/me', 'GET', null, {
      Authorization: `Bearer ${loginData.token}`
    });
    assert.strictEqual(meRes.status, 200, '/api/me should return 200');

    const meData = JSON.parse(meRes.body);
    assert.strictEqual(meData.role, 'admin');
    console.log('/api/me endpoint OK');

    const studentRes = await request(
      '/api/students',
      'POST',
      JSON.stringify({ first_name: 'Test', last_name: 'Student', grade: '12' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(studentRes.status, 200, 'Student creation should return 200');
    console.log('Student creation OK');

    // create a teacher
    const teacherRes = await request(
      '/api/teachers',
      'POST',
      JSON.stringify({ first_name: 'Test', last_name: 'Teacher', subject: 'Math' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(teacherRes.status, 200, 'Teacher creation should return 200');
    const teacherData = JSON.parse(teacherRes.body);
    console.log('Teacher creation OK');

    // create a class
    const classRes = await request(
      '/api/classes',
      'POST',
      JSON.stringify({ name: 'Algebra', room: '101', teacher_id: teacherData.id }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(classRes.status, 200, 'Class creation should return 200');
    const classData = JSON.parse(classRes.body);
    console.log('Class creation OK');

    // enroll the student
    const createdStudent = JSON.parse(studentRes.body);
    const enrollRes = await request(
      '/api/enrollments',
      'POST',
      JSON.stringify({ student_id: createdStudent.id, class_id: classData.id }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(enrollRes.status, 200, 'Enrollment should return 200');
    console.log('Enrollment OK');

    // record attendance
    const attendanceRes = await request(
      '/api/attendance',
      'POST',
      JSON.stringify({ student_id: createdStudent.id, class_id: classData.id, date: new Date().toISOString().split('T')[0], status: 'present', notes: 'On time' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(attendanceRes.status, 200, 'Attendance creation should return 200');
    console.log('Attendance creation OK');

    // add grade
    const gradeRes = await request(
      '/api/grades',
      'POST',
      JSON.stringify({ student_id: createdStudent.id, class_id: classData.id, assignment: 'Test 1', score: 92, max_score: 100, date: new Date().toISOString().split('T')[0], comments: 'Good work' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(gradeRes.status, 200, 'Grade creation should return 200');
    console.log('Grade creation OK');

    // create parent user and link to student
    const parentUsername = `parent_${Date.now()}`;
    const parentUserRes = await request(
      '/api/users',
      'POST',
      JSON.stringify({ username: parentUsername, password: 'parentpass', role: 'parent' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(parentUserRes.status, 200, 'Parent user creation should return 200');
    const parentUser = JSON.parse(parentUserRes.body);

    const parentLinkRes = await request(
      '/api/parent-students',
      'POST',
      JSON.stringify({ parent_user_id: parentUser.id, student_id: createdStudent.id }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(parentLinkRes.status, 200, 'Parent link should return 200');
    console.log('Parent user and link OK');

    // login as parent and verify they can view attendance and grades for linked student
    const parentLogin = await request(
      '/api/login',
      'POST',
      JSON.stringify({ username: 'parent1', password: 'parentpass' }),
      { 'Content-Type': 'application/json' }
    );
    assert.strictEqual(parentLogin.status, 200, 'Parent login should return 200');
    const parentData = JSON.parse(parentLogin.body);

    const parentAttendance = await request('/api/attendance', 'GET', null, { Authorization: `Bearer ${parentData.token}` });
    assert.strictEqual(parentAttendance.status, 200, 'Parent should access attendance');
    assert.ok(parentAttendance.body.includes('On time') || parentAttendance.body.includes('present'), 'Parent attendance view should include recorded status');

    const parentGrades = await request('/api/grades', 'GET', null, { Authorization: `Bearer ${parentData.token}` });
    assert.strictEqual(parentGrades.status, 200, 'Parent should access grades');
    assert.ok(parentGrades.body.includes('Test 1'), 'Parent grades view should include recorded assignment');

    // export students CSV includes created student
    const exportRes = await request('/api/export/students', 'GET', null, {
      Authorization: `Bearer ${loginData.token}`
    });
    assert.strictEqual(exportRes.status, 200, 'Export should return 200');
    assert.ok(exportRes.body.includes('Test'), 'Exported CSV should include created student');
    console.log('CSV export OK');

    // edge-case tests: invalid user creation (missing role)
    const badUserRes = await request(
      '/api/users',
      'POST',
      JSON.stringify({ username: 'baduser', password: 'x' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    assert.strictEqual(badUserRes.status, 400, 'Creating user without role should return 400');
    console.log('Invalid user creation check OK');

    // duplicate username should fail (unique constraint)
    const dupRes = await request(
      '/api/users',
      'POST',
      JSON.stringify({ username: 'admin', password: 'x', role: 'admin' }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` }
    );
    if (dupRes.status === 200) {
      throw new Error('Expected duplicate user creation to fail');
    }
    console.log('Duplicate user creation check OK');

    console.log('All tests passed!');
  } catch (err) {
    console.error('Test failure:', err.message);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
