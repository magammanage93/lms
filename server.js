const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory store ──
const sessions = {};       // { code: { teacher, students, quiz, activity, ... } }
const submissions = {};    // { code: [ { student, type, data, ts } ] }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return sessions[code] ? genCode() : code;
}

// ── REST endpoints ──

app.post('/api/session/create', (req, res) => {
  const code = genCode();
  sessions[code] = {
    code,
    teacherSocket: null,
    students: {},           // { socketId: { nickname, score } }
    quiz: null,             // { questions:[], currentQ: 0, active: false, timer: null }
    activity: null,         // { type: 'dragdrop'|'draw', active: false }
    state: 'lobby',         // lobby | quiz | activity | review
    createdAt: Date.now()
  };
  submissions[code] = [];
  res.json({ code });
});

app.get('/api/session/:code', (req, res) => {
  const s = sessions[req.params.code.toUpperCase()];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json({
    code: s.code,
    state: s.state,
    studentCount: Object.keys(s.students).length,
    students: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score }))
  });
});

app.get('/api/session/:code/submissions', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!sessions[code]) return res.status(404).json({ error: 'Session not found' });
  res.json(submissions[code] || []);
});

// ── Data loading (reads from data/*.json on every request — edit files, changes apply instantly) ──

function loadQuizzes() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quizzes.json'), 'utf8'));
}

function loadPuzzles() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'puzzles.json'), 'utf8'));
}

app.get('/api/quizzes', (_req, res) => {
  const quizzes = loadQuizzes();
  const list = Object.entries(quizzes).map(([key, q]) => ({
    id: key, title: q.title, emoji: q.emoji || '📝', questionCount: q.questions.length
  }));
  res.json(list);
});

app.get('/api/puzzles', (_req, res) => {
  res.json(loadPuzzles());
});

// ── Teacher auth ──

const TEACHER_PIN = process.env.TEACHER_PIN || '1234';

app.post('/api/auth/teacher', (req, res) => {
  const { pin } = req.body;
  if (pin === TEACHER_PIN) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong PIN' });
  }
});

// ── Admin CRUD endpoints ──

function saveQuizzes(data) {
  fs.writeFileSync(path.join(DATA_DIR, 'quizzes.json'), JSON.stringify(data, null, 2), 'utf8');
}

function savePuzzles(data) {
  fs.writeFileSync(path.join(DATA_DIR, 'puzzles.json'), JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/admin/quizzes', (_req, res) => {
  res.json(loadQuizzes());
});

app.put('/api/admin/quizzes/:id', (req, res) => {
  const quizzes = loadQuizzes();
  const id = req.params.id;
  const { title, emoji, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions)) {
    return res.status(400).json({ error: 'title and questions[] are required' });
  }
  quizzes[id] = { title, emoji: emoji || '📝', questions };
  saveQuizzes(quizzes);
  res.json({ ok: true, id });
});

app.delete('/api/admin/quizzes/:id', (req, res) => {
  const quizzes = loadQuizzes();
  const id = req.params.id;
  if (!quizzes[id]) return res.status(404).json({ error: 'Quiz not found' });
  delete quizzes[id];
  saveQuizzes(quizzes);
  res.json({ ok: true });
});

app.get('/api/admin/puzzles', (_req, res) => {
  res.json(loadPuzzles());
});

app.put('/api/admin/puzzles/:index', (req, res) => {
  const puzzles = loadPuzzles();
  const idx = parseInt(req.params.index);
  const { title, emoji, pairs } = req.body;
  if (!title || !pairs || !Array.isArray(pairs)) {
    return res.status(400).json({ error: 'title and pairs[] are required' });
  }
  const puzzle = { title, emoji: emoji || '🧩', pairs };
  if (idx >= 0 && idx < puzzles.length) {
    puzzles[idx] = puzzle;
  } else {
    puzzles.push(puzzle);
  }
  savePuzzles(puzzles);
  res.json({ ok: true, index: idx >= 0 && idx < puzzles.length ? idx : puzzles.length - 1 });
});

