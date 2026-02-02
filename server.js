require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Google OAuth config (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET in env)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'frc-scouting-secret-change-in-production';
// Comma-separated list of Google emails that are initial admins (optional; can also add via UI)
const INITIAL_ADMIN_EMAILS = (process.env.ALLOWED_EDIT_EMAILS || process.env.INITIAL_ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session (must be before passport)
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, { id: profile.id, displayName: profile.displayName, email: profile.emails?.[0]?.value });
  }));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Load field configuration
let scoutingConfig = {};
try {
  const configData = fs.readFileSync(path.join(__dirname, 'scouting-config.json'), 'utf8');
  scoutingConfig = JSON.parse(configData);
  console.log('Loaded scouting types:', Object.keys(scoutingConfig.scoutingTypes || {}));
} catch (error) {
  console.error('Error loading scouting-config.json:', error);
  process.exit(1);
}

// Initialize database
const db = new sqlite3.Database('scouting.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function getTableColumns(tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => r.name));
    });
  });
}

// Users table for role-based permissions (admin = full; upload = submit/upload only)
function ensureUsersTable(callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'upload')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) return callback(err);
    const stmt = db.prepare('INSERT OR IGNORE INTO users (email, role) VALUES (?, ?)');
    INITIAL_ADMIN_EMAILS.forEach(email => stmt.run(email, 'admin'));
    stmt.finalize();
    callback();
  });
}

