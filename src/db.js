const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// ✅ DB Connection
let pool;

if (process.env.DATABASE_URL) {
    console.log("[DB] Using Render PostgreSQL...");
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.log("[DB] Using Local PostgreSQL...");
    pool = new Pool({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'lotus_lms'
    });
}

// ==============================
// ✅ INIT DATABASE (FIXED)
// ==============================
async function initDatabase() {
    try {
        console.log('[DB] Ensuring all tables exist...');

        // USERS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                membership_id TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'member')),
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                address TEXT,
                profile_photo TEXT,
                password_hash TEXT NOT NULL,
                status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // CATEGORIES
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // BOOKS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS books (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                isbn TEXT UNIQUE NOT NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                publisher TEXT,
                rack_no TEXT DEFAULT 'Digital Vault A-1',
                cover_image TEXT,
                is_ebook INTEGER DEFAULT 1,
                ebook_url TEXT,
                ebook_preview TEXT,
                is_visible INTEGER DEFAULT 1,
                status TEXT DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // NEWSPAPERS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS newspapers (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                publisher TEXT DEFAULT 'Press Issue',
                publish_date TEXT NOT NULL,
                language TEXT DEFAULT 'English',
                edition TEXT DEFAULT 'Main Edition',
                file_url TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // NOTES (🔥 MISSING BEFORE)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notes (
                id SERIAL PRIMARY KEY,
                title TEXT,
                content TEXT,
                category TEXT,
                author_id INTEGER,
                author_name TEXT,
                author_role TEXT,
                status TEXT,
                file_url TEXT,
                file_type TEXT,
                admin_feedback TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // SETTINGS (🔥 MISSING BEFORE)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // QUIZZES
        await pool.query(`
            CREATE TABLE IF NOT EXISTS quizzes (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                time_limit INTEGER DEFAULT 15,
                difficulty TEXT DEFAULT 'Medium',
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // QUESTIONS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
                question_text TEXT NOT NULL,
                question_type TEXT DEFAULT 'MCQ' CHECK (question_type IN ('MCQ', 'True/False', 'Short Answer')),
                marks INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // OPTIONS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS options (
                id SERIAL PRIMARY KEY,
                question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
                option_text TEXT NOT NULL,
                is_correct BOOLEAN DEFAULT false
            );
        `);

        // QUIZ ATTEMPTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS quiz_attempts (
                id SERIAL PRIMARY KEY,
                quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                total_marks INTEGER NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ISSUED ITEMS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS issued_items (
                id SERIAL PRIMARY KEY,
                item_type TEXT,
                item_id INTEGER NOT NULL,
                item_title TEXT NOT NULL,
                member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                member_name TEXT NOT NULL,
                issue_date TEXT NOT NULL,
                notes TEXT,
                status TEXT DEFAULT 'active' CHECK (status IN ('active', 'returned')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ITEM REQUESTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS item_requests (
                id SERIAL PRIMARY KEY,
                item_type TEXT,
                item_id INTEGER NOT NULL,
                item_title TEXT NOT NULL,
                member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                member_name TEXT NOT NULL,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // USER LOGINS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_logins (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address TEXT,
                login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('[DB] All tables ensured ✅');

        await seedData();

    } catch (err) {
        console.error('[DB Error]:', err);
    }
}

// ==============================
// ✅ SEED DATA
// ==============================
async function seedData() {
    try {
        const adminPass = bcrypt.hashSync('Cyber@007', 10);

        await pool.query(
            `INSERT INTO users (membership_id, role, name, email, password_hash)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (email) DO NOTHING`,
            ['LOTUS-ADM-001', 'admin', 'Admin', 'admin@lotus.com', adminPass]
        );

        console.log('[DB] Seed completed');
    } catch (err) {
        console.error('[DB Seed Error]:', err.message);
    }
}

// RUN INIT
initDatabase();

module.exports = pool;