app.delete('/api/admin/puzzles/:index', (req, res) => {
  const puzzles = loadPuzzles();
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= puzzles.length) return res.status(404).json({ error: 'Puzzle not found' });
  puzzles.splice(idx, 1);
  savePuzzles(puzzles);
  res.json({ ok: true });
});

// ── Socket.io real-time ──

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Teacher joins session
  socket.on('teacher-join', (code) => {
    const s = sessions[code];
    if (!s) return socket.emit('error-msg', 'Session not found');
    s.teacherSocket = socket.id;
    socket.join(`session-${code}`);
    socket.join(`teacher-${code}`);
    socket.emit('session-joined', { code, students: Object.values(s.students) });
    console.log(`[teacher-join] ${code}`);
  });

  // Student joins session
  socket.on('student-join', ({ code, nickname }) => {
    const s = sessions[code];
    if (!s) return socket.emit('error-msg', 'Session not found');
    if (s.state !== 'lobby' && s.state !== 'quiz' && s.state !== 'activity') {
      return socket.emit('error-msg', 'Session is not accepting students');
    }
    const existing = Object.values(s.students).find(st => st.nickname === nickname);
    if (existing) return socket.emit('error-msg', 'Nickname already taken');

    s.students[socket.id] = { nickname, score: 0, answers: [] };
    socket.join(`session-${code}`);
    socket.studentCode = code;
    socket.studentNick = nickname;

    socket.emit('join-success', { code, nickname, state: s.state });
    io.to(`teacher-${code}`).emit('student-joined', {
      nickname,
      students: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score }))
    });
    console.log(`[student-join] ${nickname} → ${code}`);
  });

  // Teacher starts quiz
  socket.on('start-quiz', ({ code, quizId }) => {
    const s = sessions[code];
    if (!s) return;
    const quizData = loadQuizzes()[quizId];
    if (!quizData) return socket.emit('error-msg', 'Quiz not found');

    s.quiz = { ...quizData, currentQ: -1, active: true, answeredThisQ: new Set() };
    s.state = 'quiz';
    Object.values(s.students).forEach(st => { st.score = 0; st.answers = []; });
    io.to(`session-${code}`).emit('quiz-started', { title: quizData.title, total: quizData.questions.length });
    console.log(`[quiz-start] ${code} → ${quizId}`);
  });

  // Teacher advances to next question
  socket.on('next-question', (code) => {
    const s = sessions[code];
    if (!s || !s.quiz) return;

    s.quiz.currentQ++;
    s.quiz.answeredThisQ = new Set();
    const idx = s.quiz.currentQ;

    if (idx >= s.quiz.questions.length) {
      s.state = 'review';
      s.quiz.active = false;
      const leaderboard = Object.values(s.students)
        .map(st => ({ nickname: st.nickname, score: st.score }))
        .sort((a, b) => b.score - a.score);
      io.to(`session-${code}`).emit('quiz-ended', { leaderboard });
      return;
    }

    const question = s.quiz.questions[idx];
    const payload = { index: idx, q: question.q, options: question.options, time: question.time, total: s.quiz.questions.length };
    io.to(`session-${code}`).emit('question', payload);

    if (s.quiz.timer) clearTimeout(s.quiz.timer);
    s.quiz.timer = setTimeout(() => {
      const leaderboard = Object.values(s.students)
        .map(st => ({ nickname: st.nickname, score: st.score }))
        .sort((a, b) => b.score - a.score);
      io.to(`session-${code}`).emit('question-timeout', {
        correctAnswer: question.answer,
        leaderboard
      });
    }, question.time * 1000);
  });

  // Student submits answer
  socket.on('submit-answer', ({ code, questionIndex, answerIndex, timeLeft }) => {
    const s = sessions[code];
    if (!s || !s.quiz || !s.quiz.active) return;
    if (s.quiz.currentQ !== questionIndex) return;
    if (s.quiz.answeredThisQ.has(socket.id)) return;

    s.quiz.answeredThisQ.add(socket.id);
    const student = s.students[socket.id];
    if (!student) return;

    const question = s.quiz.questions[questionIndex];
    const correct = answerIndex === question.answer;
    const points = correct ? 100 + (timeLeft * 10) : 0;
    if (correct) student.score += points;

    student.answers.push({ questionIndex, answerIndex, correct, points });

    socket.emit('answer-result', { correct, points, totalScore: student.score, correctAnswer: question.answer });

    submissions[code].push({
      student: student.nickname, type: 'quiz',
      data: { questionIndex, q: question.q, answerIndex, correct, points }, ts: Date.now()
    });

    const totalStudents = Object.keys(s.students).length;
    const answered = s.quiz.answeredThisQ.size;
    io.to(`teacher-${code}`).emit('answer-received', {
      nickname: student.nickname, correct, answered, totalStudents,
      leaderboard: Object.values(s.students)
        .map(st => ({ nickname: st.nickname, score: st.score }))
        .sort((a, b) => b.score - a.score)
    });

    if (answered >= totalStudents) {
      if (s.quiz.timer) clearTimeout(s.quiz.timer);
      const leaderboard = Object.values(s.students)
        .map(st => ({ nickname: st.nickname, score: st.score }))
        .sort((a, b) => b.score - a.score);
      io.to(`session-${code}`).emit('all-answered', {
        correctAnswer: question.answer, leaderboard
      });
    }
  });

  // Teacher starts activity
  socket.on('start-activity', ({ code, type }) => {
    const s = sessions[code];
    if (!s) return;
    s.activity = { type, active: true };
    s.state = 'activity';
    io.to(`session-${code}`).emit('activity-started', { type });
    console.log(`[activity-start] ${code} → ${type}`);
  });

  // Student submits activity result
  socket.on('submit-activity', ({ code, type, data }) => {
    const s = sessions[code];
    if (!s) return;
    const student = s.students[socket.id];
    if (!student) return;

    submissions[code].push({ student: student.nickname, type, data, ts: Date.now() });
    socket.emit('activity-submitted');
    io.to(`teacher-${code}`).emit('activity-submission', {
      nickname: student.nickname, type, data,
      totalSubmissions: submissions[code].filter(sub => sub.type === type).length
    });
    console.log(`[activity-submit] ${student.nickname} → ${type}`);
  });

  // Teacher ends activity
  socket.on('end-activity', (code) => {
    const s = sessions[code];
    if (!s) return;
    s.state = 'lobby';
    s.activity = null;
    io.to(`session-${code}`).emit('activity-ended');
  });

  // Teacher returns to lobby
  socket.on('back-to-lobby', (code) => {
    const s = sessions[code];
    if (!s) return;
    s.state = 'lobby';
    s.quiz = null;
    s.activity = null;
    io.to(`session-${code}`).emit('back-to-lobby');
  });

  // Teacher ends entire session
  socket.on('end-session', (code) => {
    const s = sessions[code];
    if (!s) return;
    if (s.quiz && s.quiz.timer) clearTimeout(s.quiz.timer);
    io.to(`session-${code}`).emit('session-ended');
    // Disconnect all sockets in the session room
    io.in(`session-${code}`).socketsLeave(`session-${code}`);
    io.in(`teacher-${code}`).socketsLeave(`teacher-${code}`);
    delete sessions[code];
    console.log(`[session-end] ${code}`);
  });

  socket.on('disconnect', () => {
    const code = socket.studentCode;
    if (code && sessions[code]) {
      const student = sessions[code].students[socket.id];
      if (student) {
        delete sessions[code].students[socket.id];
        io.to(`teacher-${code}`).emit('student-left', {
          nickname: student.nickname,
          students: Object.values(sessions[code].students).map(st => ({ nickname: st.nickname, score: st.score }))
        });
      }
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`edu-platform running on http://0.0.0.0:${PORT}`);
});
