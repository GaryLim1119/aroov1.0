require('dotenv').config();
const express = require('express');
const mysql = require('mysql2'); 
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const multer = require('multer');

// --- CLOUDINARY IMPORTS ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. SERVE STATIC FILES
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

// --- SESSION SETUP ---
app.set('trust proxy', 1); // Trust Vercel's proxy

app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'secretkey'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// --- FIX FOR PASSPORT + COOKIE-SESSION ---
app.use((req, res, next) => {
    if (req.session && !req.session.regenerate) {
        req.session.regenerate = (cb) => { cb(); };
    }
    if (req.session && !req.session.save) {
        req.session.save = (cb) => { cb(); };
    }
    next();
});

app.use(passport.initialize());
app.use(passport.session());

// =========================================================
// --- DATABASE CONNECTION (TiDB Cloud) ---
// =========================================================
const db = mysql.createPool({
    host: process.env.DB_HOST,       
    user: process.env.DB_USER,            
    password: process.env.DB_PASS,             
    database: process.env.DB_NAME,    
    port: process.env.DB_PORT || 4000, 
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

db.getConnection()
    .then(conn => {
        console.log("✅ Connected to TiDB Cloud successfully!");
        conn.release();
    })
    .catch(err => {
        console.error("❌ Database Connection Failed:", err.message);
    });

// =========================================================
// --- IMAGE UPLOAD CONFIG (CLOUDINARY) ---
// =========================================================
cloudinary.config({
    cloud_name: 'ddwfx2ktn', 
    api_key: '387448294655364', 
    api_secret: 'CQqQo09E_Tdkc-NHKDfAxw280RQ' 
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'aroov_destinations', 
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});

const upload = multer({ storage: storage });

function isAuthenticated(req, res, next) {
    // Check if user is logged in via session
    if (req.session && req.session.user) {
        return next();
    }
    // If this is an API request (starts with /api/), send JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Otherwise redirect to login page
    res.redirect('/login');
}

// =========================================================
// --- PASSPORT CONFIG ---
// =========================================================
passport.serializeUser((user, done) => {
    const sessionUser = {
        id: user.id || user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        picture: user.picture
    };
    done(null, sessionUser);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// GOOGLE STRATEGY
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
    proxy: true 
  },
  async function(accessToken, refreshToken, profile, cb) {
      try {
          const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [profile.emails[0].value]);
          if (rows.length > 0) {
              return cb(null, rows[0]); 
          }
          
          const newUser = {
              email: profile.emails[0].value,
              name: profile.displayName,
              picture: profile.photos[0].value,
              role: 'student' // Default role
          };
          const [result] = await db.query('INSERT INTO users (email, name, picture, role) VALUES (?, ?, ?, ?)', 
              [newUser.email, newUser.name, newUser.picture, newUser.role]);
          
          newUser.id = result.insertId; 
          return cb(null, newUser);
      } catch (err) { return cb(err, null); }
  }
));

// LOCAL STRATEGY
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
          const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
          if (rows.length === 0) return done(null, false, { message: 'User not found' });
          const user = rows[0];
          
          const match = await bcrypt.compare(password, user.password);
          if (match) return done(null, user); 
          else return done(null, false, { message: 'Incorrect password' });
      } catch (err) { return done(err); }
}));

// =========================================================
// --- PAGE ROUTES ---
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public','official', 'official.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auth', 'login.html'));
});

// Middleware to protect routes
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

app.get('/admin', checkAuthenticated, (req, res) => {
    if (req.user.role === 'admin') res.sendFile(path.join(__dirname, 'public/admin/index.html'));
    else res.redirect('/user');
});

app.get('/user', checkAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/user/index.html'));
});

// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.send('<script>alert("Email exists!"); window.location.href="/login";</script>');
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
            [name, email, hashedPassword, 'student']);
        
        res.send('<script>alert("Account created!"); window.location.href="/login";</script>');
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect(req.user.role === 'admin' ? '/admin' : '/user')
);

app.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), (req, res) => {
    res.redirect(req.user.role === 'admin' ? '/admin' : '/user');
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => { if (err) return next(err); res.redirect('/'); });
});

// =========================================================
// --- 🆕 PROFILE, UNIVERSITIES & CALENDAR APIs ---
// =========================================================

