const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files (HTML, JS, CSS)
app.use(express.static(__dirname));

// 1. INITIALIZE AIVEN POSTGRESQL CONNECTION
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Aiven SSL connections
    }
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to Aiven PostgreSQL:', err.stack);
    } else {
        console.log('Connected to Aiven PostgreSQL database successfully!');
        release();
    }
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

// 3. CREATE TABLES IN POSTGRESQL
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                age INT DEFAULT 25,
                gender VARCHAR(50) DEFAULT 'male',
                weight REAL DEFAULT 70,
                height REAL DEFAULT 170,
                bmr INT DEFAULT 1650
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_health (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                date VARCHAR(10) NOT NULL,
                water INT,
                meals INT,
                exercise INT,
                sleep REAL,
                meal TEXT,
                calories INT DEFAULT 0,
                protein INT DEFAULT 0,
                carbs INT DEFAULT 0,
                fat INT DEFAULT 0,
                UNIQUE(user_id, date)
            );
        `);
        console.log("Database tables verified/created successfully.");
    } catch (err) {
        console.error("Error creating tables:", err.message);
    }
};
initDb();

// 4. AUTHENTICATION ROUTES
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username, password]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT id, username FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. USER PROFILE & BMR ROUTES
app.post('/api/user/profile', async (req, res) => {
    const { userId, age, gender, weight, height } = req.body;
    
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = (gender === 'female') ? Math.round(bmr - 161) : Math.round(bmr + 5);

    try {
        await pool.query(
            'UPDATE users SET age = $1, gender = $2, weight = $3, height = $4, bmr = $5 WHERE id = $6',
            [age, gender, weight, height, bmr, userId]
        );
        res.json({ message: 'Profile updated successfully!', bmr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/profile/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT age, gender, weight, height, bmr FROM users WHERE id = $1',
            [req.params.userId]
        );
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. HEALTH DATA ROUTES
app.post('/api/health', async (req, res) => {
    const { userId, water, meals, exercise, sleep, meal } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const nutrients = estimateNutrients(meal);

    const sql = `
        INSERT INTO daily_health 
        (user_id, date, water, meals, exercise, sleep, meal, calories, protein, carbs, fat)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(user_id, date) DO UPDATE SET
        water=EXCLUDED.water, meals=EXCLUDED.meals, exercise=EXCLUDED.exercise, 
        sleep=EXCLUDED.sleep, meal=EXCLUDED.meal, calories=EXCLUDED.calories,
        protein=EXCLUDED.protein, carbs=EXCLUDED.carbs, fat=EXCLUDED.fat`;

    try {
        await pool.query(sql, [
            userId, today, water, meals, exercise, sleep, meal,
            nutrients.calories, nutrients.protein, nutrients.carbs, nutrients.fat
        ]);
        res.json({ message: 'Saved successfully!', nutrients });
    } catch (err) {
        console.error("Database Save Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/health/today/:userId', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const result = await pool.query(
            'SELECT * FROM daily_health WHERE user_id = $1 AND date = $2',
            [req.params.userId, today]
        );
        res.json(result.rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/health/history/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM daily_health WHERE user_id = $1 ORDER BY date DESC',
            [req.params.userId]
        );
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/health/weekly/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT date, water, sleep, calories FROM daily_health WHERE user_id = $1 ORDER BY date ASC LIMIT 7',
            [req.params.userId]
        );
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 7. START SERVER (Dynamic Port binding for Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
