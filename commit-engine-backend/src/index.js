require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { migrate } = require('./migrate');

const authRoutes = require('./routes/auth');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const competitionRoutes = require('./routes/competitions');
const teamRoutes = require('./routes/teams');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: false
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/friends', friendRoutes);
app.use('/messages', messageRoutes);
app.use('/competitions', competitionRoutes);
app.use('/teams', teamRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`commit-engine-backend listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to run migrations, exiting', err);
    process.exit(1);
  });