// 1. Get All Universities (For Dropdown)
app.get('/api/universities', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT university_id, name FROM universities ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Get Full User Profile
app.get('/api/user/profile', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user_id;
        const [rows] = await db.query(`
            SELECT user_id, email, name, picture, role, university_id, 
                   budget_min, budget_max, preferred_types, preferred_activities 
            FROM users WHERE user_id = ?`, [userId]);
            
        if (rows.length === 0) return res.status(404).json({ error: "User not found" });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Update User Profile
app.put('/api/user/profile', checkAuthenticated, async (req, res) => {
    const { name, role, university_id, budget_min, budget_max, preferred_types, preferred_activities, password } = req.body;
    const userId = req.user.id || req.user.user_id;

    let passwordSql = "";
    // JSON.stringify helps store array data in MySQL JSON columns
    let params = [
        name, 
        role, 
        (role === 'student' ? university_id : null), // Only save Uni ID if student
        budget_min, 
        budget_max, 
        JSON.stringify(preferred_types),     
        JSON.stringify(preferred_activities) 
    ];

    try {
        if (password) {
            // Basic Password Validation (Optional but recommended)
            if (password.length < 6) return res.status(400).json({ error: "Password must be 6+ chars" });
            
            const hashedPassword = await bcrypt.hash(password, 10);
            passwordSql = ", password = ?";
            params.push(hashedPassword);
        }

        params.push(userId); // Add ID for WHERE clause

        const sql = `UPDATE users SET name=?, role=?, university_id=?, budget_min=?, budget_max=?, preferred_types=?, preferred_activities=? ${passwordSql} WHERE user_id=?`;
        
        await db.query(sql, params);
        
        // Update Session to reflect new name/role immediately
        if (req.session && req.session.passport && req.session.passport.user) {
             req.session.passport.user.name = name;
             req.session.passport.user.role = role;
        }

        res.json({ message: "Profile updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

// 5. [GET] Fetch Combined Calendar (Personal + University)
// 5. [GET] Fetch Combined Calendar (Safe Version)
app.get('/api/user/calendar', checkAuthenticated, async (req, res) => {
    const userId = req.user.id || req.user.user_id;

    try {
        // 1. Get University ID
        const [userRows] = await db.query("SELECT university_id FROM users WHERE user_id = ?", [userId]);
        const uniId = userRows[0]?.university_id;

        // 2. Fetch Personal Availability
        const [personalRows] = await db.query("SELECT * FROM user_availability WHERE user_id = ?", [userId]);

        // 3. Fetch University Schedules
        let uniRows = [];
        if (uniId) {
            // Using '*' covers all column names
            const [rows] = await db.query("SELECT * FROM university_schedules WHERE university_id = ?", [uniId]);
            uniRows = rows;
        }

        // --- DEBUG LOG: Check your terminal for this! ---
        console.log("------------------------------------------------");
        console.log(`Uni ID: ${uniId}`);
        if(uniRows.length > 0) console.log("First Uni Event (Raw DB):", uniRows[0]);
        // ------------------------------------------------

        const events = [];

        // Helper: safely convert date to YYYY-MM-DD
        const safeDate = (d) => {
            if (!d) return null;
            // If it's already a string, take the first 10 chars
            if (typeof d === 'string') return d.substring(0, 10);
            // If it's a JS Date object
            try { return d.toISOString().split('T')[0]; } catch(e) { return null; }
        };

        // -- Process Personal Events --
        personalRows.forEach(row => {
            const s = safeDate(row.start_date);
            const e = safeDate(row.end_date);
            
            if(s && e) {
                // CHECK NOTE FOR COLOR
                const isBusy = (row.note === 'Busy'); 
                
                events.push({
                    id: row.avail_id,
                    title: row.note || 'Available', // Shows text "Busy" or "Available"
                    start: s,
                    end: e,
                    display: 'background',
                    // RED if Busy, GREEN if Available
                    backgroundColor: isBusy ? '#ef4444' : '#22c55e', 
                    allDay: true,
                    extendedProps: { type: 'user_busy' }
                });
            }
        });

        // -- Process University Events --
        uniRows.forEach((row, index) => {
            const s = safeDate(row.start_date);
            const e = safeDate(row.end_date);
            
            // Fix "undefined" names by checking multiple possible column names
            // Check row.event_type OR row.type OR row.category
            const type = row.event_type || row.type || row.category || "Event";
            const name = row.event_name || row.name || row.title || "University Event";

            // Determine Color
            let color = '#3b82f6'; // Default Blue
            const typeLower = String(type).toLowerCase(); // safe lowercase
            
            if (typeLower.includes('exam')) color = '#ef4444';       // Red
            else if (typeLower.includes('break')) color = '#22c55e'; // Green
            else if (typeLower.includes('holiday')) color = '#f59e0b'; // Orange

            if(s && e) {
                events.push({
                    id: `uni-${index}`,
                    title: `${type}: ${name}`,
                    start: s,
                    end: e,
                    display: 'background',
                    backgroundColor: color,
                    allDay: true,
                    editable: false
                });
            }
        });

        res.json(events);

    } catch (err) {
        console.error("CRITICAL ERROR in Calendar Route:", err);
        res.status(500).json([]);
    }
});

// 5. [LEGACY] Toggle Personal Availability (Single click) - Kept for fallback
app.post('/api/user/calendar/toggle', checkAuthenticated, async (req, res) => {
    const { date } = req.body; 
    const userId = req.user.id || req.user.user_id;

    try {
        const [existing] = await db.query("SELECT avail_id FROM user_availability WHERE user_id=? AND start_date=?", [userId, date]);

        if (existing.length > 0) {
            await db.query("DELETE FROM user_availability WHERE avail_id=?", [existing[0].avail_id]);
            res.json({ status: "free" });
        } else {
            await db.query("INSERT INTO user_availability (user_id, start_date, end_date, note) VALUES (?, ?, ?, ?)", 
                [userId, date, date, 'Personal Busy']);
            res.json({ status: "busy" });
        }
    } catch (err) {
        res.status(500).json({ error: "Toggle Error" });
    }
});

// 6. [NEW] Save Availability Range (Drag & Drop)
// 6. [NEW] Save Availability Range
app.post('/api/user/availability', checkAuthenticated, async (req, res) => {
    let { start_date, end_date, note } = req.body;
    const userId = req.user.id || req.user.user_id;

    if (!start_date || !end_date) return res.status(400).json({ error: "Dates required" });

    const formattedStart = start_date.split('T')[0];
    const formattedEnd = end_date.split('T')[0];

    try {
        await db.query(
            "INSERT INTO user_availability (user_id, start_date, end_date, note) VALUES (?, ?, ?, ?)",
            // CHANGE "Busy" TO "Available" HERE:
            [userId, formattedStart, formattedEnd, note || "Available"] 
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 7. [NEW] Delete Availability Block
app.delete('/api/user/availability/:id', checkAuthenticated, async (req, res) => {
    const availId = req.params.id;
    const userId = req.user.id || req.user.user_id;

    try {
        // Ensure user can only delete their own records
        const [result] = await db.query("DELETE FROM user_availability WHERE avail_id = ? AND user_id = ?", [availId, userId]);
        
        if (result.affectedRows === 0) {
            return res.status(403).json({ error: "Unauthorized or not found" });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// =========================================================
// --- FAVOURITES APIs ---
// =========================================================

app.post('/api/user/favourites', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user_id; 
        const destId = req.body.destinationId || req.body.dest_id;

        if (!destId) return res.status(400).json({ error: "Missing destination ID" });

        const [result] = await db.query(
            `INSERT INTO favourites (user_id, dest_id) VALUES (?, ?)`, 
            [userId, destId]
        );
        res.json({ message: "Added to favourites", id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.json({ message: "Already added" });
        res.status(500).json({ error: "Database error" });
    }
});

app.delete('/api/user/favourites/:id', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user_id; 
        const destId = req.params.id;

        await db.query(
            `DELETE FROM favourites WHERE user_id = ? AND dest_id = ?`, 
            [userId, destId]
        );
        res.json({ message: "Removed from favourites" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.get('/api/user/favourites', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user_id;
        const sql = `
            SELECT destination.* FROM favourites 
            JOIN destination ON favourites.dest_id = destination.dest_id 
            WHERE favourites.user_id = ?
        `;
        const [rows] = await db.query(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// --- DESTINATIONS API ---
// =========================================================

app.get('/api/destinations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        const userId = req.user ? (req.user.id || req.user.user_id) : 0;
        
        const search = req.query.search || '';
        const type = req.query.type || '';
        const incomplete = req.query.incomplete === 'true'; 
        const maxPrice = req.query.maxPrice;

        let sql = `
            SELECT destination.*, 
                   (CASE WHEN favourites.id IS NOT NULL THEN 1 ELSE 0 END) as is_liked 
            FROM destination 
            LEFT JOIN favourites ON destination.dest_id = favourites.dest_id 
                                  AND favourites.user_id = ?
            WHERE 1=1
        `;
        
        let params = [userId];

        if (search) {
            sql += ` AND (name LIKE ? OR state LIKE ? OR CAST(destination.dest_id AS CHAR) LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (type) {
            sql += ` AND type = ?`;
            params.push(type);
        }
        if (maxPrice) {
            sql += ` AND price_min <= ?`;
            params.push(maxPrice);
        }
        if (incomplete) {
            sql += ` AND (description IS NULL OR description = '' OR images IS NULL OR images = '' OR type IS NULL OR type = '')`;
        }

        sql += ` ORDER BY destination.dest_id DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await db.query(sql, params);
        const data = rows.map(item => ({ ...item, is_liked: item.is_liked === 1 }));

        let countSql = `SELECT COUNT(*) as count FROM destination WHERE 1=1`;
        let countParams = [];
        if (search) {
             countSql += ` AND (name LIKE ? OR state LIKE ?)`;
             countParams.push(`%${search}%`, `%${search}%`);
        }
        if (type) { countSql += ` AND type = ?`; countParams.push(type); }
        if (maxPrice) { countSql += ` AND price_min <= ?`; countParams.push(maxPrice); }

        const [countResult] = await db.query(countSql, countParams);
        const totalItems = countResult[0].count;
        const totalPages = Math.ceil(totalItems / limit);

        res.json({ data: data, totalPages: totalPages });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/destinations', upload.single('imageFile'), async (req, res) => {
    try {
        const { dest_id, name, state, description, activities, type, price_min, price_max, latitude, longtitude, maps_place_id, existingImage } = req.body;
        
        let imagePath = existingImage; 
        if (req.file) imagePath = req.file.path; 

        if (dest_id) {
            await db.query(
                `UPDATE destination SET name=?, state=?, description=?, activities=?, type=?, price_min=?, price_max=?, latitude=?, longtitude=?, maps_place_id=?, images=? WHERE dest_id=?`,
                [name, state, description, activities, type, price_min, price_max, latitude, longtitude, maps_place_id, imagePath, dest_id]
            );
        } else {
            await db.query(
                `INSERT INTO destination (name, state, description, activities, type, price_min, price_max, latitude, longtitude, maps_place_id, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, state, description, activities, type, price_min, price_max, latitude, longtitude, maps_place_id, imagePath]
            );
        }
        res.json({ message: 'Saved successfully', imageUrl: imagePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/destinations/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM destination WHERE dest_id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/destinations/random', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM destination ORDER BY RAND() LIMIT 10');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// --- GROUP MANAGEMENT ROUTES ---
// =========================================================

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

app.get('/api/user/groups', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id || req.user.user_id;

    try {
        const sql = `
            SELECT g.group_id, g.name as group_name, gm.role, 
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
            FROM \`groups\` g
            JOIN group_members gm ON g.group_id = gm.group_id
            WHERE gm.user_id = ?
        `;
        const [rows] = await db.query(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name } = req.body;
    const userId = req.user.id || req.user.user_id; 

    try {
        const [result] = await db.query('INSERT INTO \`groups\` (name, created_by) VALUES (?, ?)', [name, userId]);
        const groupId = result.insertId;
        await db.query('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [groupId, userId, 'leader']);
        res.json({ success: true, groupId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name } = req.body;
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id; 

    try {
        const [check] = await db.query('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role="leader"', [groupId, userId]);
        if (check.length === 0) return res.status(403).json({ error: 'Only leader can edit' });

        await db.query('UPDATE \`groups\` SET name = ? WHERE group_id = ?', [name, groupId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id; 

    try {
        const [check] = await db.query('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role="leader"', [groupId, userId]);
        if (check.length === 0) return res.status(403).json({ error: 'Only leader can delete' });

        await db.query('DELETE FROM \`groups\` WHERE group_id = ?', [groupId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id;

    try {
        const [myRole] = await db.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
        if (myRole.length === 0) return res.status(403).json({ error: 'Access denied' });

        const [members] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.picture, gm.role, gm.joined_at 
            FROM group_members gm 
            JOIN users u ON gm.user_id = u.user_id 
            WHERE gm.group_id = ?
        `, [groupId]);

        const [invites] = await db.query('SELECT * FROM group_invites WHERE group_id = ? AND status="pending"', [groupId]);

        res.json({ 
            members, 
            invites, 
            currentUserRole: myRole[0].role 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- INVITE MEMBER ---
app.post('/api/groups/:id/invite', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const groupId = req.params.id;
    const { email } = req.body;
    const token = Math.random().toString(36).substring(7);
    const senderName = req.user.name || "A friend"; 

    try {
        const [groupRows] = await db.query('SELECT name FROM \`groups\` WHERE group_id = ?', [groupId]);
        if (groupRows.length === 0) return res.status(404).json({ error: "Group not found" });
        const groupName = groupRows[0].name;

        await db.query('INSERT INTO group_invites (group_id, email, token) VALUES (?, ?, ?)', [groupId, email, token]);

        // DYNAMIC INVITE LINK
        const baseUrl = process.env.BASE_URL; 
        const inviteLink = `${baseUrl}/api/join?token=${token}`;
        
        const mailOptions = {
            from: `"${senderName} (via Aroov)" <${process.env.GMAIL_USER}>`, 
            to: email,
            subject: `${senderName} invited you to join "${groupName}"! ✈️`, 
            html: `
                <div style="font-family: Arial; padding: 20px;">
                    <h2 style="color: #ff5a5f;">You're Invited!</h2>
                    <p>Hi! <strong>${senderName}</strong> wants you to plan a trip in <strong>"${groupName}"</strong>.</p>
                    <a href="${inviteLink}" style="background-color: #ff5a5f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Email sent successfully!' });

    } catch (err) {
        console.error("Mail Error:", err);
        res.status(500).json({ error: "Failed to send email." });
    }
});

app.get('/api/join', async (req, res) => {
    const { token } = req.query;
    if (!req.user) return res.redirect('/login');

    try {
        const [invites] = await db.query('SELECT * FROM group_invites WHERE token = ? AND status="pending"', [token]);
        if (invites.length === 0) return res.send("This invite link is invalid or expired.");

        const invite = invites[0];
        const userId = req.user.id || req.user.user_id; 

        await db.query('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [invite.group_id, userId, 'member']);
        await db.query('UPDATE group_invites SET status="accepted" WHERE id = ?', [invite.id]);

        res.redirect('/user/groups.html');
    } catch (err) {
        res.send("Error joining: " + err.message);
    }
});

// ==========================================
// SHARED TRIPS & VOTING
// ==========================================

app.post('/api/groups/:groupId/recommend', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { groupId } = req.params;
    const destination_id = req.body.destination_id || req.body.dest_id; 
    const userId = req.user.id || req.user.user_id; 

    if(!destination_id) return res.status(400).json({error: "Destination ID missing"});

    try {
        const [exists] = await db.query(
            'SELECT * FROM group_trips WHERE group_id = ? AND dest_id = ?', 
            [groupId, destination_id]
        );
        
        if (exists.length > 0) {
            return res.status(400).json({ error: 'Destination has already been shared to this group' });
        }

        await db.query(
            'INSERT INTO group_trips (group_id, dest_id, shared_by) VALUES (?, ?, ?)', 
            [groupId, destination_id, userId]
        );
        
        res.json({ success: true, message: 'Destination shared successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/groups/:groupId/trips', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { groupId } = req.params;
    const userId = req.user.id || req.user.user_id; 

    try {
        const [rows] = await db.query(`
            SELECT 
                gt.trip_ref_id, gt.shared_at,
                d.dest_id, d.name, d.state, d.type, d.images, d.price_min,
                u.name as shared_by,
                (SELECT COUNT(*) FROM group_votes WHERE trip_ref_id = gt.trip_ref_id) as vote_count,
                (SELECT COUNT(*) FROM group_votes WHERE trip_ref_id = gt.trip_ref_id AND user_id = ?) as user_has_voted
            FROM group_trips gt
            JOIN destination d ON gt.dest_id = d.dest_id
            JOIN users u ON gt.shared_by = u.user_id
            WHERE gt.group_id = ?
            ORDER BY vote_count DESC
        `, [userId, groupId]);

        res.json(rows);
    } catch (err) {
        console.error("Trips Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups/vote', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { tripRefId } = req.body;
    const userId = req.user.id || req.user.user_id; 

    try {
        const [check] = await db.query('SELECT * FROM group_votes WHERE trip_ref_id = ? AND user_id = ?', [tripRefId, userId]);

        if (check.length > 0) {
            await db.query('DELETE FROM group_votes WHERE trip_ref_id = ? AND user_id = ?', [tripRefId, userId]);
            res.json({ action: 'removed' });
        } else {
            await db.query('INSERT INTO group_votes (trip_ref_id, user_id) VALUES (?, ?)', [tripRefId, userId]);
            res.json({ action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Basic User Info (For Navbar)
app.get('/api/user/me', async (req, res) => {
    const user = req.user || (req.session && req.session.user);

    if (!user) {
        return res.status(401).json({ error: "Not logged in" });
    }

    const userId = user.id || user.user_id; 
    const sql = "SELECT name, picture FROM users WHERE user_id = ?";
    
    try {
        const [results] = await db.query(sql, [userId]);
        
        if (results.length > 0) {
            res.json(results[0]); 
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (err) {
        console.error("Profile Fetch Error:", err);
        res.status(500).json({ error: "Database error" });
    }
});


app.get('/api/universities', async (req, res) => {
    try {
        // SQL: SELECT id, name FROM universities
        const results = await db.query('SELECT * FROM universities'); 
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Db error" });
    }
});





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));