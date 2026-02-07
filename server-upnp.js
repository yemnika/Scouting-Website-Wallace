// Server with automatic UPnP port forwarding
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { openDatabase } = require('./lib/sqlite-wrapper');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const natUpnp = require('nat-upnp');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

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

// Database (set after openDatabase callback)
let db;

// Create tables based on scouting type configurations
function initializeDatabase() {
  const scoutingTypes = scoutingConfig.scoutingTypes || {};
  const promises = Object.keys(scoutingTypes).map(typeKey => {
    const typeConfig = scoutingTypes[typeKey];
    const fields = typeConfig.fields || [];
    const tableName = typeConfig.tableName || `${typeKey}_data`;
    
    const columns = [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'timestamp DATETIME DEFAULT CURRENT_TIMESTAMP'
    ];
    
    fields.forEach(field => {
      let columnType = 'TEXT';
      if (field.type === 'number') columnType = 'REAL';
      else if (field.type === 'checkbox') columnType = 'INTEGER';
      else if (field.type === 'file') columnType = 'TEXT';
      columns.push(`${field.id} ${columnType}`);
    });
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columns.join(',\n        ')}
      )
    `;
    
    return new Promise((resolve, reject) => {
      db.run(createTableSQL, (err) => {
        if (err) {
          console.error(`Error creating table ${tableName}:`, err);
          reject(err);
        } else {
          console.log(`Database table ${tableName} initialized`);
          resolve();
        }
      });
    });
  });
  return Promise.all(promises);
}

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

// Upload file (for robot pictures)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    filePath: `/uploads/${req.file.filename}`,
    filename: req.file.filename
  });
});

// Submit scouting data
app.post('/api/submit/:type', (req, res) => {
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

// Delete entry by ID
app.delete('/api/data/:type/:id', (req, res) => {
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

// UPnP Port Mapping
let upnpClient = null;
let portMapping = null;

function setupUPnP() {
  try {
    upnpClient = natUpnp.createClient();
    
    upnpClient.getMappings((err, mappings) => {
      if (err) {
        console.log('⚠️  UPnP not available or router doesn\'t support it');
        console.log('   You can still use local network access');
        return;
      }
      
      // Remove any existing mapping for port 3000
      upnpClient.removeMapping({ public: PORT, private: PORT }, (err) => {
        if (err) {
          console.log('Note: Could not remove existing mapping (may not exist)');
        }
      });
      
      // Add new mapping
      upnpClient.externalIp((err, ip) => {
        if (err) {
          console.log('⚠️  Could not get external IP via UPnP');
          return;
        }
        
        upnpClient.addMapping({ public: PORT, private: PORT, ttl: 0 }, (err) => {
          if (err) {
            console.log('⚠️  UPnP port mapping failed:', err.message);
            console.log('   Your router may not support UPnP or it may be disabled');
            console.log('   You can still use local network access');
          } else {
            portMapping = { public: PORT, private: PORT };
            console.log(`✅ UPnP port mapping successful!`);
            console.log(`   External access: http://${ip}:${PORT}`);
            console.log(`   Share this URL: http://${ip}:${PORT}`);
          }
        });
      });
    });
  } catch (error) {
    console.log('⚠️  UPnP client creation failed:', error.message);
    console.log('   You can still use local network access');
  }
}

// Open database and start server
const HOST = process.env.HOST || '0.0.0.0';
openDatabase(path.join(__dirname, 'scouting.db'), (err, database) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  db = database;
  console.log('Connected to SQLite database');
  initializeDatabase().then(() => {
    app.listen(PORT, HOST, () => {
      const localIP = getLocalIP();
      console.log(`FRC Scouting Server running!`);
      console.log(`Local access: http://localhost:${PORT}`);
      console.log(`Network access: http://${localIP}:${PORT}`);
      console.log(`\nAttempting automatic port forwarding via UPnP...`);
      setupUPnP();
      getPublicIP((publicIP) => {
        if (publicIP) {
          console.log(`\nYour public IP: ${publicIP}`);
          if (!portMapping) {
            console.log(`If UPnP didn't work, you can manually forward port ${PORT} to ${localIP}:${PORT}`);
          }
        }
      });
      console.log(`\nOpen http://localhost:${PORT} in your browser`);
    });
  }).catch((initErr) => {
    console.error('Database initialization failed:', initErr);
    process.exit(1);
  });
});

// Cleanup UPnP mapping on exit
process.on('SIGINT', () => {
  if (upnpClient && portMapping) {
    upnpClient.removeMapping(portMapping, (err) => {
      if (err) console.log('Note: Could not remove UPnP mapping on exit');
      else console.log('UPnP port mapping removed');
    });
  }
  if (!db) return process.exit(0);
  db.close((err) => {
    if (err) console.error('Error closing database:', err);
    else console.log('Database connection closed');
    process.exit(0);
  });
});

