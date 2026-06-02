const http = require('http');

const PORT = process.env.PORT || 3000;

function request(method, path, data, token){
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {}
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) {
      const body = JSON.stringify(data);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(opts, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => out += chunk);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        let body = out;
        if (ct.includes('application/json')) {
          try { body = JSON.parse(out); } catch (e) {}
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

(async function(){
  try {
    const results = { steps: [] };
    results.steps.push({ name: 'login' });
    const login = await request('POST','/api/login',{ username: 'admin', password: 'admin123' });
    results.steps[results.steps.length-1].status = login.status;
    results.steps[results.steps.length-1].body = login.body;
    const token = login.body && login.body.token;
    if (!token) {
      results.error = 'No token';
      require('fs').writeFileSync('tools/api_check_result.json', JSON.stringify(results, null, 2));
      process.exit(1);
    }

    results.steps.push({ name: 'create_student' });
    const create = await request('POST','/api/students',{ first_name: 'Tmp', last_name: 'Del', grade: '9' }, token);
    results.steps[results.steps.length-1].status = create.status;
    results.steps[results.steps.length-1].body = create.body;
    const id = create.body && create.body.id;
    if (!id) {
      results.error = 'No created id';
      require('fs').writeFileSync('tools/api_check_result.json', JSON.stringify(results, null, 2));
      process.exit(1);
    }

    results.steps.push({ name: 'edit_student', id });
    const edit = await request('PUT',`/api/students/${id}`,{ first_name: 'TmpEdit', last_name: 'Del', grade: '10' }, token);
    results.steps[results.steps.length-1].status = edit.status;
    results.steps[results.steps.length-1].body = edit.body;

    results.steps.push({ name: 'delete_student', id });
    const del = await request('DELETE',`/api/students/${id}`, null, token);
    results.steps[results.steps.length-1].status = del.status;
    results.steps[results.steps.length-1].body = del.body;

    results.summary = 'completed';
    require('fs').writeFileSync('tools/api_check_result.json', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error', err);
    process.exit(1);
  }
})();
