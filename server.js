require('dotenv').config();
const express = require('express');
const mysql = require('mysql2'); 
const cors = require('cors');
const path = require('path');
const session = require('express-session');
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
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

// --- SESSION SETUP ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'secretkey',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// =========================================================
// --- DATABASE CONNECTION ---
// =========================================================
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',       
    user: process.env.DB_USER || 'root',            
    password: process.env.DB_PASS || '',             
    database: process.env.DB_NAME || 'aroov_db',    
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

db.getConnection()
    .then(conn => {
        console.log("✅ Database 'aroov_db' Connected Successfully!");
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

// =========================================================
// --- PASSPORT CONFIG ---
// =========================================================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// GOOGLE STRATEGY
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
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
              role: 'student'
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

// --- PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/official/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/auth/login.html')));

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
// --- FAVOURITES APIs (FIXED WITH SAFETY CHECKS) ---
// =========================================================

app.post('/api/user/favourites', checkAuthenticated, async (req, res) => {
    try {
        // SAFETY: Check both 'id' and 'user_id'
        const userId = req.user.id || req.user.user_id; 
        
        const destId = req.body.destinationId || req.body.dest_id || req.body.destination_id;

        if (!destId) return res.status(400).json({ error: "Missing destination ID" });

        const [result] = await db.query(
            `INSERT INTO favourites (user_id, dest_id) VALUES (?, ?)`, 
            [userId, destId]
        );
        res.json({ message: "Added to favourites", id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.json({ message: "Already added" });
        console.error("Fav Error:", err);
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
        console.error("Fav Delete Error:", err);
        res.status(500).json({ error: "Database error" });
    }
});

app.get('/api/user/favourites', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user_id;
        console.log("🔍 Fetching Favourites for User ID:", userId);

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

// 1. GET ALL DESTINATIONS (With 'is_liked')
app.get('/api/destinations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        
        // SAFETY: Use .id or .user_id if user exists, else 0
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

        // Count Query
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
        console.error("Database Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. CREATE OR UPDATE DESTINATION
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

// 3. DELETE DESTINATION
app.delete('/api/destinations/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM destination WHERE dest_id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. RANDOM API
app.get('/api/destinations/random', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM destination ORDER BY RAND() LIMIT 10');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// --- GROUP MANAGEMENT ROUTES (FIXED & DEBUGGED) ---
// =========================================================

// Configure Email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// 1. GET USER GROUPS
app.get('/api/user/groups', async (req, res) => {
    if (!req.user) {
        console.log("❌ DEBUG: User is NOT logged in.");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // SAFETY: Try to find the ID in any possible property
    const userId = req.user.id || req.user.user_id;

    console.log("-----------------------------------------");
    console.log("🔍 DEBUG: Full User Object:", req.user);
    console.log("👤 DEBUG: Extracted User ID:", userId);

    if (!userId) {
        console.log("❌ DEBUG: User ID is undefined! Passport is not saving the ID correctly.");
        return res.status(500).json({ error: 'User ID missing in session' });
    }

    try {
        const sql = `
            SELECT g.group_id, g.name as group_name, gm.role, 
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
            FROM \`groups\` g
            JOIN group_members gm ON g.group_id = gm.group_id
            WHERE gm.user_id = ?
        `;

        const [rows] = await db.query(sql, [userId]);

        console.log("✅ DEBUG: Query Success. Found " + rows.length + " groups.");
        res.json(rows);
    } catch (err) {
        console.error("❌ DEBUG: Database Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. CREATE GROUP
app.post('/api/groups', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name } = req.body;
    const userId = req.user.id || req.user.user_id; // FIX

    try {
        const [result] = await db.query('INSERT INTO \`groups\` (name, created_by) VALUES (?, ?)', [name, userId]);
        const groupId = result.insertId;
        await db.query('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [groupId, userId, 'leader']);
        res.json({ success: true, groupId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. EDIT GROUP NAME
app.put('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name } = req.body;
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id; // FIX

    try {
        const [check] = await db.query('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role="leader"', [groupId, userId]);
        if (check.length === 0) return res.status(403).json({ error: 'Only leader can edit' });

        await db.query('UPDATE \`groups\` SET name = ? WHERE group_id = ?', [name, groupId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. DELETE GROUP
app.delete('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id; // FIX

    try {
        const [check] = await db.query('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role="leader"', [groupId, userId]);
        if (check.length === 0) return res.status(403).json({ error: 'Only leader can delete' });

        await db.query('DELETE FROM \`groups\` WHERE group_id = ?', [groupId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GET GROUP DETAILS & MEMBERS
app.get('/api/groups/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const groupId = req.params.id;
    const userId = req.user.id || req.user.user_id;

    try {
        // Check if I am a member
        const [myRole] = await db.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
        if (myRole.length === 0) return res.status(403).json({ error: 'Access denied' });

        // FIX: Changed u.id to u.user_id in both SELECT and JOIN
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
        console.error("Member Load Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6. INVITE MEMBER
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

        // CHANGE THIS URL TO MATCH YOUR HOST IF DEPLOYED
        const inviteLink = `http://localhost:3000/api/join?token=${token}`;
        
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

// 7. JOIN GROUP (Via Link)
app.get('/api/join', async (req, res) => {
    const { token } = req.query;
    if (!req.user) return res.redirect('/login');

    try {
        const [invites] = await db.query('SELECT * FROM group_invites WHERE token = ? AND status="pending"', [token]);
        if (invites.length === 0) return res.send("This invite link is invalid or expired.");

        const invite = invites[0];
        const userId = req.user.id || req.user.user_id; // FIX

        await db.query('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [invite.group_id, userId, 'member']);
        await db.query('UPDATE group_invites SET status="accepted" WHERE id = ?', [invite.id]);

        res.redirect('/user/groups.html');
    } catch (err) {
        res.send("Error joining: " + err.message);
    }
});

// ==========================================
// SHARED TRIPS & VOTING (FIXED)
// ==========================================

// 8. SHARE TRIP TO GROUP
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
        
        // --- THIS IS THE CHANGE ---
        if (exists.length > 0) {
            // We send 409 (Conflict) or 400 with your specific message
            return res.status(400).json({ error: 'Destination has already been shared to this group' });
        }
        // --------------------------

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

// 9. GET SHARED TRIPS
app.get('/api/groups/:groupId/trips', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { groupId } = req.params;
    const userId = req.user.id || req.user.user_id; 

    try {
        // FIX: Changed u.id to u.user_id in the JOIN
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

// 10. TOGGLE VOTE
app.post('/api/groups/vote', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { tripRefId } = req.body;
    const userId = req.user.id || req.user.user_id; // FIX

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));