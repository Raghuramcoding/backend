const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it before deploying — tokens are unsigned/insecure without it.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, SECRET || 'dev_only_insecure_secret', {
    expiresIn: '30d'
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, SECRET || 'dev_only_insecure_secret');
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, requireAuth };
