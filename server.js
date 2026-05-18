const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Type-scoped sessions ──
// Key: "{type}-{code}" e.g. "quiz-ABC123", "draw-XYZ789"
const sessions = {};
const submissions = {};

function genCode(type) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  const key = `${type}-${code}`;
  return sessions[key] ? genCode(type) : code;
}

function skey(type, code) { return `${type}-${code}`; }

// ── Auth ──
const TEACHER_PIN = process.env.TEACHER_PIN || '1234';
app.post('/api/auth/teacher', (req, res) => {
  if (req.body.pin === TEACHER_PIN) return res.json({ ok: true });
  res.status(401).json({ error: 'Wrong PIN' });
});

// ── Data loaders ──
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}
function saveJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
}

// ── Quiz CRUD ──
app.get('/api/quizzes', (_req, res) => {
  const q = loadJSON('quizzes.json');
  res.json(Object.entries(q).map(([id, v]) => ({ id, title: v.title, emoji: v.emoji || '📝', questionCount: v.questions.length })));
});
app.get('/api/admin/quizzes', (_req, res) => res.json(loadJSON('quizzes.json')));
app.put('/api/admin/quizzes/:id', (req, res) => {
  const quizzes = loadJSON('quizzes.json');
  const { title, emoji, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions)) return res.status(400).json({ error: 'title and questions[] required' });
  quizzes[req.params.id] = { title, emoji: emoji || '📝', questions };
  saveJSON('quizzes.json', quizzes);
  res.json({ ok: true });
});
app.delete('/api/admin/quizzes/:id', (req, res) => {
  const quizzes = loadJSON('quizzes.json');
  if (!quizzes[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete quizzes[req.params.id];
  saveJSON('quizzes.json', quizzes);
  res.json({ ok: true });
});

// ── Puzzle CRUD ──
app.get('/api/puzzles', (_req, res) => res.json(loadJSON('puzzles.json')));
app.get('/api/admin/puzzles', (_req, res) => res.json(loadJSON('puzzles.json')));
app.put('/api/admin/puzzles/:index', (req, res) => {
  const puzzles = loadJSON('puzzles.json');
  const idx = parseInt(req.params.index);
  const { title, emoji, pairs } = req.body;
  if (!title || !pairs || !Array.isArray(pairs)) return res.status(400).json({ error: 'title and pairs[] required' });
  const puzzle = { title, emoji: emoji || '🧩', pairs };
  if (idx >= 0 && idx < puzzles.length) puzzles[idx] = puzzle; else puzzles.push(puzzle);
  saveJSON('puzzles.json', puzzles);
  res.json({ ok: true });
});
app.delete('/api/admin/puzzles/:index', (req, res) => {
  const puzzles = loadJSON('puzzles.json');
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= puzzles.length) return res.status(404).json({ error: 'Not found' });
  puzzles.splice(idx, 1);
  saveJSON('puzzles.json', puzzles);
  res.json({ ok: true });
});

// ── Flashcard CRUD ──
app.get('/api/flashcards', (_req, res) => {
  const fc = loadJSON('flashcards.json');
  res.json(Object.entries(fc).map(([id, v]) => ({ id, title: v.title, emoji: v.emoji || '🃏', cardCount: v.cards.length })));
});
app.get('/api/admin/flashcards', (_req, res) => res.json(loadJSON('flashcards.json')));
app.put('/api/admin/flashcards/:id', (req, res) => {
  const decks = loadJSON('flashcards.json');
  const { title, emoji, cards } = req.body;
  if (!title || !cards || !Array.isArray(cards)) return res.status(400).json({ error: 'title and cards[] required' });
  decks[req.params.id] = { title, emoji: emoji || '🃏', cards };
  saveJSON('flashcards.json', decks);
  res.json({ ok: true });
});
app.delete('/api/admin/flashcards/:id', (req, res) => {
  const decks = loadJSON('flashcards.json');
  if (!decks[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete decks[req.params.id];
  saveJSON('flashcards.json', decks);
  res.json({ ok: true });
});

// ── Session endpoints (generic, type-scoped) ──
app.post('/api/session/create', (req, res) => {
  const { type } = req.body;
  if (!['quiz', 'dragdrop', 'draw', 'flashcard'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const code = genCode(type);
  const key = skey(type, code);
  sessions[key] = {
    type, code, teacherSocket: null,
    students: {}, quiz: null, activity: null, flashcard: null,
    state: 'lobby', createdAt: Date.now()
  };
  submissions[key] = [];
  res.json({ code, type });
});

app.get('/api/session/:type/:code', (req, res) => {
  const s = sessions[skey(req.params.type, req.params.code.toUpperCase())];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json({
    code: s.code, type: s.type, state: s.state,
    studentCount: Object.keys(s.students).length,
    students: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score }))
  });
});

app.get('/api/session/:type/:code/submissions', (req, res) => {
  const key = skey(req.params.type, req.params.code.toUpperCase());
  if (!sessions[key]) return res.status(404).json({ error: 'Session not found' });
  res.json(submissions[key] || []);
});

// ── Socket.io ──
io.on('connection', (socket) => {
  // Teacher joins
  socket.on('teacher-join', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s) return socket.emit('error-msg', 'Session not found');
    s.teacherSocket = socket.id;
    socket.join(`session-${type}-${code}`);
    socket.join(`teacher-${type}-${code}`);
    socket.emit('session-joined', { code, type, students: Object.values(s.students) });
  });

  // Student joins
  socket.on('student-join', ({ type, code, nickname }) => {
    const key = skey(type, code);
    const s = sessions[key];
    if (!s) return socket.emit('error-msg', 'Session not found');
    const existing = Object.values(s.students).find(st => st.nickname === nickname);
    if (existing) return socket.emit('error-msg', 'Nickname already taken');

    s.students[socket.id] = { nickname, score: 0, answers: [] };
    socket.join(`session-${type}-${code}`);
    socket.sessionKey = key;
    socket.sessionType = type;
    socket.sessionCode = code;
    socket.studentNick = nickname;

    socket.emit('join-success', { code, type, nickname, state: s.state });
    io.to(`teacher-${type}-${code}`).emit('student-joined', {
      nickname,
      students: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score }))
    });
  });

  // ── QUIZ events ──
  socket.on('start-quiz', ({ type, code, quizId }) => {
    const s = sessions[skey(type, code)];
    if (!s) return;
    const quizData = loadJSON('quizzes.json')[quizId];
    if (!quizData) return socket.emit('error-msg', 'Quiz not found');
    s.quiz = { ...quizData, currentQ: -1, active: true, answeredThisQ: new Set() };
    s.state = 'quiz';
    Object.values(s.students).forEach(st => { st.score = 0; st.answers = []; });
    io.to(`session-${type}-${code}`).emit('quiz-started', { title: quizData.title, total: quizData.questions.length });
  });

  socket.on('next-question', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s || !s.quiz) return;
    s.quiz.currentQ++;
    s.quiz.answeredThisQ = new Set();
    const idx = s.quiz.currentQ;
    if (idx >= s.quiz.questions.length) {
      s.state = 'review'; s.quiz.active = false;
      const lb = Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score })).sort((a, b) => b.score - a.score);
      io.to(`session-${type}-${code}`).emit('quiz-ended', { leaderboard: lb });
      return;
    }
    const question = s.quiz.questions[idx];
    io.to(`session-${type}-${code}`).emit('question', { index: idx, q: question.q, options: question.options, time: question.time, total: s.quiz.questions.length });
    if (s.quiz.timer) clearTimeout(s.quiz.timer);
    s.quiz.timer = setTimeout(() => {
      const lb = Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score })).sort((a, b) => b.score - a.score);
      io.to(`session-${type}-${code}`).emit('question-timeout', { correctAnswer: question.answer, leaderboard: lb });
    }, question.time * 1000);
  });

  socket.on('submit-answer', ({ type, code, questionIndex, answerIndex, timeLeft }) => {
    const key = skey(type, code);
    const s = sessions[key];
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
    submissions[key].push({ student: student.nickname, type: 'quiz', data: { questionIndex, q: question.q, answerIndex, correct, points }, ts: Date.now() });
    const totalStudents = Object.keys(s.students).length;
    const answered = s.quiz.answeredThisQ.size;
    io.to(`teacher-${type}-${code}`).emit('answer-received', {
      nickname: student.nickname, correct, answered, totalStudents,
      leaderboard: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score })).sort((a, b) => b.score - a.score)
    });
    if (answered >= totalStudents) {
      if (s.quiz.timer) clearTimeout(s.quiz.timer);
      const lb = Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score })).sort((a, b) => b.score - a.score);
      io.to(`session-${type}-${code}`).emit('all-answered', { correctAnswer: question.answer, leaderboard: lb });
    }
  });

  // ── ACTIVITY events (dragdrop, draw) ──
  socket.on('start-activity', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s) return;
    s.state = 'activity';
    io.to(`session-${type}-${code}`).emit('activity-started');
  });

  socket.on('submit-activity', ({ type, code, activityType, data }) => {
    const key = skey(type, code);
    const s = sessions[key];
    if (!s) return;
    const student = s.students[socket.id];
    if (!student) return;
    submissions[key].push({ student: student.nickname, type: activityType || type, data, ts: Date.now() });
    socket.emit('activity-submitted');
    io.to(`teacher-${type}-${code}`).emit('activity-submission', {
      nickname: student.nickname, type: activityType || type, data,
      totalSubmissions: submissions[key].length
    });
  });

  socket.on('end-activity', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s) return;
    s.state = 'lobby';
    io.to(`session-${type}-${code}`).emit('activity-ended');
  });

  // ── FLASHCARD events ──
  socket.on('start-flashcard', ({ type, code, deckId }) => {
    const s = sessions[skey(type, code)];
    if (!s) return;
    const deck = loadJSON('flashcards.json')[deckId];
    if (!deck) return socket.emit('error-msg', 'Deck not found');
    s.flashcard = { ...deck, currentCard: -1 };
    s.state = 'flashcard';
    io.to(`session-${type}-${code}`).emit('flashcard-started', { title: deck.title, total: deck.cards.length });
  });

  socket.on('flashcard-navigate', ({ type, code, cardIndex, showBack }) => {
    const s = sessions[skey(type, code)];
    if (!s || !s.flashcard) return;
    s.flashcard.currentCard = cardIndex;
    const card = s.flashcard.cards[cardIndex];
    if (!card) return;
    io.to(`session-${type}-${code}`).emit('flashcard-update', {
      index: cardIndex, front: card.front, back: showBack ? card.back : null,
      total: s.flashcard.cards.length, showBack
    });
  });

  socket.on('flashcard-flip', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s || !s.flashcard) return;
    const idx = s.flashcard.currentCard;
    const card = s.flashcard.cards[idx];
    if (!card) return;
    io.to(`session-${type}-${code}`).emit('flashcard-update', {
      index: idx, front: card.front, back: card.back,
      total: s.flashcard.cards.length, showBack: true
    });
  });

  // ── Common events ──
  socket.on('back-to-lobby', ({ type, code }) => {
    const s = sessions[skey(type, code)];
    if (!s) return;
    s.state = 'lobby'; s.quiz = null; s.flashcard = null;
    io.to(`session-${type}-${code}`).emit('back-to-lobby');
  });

  socket.on('end-session', ({ type, code }) => {
    const key = skey(type, code);
    const s = sessions[key];
    if (!s) return;
    if (s.quiz && s.quiz.timer) clearTimeout(s.quiz.timer);
    io.to(`session-${type}-${code}`).emit('session-ended');
    io.in(`session-${type}-${code}`).socketsLeave(`session-${type}-${code}`);
    io.in(`teacher-${type}-${code}`).socketsLeave(`teacher-${type}-${code}`);
    delete sessions[key];
  });

  socket.on('disconnect', () => {
    const key = socket.sessionKey;
    if (key && sessions[key]) {
      const student = sessions[key].students[socket.id];
      if (student) {
        delete sessions[key].students[socket.id];
        const s = sessions[key];
        io.to(`teacher-${s.type}-${s.code}`).emit('student-left', {
          nickname: student.nickname,
          students: Object.values(s.students).map(st => ({ nickname: st.nickname, score: st.score }))
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`edu-platform running on http://0.0.0.0:${PORT}`));
