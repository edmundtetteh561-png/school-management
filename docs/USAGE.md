# School Management Usage Guide

## Login

- Default admin account:
  - Username: `admin`
  - Password: `admin123`

## Roles

- `admin`: Full access to manage students, teachers, classes, enrollments, and import/export CSV.
- `teacher`: Can view school data.
- `student`: Can view school data.

## Import CSV

Supported import types:
- `students`: `first_name,last_name,grade`
- `teachers`: `first_name,last_name,subject`
- `classes`: `name,teacher_id,room`
- `enrollments`: `student_id,class_id`

## Export CSV

Use the dashboard export buttons to download current data for each entity.

## Commands

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Run the smoke tests:

```bash
npm test
```
