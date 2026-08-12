const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// ✅ Proper DB connection (Render + Local)
let pool;

if (process.env.DATABASE_URL) {
    console.log("[DB] Using Render PostgreSQL...");
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false,
        },
    });
} else {
    console.log("[DB] Using Local PostgreSQL...");
    pool = new Pool({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'lotus_lms',
    });
}

async function initDatabase() {
    try {
        const checkResult = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') as table_exists"
        );

        if (checkResult.rows[0].table_exists) {
            console.log('[DB] LOTUS database already initialized.');

            // Migration
            try {
                await pool.query(
                    'ALTER TABLE newspapers ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL'
                );
                console.log('[DB] Migration applied');
            } catch (e) {}

            await createQuizTables(pool);
            return;
        }

        console.log('[DB] Initializing database...');

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

        await createQuizTables(pool);
        await seedData();

    } catch (err) {
        console.error('[DB Error] Failed to initialize database:', err);
    }
}

async function createQuizTables(pool) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS quizzes (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT
            );
        `);
        console.log('[DB] Quiz tables ready');
    } catch (e) {
        console.error('[DB] Quiz error:', e.message);
    }
}

async function seedData() {
    console.log('[DB] Seeding data...');

    const adminPass = bcrypt.hashSync('Cyber@007', 10);

    await pool.query(
        'INSERT INTO users (membership_id, role, name, email, password_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        ['LOTUS-ADM-001', 'admin', 'Admin', 'admin@lotus.com', adminPass]
    );

    console.log('[DB] Seed completed');
}

initDatabase();

module.exports = pool;