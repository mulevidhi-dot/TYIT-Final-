const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// Serve static HTML/JS/CSS files directly from the root project folder
app.use(express.static(__dirname));

// 1. INITIALIZE DATABASE
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database opening error:', err.message);
    else console.log('Connected to SQLite database.');
});

// 2. NUTRITION DB & HELPER FUNCTION
const NUTRITION_DB = {
    'medu vada': { calories: 280, protein: 6, carbs: 30, fat: 15 },
    'idli': { calories: 120, protein: 4, carbs: 25, fat: 1 },
    'dosa': { calories: 250, protein: 5, carbs: 38, fat: 9 },
    'poha': { calories: 220, protein: 4, carbs: 40, fat: 5 },
    'salad': { calories: 150, protein: 3, carbs: 12, fat: 10 },
    'chicken': { calories: 330, protein: 31, carbs: 0, fat: 22 },
    'rice': { calories: 200, protein: 4, carbs: 45, fat: 1 },
    'roti': { calories: 100, protein: 3, carbs: 20, fat: 1 },
    'dal': { calories: 180, protein: 9, carbs: 25, fat: 4 },
    'paneer': { calories: 265, protein: 18, carbs: 6, fat: 20 }
};

function estimateNutrients(mealText) {
    if (!mealText) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    let text = mealText.toLowerCase();
    let total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    let matched = false;

    for (const [food, info] of Object.entries(NUTRITION_DB)) {
        if (text.includes(food)) {
            total.calories += info.calories;
            total.protein += info.protein;
            total.carbs += info.carbs;
            total.fat += info.fat;
            matched = true;
        }
    }

    if (!matched && text.trim().length > 0) {
        return { calories: 250, protein: 8, carbs: 30, fat: 10 };
    }

    return total;
}

// 3. CREATE TABLES
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        age INTEGER DEFAULT 25,
        gender TEXT DEFAULT 'male',
        weight REAL DEFAULT 70,
        height REAL DEFAULT 170,
        bmr INTEGER DEFAULT 1650
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        water INTEGER,
        meals INTEGER,
        exercise INTEGER,
        sleep REAL,
        meal TEXT,
        calories INTEGER DEFAULT 0,
        protein INTEGER DEFAULT 0,
        carbs INTEGER DEFAULT 0,
        fat INTEGER DEFAULT 0,
        UNIQUE(user_id, date)
    )`);
});

// 4. AUTHENTICATION ROUTES
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function (err) {
        if (err) return res.status(400).json({ error: 'Username already exists' });
        res.json({ id: this.lastID, username });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT id, username FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(user);
    });
});

// 5. USER PROFILE & BMR ROUTES
app.post('/api/user/profile', (req, res) => {
    const { userId, age, gender, weight, height } = req.body;
    
    // Mifflin-St Jeor Equation for BMR calculation
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = (gender === 'female') ? Math.round(bmr - 161) : Math.round(bmr + 5);

    const sql = `UPDATE users SET age = ?, gender = ?, weight = ?, height = ?, bmr = ? WHERE id = ?`;
    db.run(sql, [age, gender, weight, height, bmr, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Profile updated successfully!', bmr });
    });
});

app.get('/api/user/profile/:userId', (req, res) => {
    db.get(`SELECT age, gender, weight, height, bmr FROM users WHERE id = ?`, [req.params.userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(user || {});
    });
});

// 6. HEALTH DATA ROUTES
app.post('/api/health', (req, res) => {
    const { userId, water, meals, exercise, sleep, meal } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const nutrients = estimateNutrients(meal);

    const sql = `INSERT INTO daily_health 
                 (user_id, date, water, meals, exercise, sleep, meal, calories, protein, carbs, fat)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, date) DO UPDATE SET
                 water=excluded.water, meals=excluded.meals, exercise=excluded.exercise, 
                 sleep=excluded.sleep, meal=excluded.meal, calories=excluded.calories,
                 protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat`;

    db.run(sql, [
        userId, today, water, meals, exercise, sleep, meal,
        nutrients.calories, nutrients.protein, nutrients.carbs, nutrients.fat
    ], function (err) {
        if (err) {
            console.error("Database Save Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Saved successfully!', nutrients });
    });
});

app.get('/api/health/today/:userId', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM daily_health WHERE user_id = ? AND date = ?`, [req.params.userId, today], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

app.get('/api/health/history/:userId', (req, res) => {
    db.all(`SELECT * FROM daily_health WHERE user_id = ? ORDER BY date DESC`, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
// Fetch last 7 days health logs for charts
app.get('/api/health/weekly/:userId', (req, res) => {
    const sql = `SELECT date, water, sleep, calories 
                 FROM daily_health 
                 WHERE user_id = ? 
                 ORDER BY date ASC 
                 LIMIT 7`;
    db.all(sql, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 7. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));