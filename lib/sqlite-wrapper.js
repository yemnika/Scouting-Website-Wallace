/**
 * sqlite3-compatible wrapper around sql.js (pure JS, no native bindings).
 * Persists to a file and exposes the same callback API as node-sqlite3.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

function rowsToObjects(columns, values) {
  if (!values || !values.length) return [];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function openDatabase(filePath, callback) {
  initSqlJs().then(SQL => {
    let data = null;
    const fullPath = path.resolve(filePath);
    if (fs.existsSync(fullPath)) {
      try {
        data = new Uint8Array(fs.readFileSync(fullPath));
      } catch (e) {
        return callback(e);
      }
    }
    const db = data ? new SQL.Database(data) : new SQL.Database();

    function save() {
      try {
        const buffer = db.export();
        fs.writeFileSync(fullPath, Buffer.from(buffer));
      } catch (e) {
        console.error('Error saving database:', e);
      }
    }

    const wrapper = {
      run(sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        params = params || [];
        try {
          db.run(sql, params);
          const ctx = {
            lastID: 0,
            changes: db.getRowsModified ? db.getRowsModified() : 0
          };
          const upper = (sql || '').trim().toUpperCase();
          if (upper.startsWith('INSERT')) {
            const res = db.exec('SELECT last_insert_rowid() AS id');
            if (res.length && res[0].values && res[0].values[0]) {
              ctx.lastID = res[0].values[0][0];
            }
          }
          save();
          if (callback) setImmediate(() => callback.call(ctx, null));
        } catch (err) {
          if (callback) setImmediate(() => callback(err));
        }
      },

      get(sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        params = params || [];
        try {
          const res = db.exec(sql, params);
          let row = null;
          if (res.length && res[0].columns && res[0].values && res[0].values[0]) {
            row = {};
            res[0].columns.forEach((col, i) => { row[col] = res[0].values[0][i]; });
          }
          if (callback) setImmediate(() => callback(null, row));
        } catch (err) {
          if (callback) setImmediate(() => callback(err, null));
        }
      },

      all(sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        params = params || [];
        try {
          const res = db.exec(sql, params);
          const rows = res.length && res[0].columns
            ? rowsToObjects(res[0].columns, res[0].values)
            : [];
          if (callback) setImmediate(() => callback(null, rows));
        } catch (err) {
          if (callback) setImmediate(() => callback(err, null));
        }
      },

      prepare(sql) {
        return {
          run(...args) {
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            try {
              const stmt = db.prepare(sql);
              stmt.bind(args.length ? args : []);
              stmt.step();
              stmt.free();
              save();
              if (callback) setImmediate(() => callback(null));
            } catch (err) {
              if (callback) setImmediate(() => callback(err));
            }
          },
          finalize() {}
        };
      },

      close(callback) {
        try {
          save();
          db.close();
        } catch (e) {
          if (callback) return callback(e);
        }
        if (callback) setImmediate(() => callback(null));
      }
    };

    callback(null, wrapper);
  }).catch(err => callback(err));
}

module.exports = { openDatabase };