// Create tables based on scouting type configurations
async function initializeDatabase() {
  await new Promise((resolve, reject) => {
    ensureUsersTable(err => (err ? reject(err) : resolve()));
  });
  const scoutingTypes = scoutingConfig.scoutingTypes || {};

  for (const typeKey of Object.keys(scoutingTypes)) {
    const typeConfig = scoutingTypes[typeKey];
    const fields = typeConfig.fields || [];
    const tableName = typeConfig.tableName || `${typeKey}_data`;

    const baseColumns = [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'timestamp DATETIME DEFAULT CURRENT_TIMESTAMP'
    ];

    // 1. Create table if missing
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS ${tableName} (${baseColumns.join(', ')})`,
        err => (err ? reject(err) : resolve())
      );
    });

    // 2. Get existing columns
    const existingColumns = await getTableColumns(tableName);

    // 3. Add missing columns
    for (const field of fields) {
      if (existingColumns.includes(field.id)) continue;

      let columnType = 'TEXT';
      if (field.type === 'number') columnType = 'REAL';
      if (field.type === 'checkbox') columnType = 'INTEGER';

      const alterSQL = `
        ALTER TABLE ${tableName}
        ADD COLUMN ${field.id} ${columnType}
      `;

      await new Promise((resolve, reject) => {
        db.run(alterSQL, err => {
          if (err) {
            console.error(`Failed adding column ${field.id}`, err);
            reject(err);
          } else {
            console.log(`Added column ${field.id} to ${tableName}`);
            resolve();
          }
        });
      });
    }
  }
}

// Get user role from database
function getUserRole(email, callback) {
  if (!email) return callback(null, null);
  db.get('SELECT role FROM users WHERE email = ?', [email.toLowerCase().trim()], (err, row) => {
    if (err) return callback(err, null);
    callback(null, row ? row.role : null);
  });
}

// Auth middleware: require logged-in user
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Sign in with Google to continue.' });
}

// Require admin role (full access: edit, delete, user management)
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Sign in with Google to continue.' });
  }
  getUserRole(req.user.email, (err, role) => {
    if (err) return res.status(500).json({ error: 'Failed to check permissions.' });
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

// Require upload or admin (for submit and file upload)
function requireUploadOrAdmin(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Sign in with Google to submit or upload.' });
  }
  getUserRole(req.user.email, (err, role) => {
    if (err) return res.status(500).json({ error: 'Failed to check permissions.' });
    if (role !== 'admin' && role !== 'upload') {
      return res.status(403).json({ error: 'You do not have permission to submit or upload. Ask an admin to grant you access.' });
    }
    next();
  });
}

// Auth routes
app.get('/auth/google', (req, res, next) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
  }
  const returnTo = req.query.returnTo || '/?view=data&type=prematch';
  req.session.returnTo = returnTo;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/?view=data&type=prematch';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated || !req.user) {
    return res.status(401).json({ authenticated: false });
  }
  getUserRole(req.user.email, (err, role) => {
    if (err) return res.status(500).json({ error: 'Failed to check permissions.' });
    const canUpload = role === 'admin' || role === 'upload';
    const canEdit = role === 'admin';
    const canManageUsers = role === 'admin';
    res.json({
      user: req.user,
      role: role || null,
      canUpload,
      canEdit,
      canManageUsers
    });
  });
});

app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
});

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    scoutingTypes: Object.keys(scoutingConfig.scoutingTypes || {}).length 
  });
});

// Get all scouting types configuration
app.get('/api/scouting-types', (req, res) => {
  try {
    const types = {};
    if (!scoutingConfig.scoutingTypes) {
      console.error('scoutingConfig.scoutingTypes is undefined');
      return res.status(500).json({ error: 'Scouting types not configured' });
    }
    
    Object.keys(scoutingConfig.scoutingTypes).forEach(key => {
      types[key] = {
        name: scoutingConfig.scoutingTypes[key].name,
        description: scoutingConfig.scoutingTypes[key].description
      };
    });
    
    console.log('Returning scouting types:', Object.keys(types));
    res.json({ scoutingTypes: types });
  } catch (error) {
    console.error('Error in /api/scouting-types:', error);
    res.status(500).json({ error: 'Failed to load scouting types' });
  }
});

// Get field configuration for a specific scouting type
app.get('/api/fields/:type', (req, res) => {
  const type = req.params.type;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  
  res.json({
    name: typeConfig.name,
    description: typeConfig.description,
    fields: typeConfig.fields || []
  });
});

// Upload file (for robot pictures) — requires sign-in with upload or admin role
app.post('/api/upload', requireAuth, requireUploadOrAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    success: true,
    filePath: `/uploads/${req.file.filename}`,
    filename: req.file.filename
  });
});

// Submit scouting data — requires sign-in with upload or admin role
app.post('/api/submit/:type', requireAuth, requireUploadOrAdmin, (req, res) => {
  const type = req.params.type;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  
  const data = req.body;
  const fields = typeConfig.fields || [];
  const tableName = typeConfig.tableName;
  
  // Validate required fields
  const missingFields = fields
    .filter(f => f.required && f.type !== 'file' && !data[f.id])
    .map(f => f.label);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields
    });
  }
  
  // Build insert query
  const fieldIds = fields.map(f => f.id);
  const placeholders = fieldIds.map(() => '?').join(', ');
  const values = fieldIds.map(id => data[id] || null);
  
  const insertSQL = `
    INSERT INTO ${tableName} (${fieldIds.join(', ')})
    VALUES (${placeholders})
  `;
  
  db.run(insertSQL, values, function(err) {
    if (err) {
      console.error('Error inserting data:', err);
      return res.status(500).json({ error: 'Failed to save data' });
    }
    
    res.json({
      success: true,
      id: this.lastID,
      message: 'Scouting data saved successfully'
    });
  });
});

// Get all scouting data for a specific type
app.get('/api/data/:type', (req, res) => {
  const type = req.params.type;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  
  const tableName = typeConfig.tableName;
  const sortBy = req.query.sortBy || 'timestamp';
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  // Validate sort column
  const validSortFields = ['timestamp', 'id', ...typeConfig.fields.map(f => f.id)];
  const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'timestamp';
  
  db.all(`SELECT * FROM ${tableName} ORDER BY ${safeSortBy} ${sortOrder}`, (err, rows) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }
    res.json(rows);
  });
});

// Get single entry by ID
app.get('/api/data/:type/:id', (req, res) => {
  const type = req.params.type;
  const id = req.params.id;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  
  const tableName = typeConfig.tableName;
  db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id], (err, row) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json(row);
  });
});

// Update entry by ID (admin only)
app.put('/api/data/:type/:id', requireAuth, requireAdmin, (req, res) => {
  const type = req.params.type;
  const id = req.params.id;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  const data = req.body;
  const fields = typeConfig.fields || [];
  const tableName = typeConfig.tableName;
  const fieldIds = fields.map(f => f.id);
  const setClause = fieldIds.map(f => `${f} = ?`).join(', ');
  const values = fieldIds.map(fid => data[fid] != null ? data[fid] : null);
  values.push(id);
  db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, values, function(err) {
    if (err) {
      console.error('Error updating data:', err);
      return res.status(500).json({ error: 'Failed to update data' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ success: true, message: 'Entry updated successfully' });
  });
});

// Delete entry by ID (admin only)
app.delete('/api/data/:type/:id', requireAuth, requireAdmin, (req, res) => {
  const type = req.params.type;
  const id = req.params.id;
  const typeConfig = scoutingConfig.scoutingTypes[type];
  
  if (!typeConfig) {
    return res.status(404).json({ error: 'Scouting type not found' });
  }
  
  const tableName = typeConfig.tableName;
  
  // Get file path if it exists before deleting
  db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch entry' });
    }
    
    if (row && row.robotPicture) {
      const filePath = path.join(__dirname, row.robotPicture);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    db.run(`DELETE FROM ${tableName} WHERE id = ?`, [id], function(err) {
      if (err) {
        console.error('Error deleting data:', err);
        return res.status(500).json({ error: 'Failed to delete data' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      res.json({ success: true, message: 'Entry deleted successfully' });
    });
  });
});

// ——— User management (admin only) ———
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  db.all('SELECT id, email, role, created_at FROM users ORDER BY email', [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    res.json({ users: rows });
  });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { email, role } = req.body || {};
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (role !== 'admin' && role !== 'upload') {
    return res.status(400).json({ error: 'Role must be "admin" or "upload"' });
  }
  db.run('INSERT INTO users (email, role) VALUES (?, ?)', [normalizedEmail, role], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      return res.status(500).json({ error: 'Failed to add user' });
    }
    res.status(201).json({ success: true, id: this.lastID, email: normalizedEmail, role });
  });
});

app.put('/api/users/:email', requireAuth, requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email || '').trim().toLowerCase();
  const { role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (role !== 'admin' && role !== 'upload') {
    return res.status(400).json({ error: 'Role must be "admin" or "upload"' });
  }
  db.run('UPDATE users SET role = ? WHERE email = ?', [role, email], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to update user' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, email, role });
  });
});

app.delete('/api/users/:email', requireAuth, requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });
  db.run('DELETE FROM users WHERE email = ?', [email], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to remove user' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  });
});

// Get local IP address
const os = require('os');
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Get public IP (for port forwarding setup)
function getPublicIP(callback) {
  const https = require('https');
  https.get('https://api.ipify.org?format=json', { timeout: 3000 }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        callback(json.ip);
      } catch (e) {
        callback(null);
      }
    });
  }).on('error', () => {
    callback(null);
  });
}

// Start server
const HOST = '0.0.0.0'; // Listen on all network interfaces
app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log(`FRC Scouting Server running!`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://${localIP}:${PORT}`);
  
  // Try to get public IP for port forwarding info
  getPublicIP((publicIP) => {
    if (publicIP) {
      console.log(`\nFor external access (after port forwarding):`);
      console.log(`Public IP: http://${publicIP}:${PORT}`);
      console.log(`Run 'npm run setup-port-forward' for setup instructions\n`);
    }
  });
  
  console.log(`Open http://localhost:${PORT} in your browser`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});

