# EduPlay - User Manual

**Interactive Classroom Learning Platform**
Version 1.0 | May 2026

---

## Table of Contents

1. [What is EduPlay?](#1-what-is-eduplay)
2. [System Requirements](#2-system-requirements)
3. [Getting Started](#3-getting-started)
4. [Teacher Guide](#4-teacher-guide)
5. [Student Guide](#5-student-guide)
6. [Content Manager (Admin)](#6-content-manager)
7. [Activity Types](#7-activity-types)
8. [Server Management](#8-server-management)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What is EduPlay?

EduPlay is a web-based interactive learning platform for kids (Grade 1–5). Inspired by Kahoot, it allows teachers to host live classroom sessions where students join from their phones or tablets to participate in quizzes, drag & drop games, and drawing activities — all in real time.

### Key Features

- **Live quiz sessions** with timed questions and real-time leaderboard
- **Drag & drop matching games** (e.g. animals to sounds, colors to objects)
- **Drawing canvas** with colors, brush sizes, and touch support
- **Session codes** for easy student access (no accounts needed)
- **Teacher dashboard** with live monitoring and submission review
- **Content manager** to create/edit quizzes and puzzles from the browser
- **PIN protection** for teacher and admin pages

---

## 2. System Requirements

### Server

- Ubuntu VM (tested on OCI Free Tier)
- Node.js v18 or later
- Port 3000 (or custom via `PORT` env var)

### Users (Teacher & Students)

- Any modern web browser (Chrome, Safari, Firefox, Edge)
- Works on desktop, tablet, and mobile
- Internet connection

---

## 3. Getting Started

### Accessing the Platform

| Page | URL |
|------|-----|
| Home | `https://lms.sandkloudlabs.com` |
| Teacher Dashboard | `https://lms.sandkloudlabs.com/teacher.html` |
| Student Join | `https://lms.sandkloudlabs.com/student.html` |
| Content Manager | `https://lms.sandkloudlabs.com/admin.html` |

### Default Teacher PIN

The default PIN is **`1234`**. This is required to access the Teacher Dashboard and Content Manager.

To change it, restart the server with:

```
TEACHER_PIN=yourNewPin node server.js
```

---

## 4. Teacher Guide

### Step 1: Log In

1. Go to the Teacher Dashboard
2. Enter the teacher PIN
3. Click **Enter**

> The PIN is remembered for the current browser tab session. Closing the tab requires re-entry.

### Step 2: Create a Session

1. Click **Create Session**
2. A 6-character session code is generated (e.g. `ABC123`)
3. Share this code with your students (write on board, project on screen, etc.)

### Step 3: Wait for Students

- Students appear in the "Students in Room" area as they join
- You'll see a notification for each student that joins or leaves

### Step 4: Start an Activity

You have three options:

| Activity | How to Start |
|----------|-------------|
| **Quiz** | Click one of the quiz cards (Math, Science, English, or any custom quiz) |
| **Drag & Drop** | Click the "Drag & Drop" activity card |
| **Drawing Canvas** | Click the "Drawing Canvas" activity card |

### Step 5: Running a Quiz

1. Click a quiz card to start
2. Click **Start First Question** to show Q1 to all students
3. Watch answers come in — the progress counter shows `X / Y answered`
4. When all answer (or time runs out), the correct answer highlights
5. Click **Next Question** to advance
6. After the last question, the final leaderboard is shown
7. Click **Back to Lobby** to return

### Step 6: Running an Activity

1. Click **Drag & Drop** or **Drawing Canvas**
2. Students receive a notification and a link to open the activity
3. As students submit, their work appears in your gallery view
4. Click **End Activity** when done

### Step 7: View Submissions

- Click **View All Submissions** in the lobby to see every submission from the session
- Includes quiz answers (correct/wrong), drag & drop scores, and drawing images

### Step 8: Edit Content

- Click **Edit Content** in the lobby to open the Content Manager
- See [Section 6](#6-content-manager) for details

---

## 5. Student Guide

### Step 1: Join a Session

1. Go to the Student page
2. Enter the **6-character code** from your teacher
3. Enter your **nickname** (2 or more characters)
4. Click **Join!**

### Step 2: Wait for Teacher

- You'll see a waiting screen: "Waiting for teacher to start an activity..."
- Stay on this page — activities will appear automatically

### Step 3: Taking a Quiz

1. A question appears with 4 options and a countdown timer
2. Tap your answer before time runs out
3. Faster correct answers earn more points!
4. After each question, you see if you were right and your score
5. At the end, the full leaderboard shows rankings

**Scoring:**
- Correct answer = 100 base points + (seconds remaining × 10 bonus points)
- Wrong answer = 0 points

### Step 4: Playing Drag & Drop

1. When the teacher starts this activity, tap **Open Activity**
2. Drag items from the left column to their match on the right
3. Correct matches lock in place with a green checkmark
4. Wrong matches flash red — try again!
5. When all matched, click **Submit to Teacher**

> On mobile/tablet, use touch to drag items.

### Step 5: Drawing

1. When the teacher starts this activity, tap **Open Activity**
2. Pick a color from the toolbar
3. Pick a brush size (S, M, L, XL)
4. Draw on the white canvas using mouse or finger
5. Use **Clear** to start over
6. Click **Submit** to send your drawing to the teacher

---

## 6. Content Manager

Access: `https://lms.sandkloudlabs.com/admin.html` (requires teacher PIN)

### Managing Quizzes

**View all quizzes:** Open the Content Manager — quizzes are shown under the "Quizzes" tab.

**Create a new quiz:**

1. Click **+ New Quiz**
2. Fill in:
   - **Quiz ID** — lowercase, no spaces (e.g. `animals`, `history_101`)
   - **Quiz Title** — display name (e.g. "Animal Kingdom")
   - **Emoji** — click to pick an icon
3. Add questions:
   - Type the question text
   - Fill in all 4 options
   - Click the **checkmark (✓)** next to the correct answer
   - Set the timer (seconds per question, default 15)
4. Click **Save Quiz**

**Edit an existing quiz:** Click the quiz row or the **Edit** button.

**Delete a quiz:** Click the **trash icon** and confirm.

### Managing Drag & Drop Puzzles

Switch to the **"Drag & Drop"** tab.

**Create a new puzzle:**

1. Click **+ New Puzzle**
2. Fill in:
   - **Puzzle Title** (e.g. "Fruits & Colors")
   - **Emoji**
3. Add pairs:
   - **Left field** = the draggable item (e.g. `🍎 Apple`)
   - **Right field** = the drop target (e.g. `Red`)
4. Add at least 2 pairs
5. Click **Save Puzzle**

**Edit/Delete:** Same as quizzes — click the row or use the buttons.

### Important Notes

- Changes save instantly to disk — no server restart needed
- The next quiz or activity run will use the updated content
- A random puzzle is selected each time a student opens drag & drop

---

## 7. Activity Types

### Quiz (Kahoot-style)

| Feature | Detail |
|---------|--------|
| Question format | Multiple choice (4 options) |
| Timer | Configurable per question (5–120 seconds) |
| Scoring | 100 base + (time remaining × 10) |
| Leaderboard | Updates live after each question |
| Teacher control | Teacher advances questions manually |

### Drag & Drop

| Feature | Detail |
|---------|--------|
| Format | Match items to targets |
| Input | Drag (mouse) or touch (mobile) |
| Feedback | Green = correct, red flash = wrong |
| Scoring | Count of correct matches |
| Puzzles | Random selection from available puzzles |

### Drawing Canvas

| Feature | Detail |
|---------|--------|
| Colors | 8 colors (black, red, blue, green, yellow, purple, pink, white/eraser) |
| Brush sizes | S (3px), M (6px), L (12px), XL (24px) |
| Canvas size | 800×500px (responsive) |
| Input | Mouse and touch supported |
| Submit | Sends PNG image to teacher |

---

## 8. Server Management

### File Structure on the Server

```
~/edu-platform/
├── server.js              # Main application
├── package.json           # Dependencies
├── data/
│   ├── quizzes.json       # Quiz content (editable)
│   └── puzzles.json       # Drag & drop content (editable)
└── public/
    ├── index.html          # Landing page
    ├── teacher.html        # Teacher dashboard
    ├── student.html        # Student page
    ├── admin.html          # Content manager
    ├── style.css           # Shared styles
    └── game/
        ├── dragdrop.html   # Drag & drop game
        └── draw.html       # Drawing canvas
```

### Starting the Server

```bash
cd ~/edu-platform
node server.js
```

With custom PIN and port:

```bash
TEACHER_PIN=mySecret PORT=8080 node server.js
```

### Running in Background

```bash
nohup node server.js > /tmp/edu-platform.log 2>&1 &
```

### Stopping the Server

```bash
pkill -f 'node server'
```

### Checking if Running

```bash
pgrep -a 'node server'
```

### Making it Survive Reboots (systemd)

Create `/etc/systemd/system/eduplay.service`:

```ini
[Unit]
Description=EduPlay Learning Platform
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/edu-platform
Environment=TEACHER_PIN=1234
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable eduplay
sudo systemctl start eduplay
```

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Session not found" when student joins | Check the code is correct (6 characters, case-insensitive). Ensure the teacher has created a session. |
| "Nickname already taken" | Another student already used that name. Pick a different one. |
| Students don't see the activity | Students must be on the waiting screen when the teacher starts. If they refreshed, they need to rejoin. |
| Quiz doesn't show new questions | Content is loaded fresh each time. Clear browser cache if stale. |
| Server won't start | Check if port 3000 is already in use: `lsof -i :3000`. Kill the old process first. |
| Drawing doesn't work on mobile | Ensure the browser is up to date. Drawing uses touch events which require a modern browser. |
| Admin changes not appearing | Changes save to JSON files instantly. If quiz is already running, it uses the version loaded at start. New sessions will pick up changes. |
| Forgot the PIN | Check or set it: `TEACHER_PIN=newpin node server.js`. Default is `1234`. |

---

*EduPlay — Making learning fun, one session at a time.*
