# School Management

A school management application built with Node.js, Express, and SQLite.

## Features

- User login with role-based access control
- Admin, teacher, and student roles
- Student, teacher, class, and enrollment management
- CSV import/export for bulk data
- Browser-based dashboard with secure API connectivity
- Built-in test script for API validation

## Setup

1. Open a terminal in `c:\Users\edmun\Desktop\school-management`
2. Install dependencies:

```bash
npm install
```

3. Start the app:

```bash
npm start
```

4. Open a browser to:

```text
http://localhost:3000
```

## Login

- Default admin user: `admin`
- Default password: `admin123`

## Import/Export

- Export available from the dashboard for students, teachers, classes, and enrollments.
- Import CSV files using the `CSV import` form.
- Example student CSV header: `first_name,last_name,grade`

Additional features:

- Attendance and grades: teachers and admins can record student attendance and grades; parents and students can view linked records.
- Parent/guardian accounts: admins can create parent users and link them to students from the dashboard.

## Testing

Run the automated API test script:

```bash
npm test
```

## Linting

Quickly validate the main server and client JS files:

```bash
npm run lint
```

## Docker

A `Dockerfile` is included for containerized deployment. Build and run locally with:

```bash
docker build -t school-management .
docker run -p 3000:3000 school-management
```

## GitHub Actions

Continuous integration is configured in `.github/workflows/nodejs-ci.yml`.
On every push or pull request to `main`, it installs dependencies, runs tests, and checks JS syntax.

## Render deploy

Render is configured with `render.yaml` and can deploy your app from GitHub.
Create two repository secrets in GitHub if you want to auto-deploy from Actions:
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

Then enable the deploy workflow in `.github/workflows/render-deploy.yml`.

## Release / Commit

To commit your changes and create a simple release archive:

```bash
git add -A
git commit -m "Add attendance, grades, parent support, and tests"
git tag -a v1.0.0 -m "Initial feature-complete release"
zip -r school-management-v1.0.0.zip . -x node_modules/*

Alternatively, from this project folder create a release ZIP excluding the runtime DB and node_modules:

```bash
powershell -Command "Get-ChildItem -Path . -Exclude data,node_modules | Compress-Archive -DestinationPath ..\school-management-release.zip -Force"
```

The automated release created by the assistant is located on your Desktop:

- `C:\Users\edmun\Desktop\school-management-release.zip`
```

For production, consider setting up a proper CI pipeline and using `npm ci` on build agents.

## Notes

- The SQLite database is stored in `data/school.db`.
- Admin actions are protected by role checks.
- The app serves static files from `public/` and API routes under `/api/*`.
- For production, set `JWT_SECRET` in the environment before starting the app.

