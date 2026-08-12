const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Connect using DATABASE_URL (if provided) or a local default for testing
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lotus_lms',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
    try {
        const checkResult = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') as table_exists");
        if (checkResult.rows[0].table_exists) {
            console.log('[DB] LOTUS database already initialized. Skipping schema creation and seeding.');
            return;
        }

        console.log('[DB] Initializing LOTUS Library System PostgreSQL schema...');

        // Users Table
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

        // Categories Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Books Table
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

        // Newspapers Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS newspapers (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                publisher TEXT DEFAULT 'Press Issue',
                publish_date TEXT NOT NULL,
                language TEXT DEFAULT 'English',
                edition TEXT DEFAULT 'Main Edition',
                file_url TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Notes Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notes (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'General Research',
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                file_url TEXT,
                file_type TEXT DEFAULT 'none' CHECK (file_type IN ('pdf', 'image', 'none')),
                admin_feedback TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Issued Items Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS issued_items (
                id SERIAL PRIMARY KEY,
                item_type TEXT CHECK (item_type IN ('book', 'newspaper')),
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

        // Settings Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        await seedData();
    } catch (err) {
        console.error('[DB Error] Failed to initialize database:', err);
    }
}

async function seedData() {
    console.log('[DB] Seeding initial demo data for LOTUS Library System...');

    const defaultSettings = [
        ['library_name', 'LOTUS Library System'],
        ['contact_email', 'admin@lotus.com'],
        ['allow_member_notes', '1'],
        ['auto_approve_editor_notes', '0']
    ];
    for (const [k, v] of defaultSettings) {
        await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
    }

    const adminPass = bcrypt.hashSync('Cyber@007', 10);
    const editorPass = bcrypt.hashSync('editor123', 10);
    const memberPass = bcrypt.hashSync('member123', 10);

    const users = [
        ['LOTUS-ADM-001', 'admin', 'Lotus System Admin', 'admin@lotus.com', '+1 555-0100', '123 Main St', adminPass, 'active'],
        ['LOTUS-EDT-002', 'editor', 'Sarah Jenkins (Editor)', 'editor@lotus.com', '+1 555-0101', '456 Press Ave', editorPass, 'active'],
        ['LOTUS-MEM-101', 'member', 'Alex Johnson', 'member@lotus.com', '+1 555-0102', '789 Reader Lane', memberPass, 'active'],
        ['LOTUS-MEM-102', 'member', 'Emma Watson', 'emma@lotus.com', '+1 555-0103', '101 Library Way', memberPass, 'active'],
        ['LOTUS-MEM-103', 'member', 'Michael Brown', 'michael@lotus.com', '+1 555-0104', '202 Scholar St', memberPass, 'blocked']
    ];
    for (const u of users) {
        await pool.query('INSERT INTO users (membership_id, role, name, email, phone, address, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (email) DO NOTHING', u);
    }

    const categories = [
        ['Computer Science & AI', 'CS', 'Algorithms, Software Design, AI & ML'],
        ['Literature & Fiction', 'LIT', 'Classics, Poetry & Modern Fiction'],
        ['Physics & Natural Sciences', 'SCI', 'Physics, Quantum Mechanics & Astronomy'],
        ['History & Modern Culture', 'HIS', 'World History, Philosophy & Biographies'],
        ['Economics & Business', 'ECO', 'Finance, Global Markets & Management']
    ];
    for (const c of categories) {
        await pool.query('INSERT INTO categories (name, code, description) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING', c);
    }

    const samplePdfPath = '/pdf-sample.pdf';
    const books = [
        ['Clean Code: A Handbook of Agile Software', 'Robert C. Martin', '978-0132350884', 1, 'Prentice Hall', 'E-Vault CS-1', 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: Clean Code...', 1],
        ['Designing Data-Intensive Applications', 'Martin Kleppmann', '978-1449373320', 1, "O'Reilly Media", 'E-Vault CS-2', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: Reliable Systems...', 1],
        ['To Kill a Mockingbird', 'Harper Lee', '978-0061120084', 2, 'J. B. Lippincott & Co.', 'E-Vault LIT-1', 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: To Kill a Mockingbird...', 1],
        ['A Brief History of Time', 'Stephen Hawking', '978-0553380163', 3, 'Bantam Books', 'E-Vault SCI-1', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: Picture of the Universe...', 1],
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '978-0062316097', 4, 'Harper', 'E-Vault HIS-1', 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: An Animal of No Significance...', 1],
        ['The Pragmatic Programmer', 'Andrew Hunt & David Thomas', '978-0201616224', 1, 'Addison-Wesley', 'E-Vault CS-3', 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=300&q=80', 1, samplePdfPath, 'CHAPTER 1: A Pragmatic Philosophy...', 1]
    ];
    for (const b of books) {
        await pool.query('INSERT INTO books (title, author, isbn, category_id, publisher, rack_no, cover_image, is_ebook, ebook_url, ebook_preview, is_visible) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (isbn) DO NOTHING', b);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const news = [
        ['The New York Times', 'The New York Times Company', todayStr, 'English', 'Daily Issue', samplePdfPath, 'Daily issue paper edition.'],
        ['The Wall Street Journal', 'Dow Jones & Company', todayStr, 'English', 'Daily Issue', samplePdfPath, 'Daily issue paper edition.'],
        ['The Guardian', 'Guardian Media Group', todayStr, 'English', 'Daily Issue', samplePdfPath, 'Daily issue paper edition.']
    ];
    for (const n of news) {
        await pool.query('INSERT INTO newspapers (title, publisher, publish_date, language, edition, file_url, description) VALUES ($1, $2, $3, $4, $5, $6, $7)', n);
    }

    await pool.query('INSERT INTO notes (title, content, category, author_id, author_name, author_role, status, file_url, file_type, admin_feedback) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
        'Cyber Security Guidelines & Network Analysis', 'Detailed research on network traffic inspection, malware sandboxing, and chain-of-custody protocols.', 'Cyber Security', 2, 'Sarah Jenkins (Editor)', 'editor', 'approved', samplePdfPath, 'pdf', 'Approved for LOTUS publication.'
    ]);

    await pool.query("INSERT INTO issued_items (item_type, item_id, item_title, member_id, member_name, issue_date, notes, status) VALUES ('book', 1, 'Clean Code: A Handbook of Agile Software', 3, 'Alex Johnson', $1, 'Assigned by Admin', 'active')", [todayStr]);
    await pool.query("INSERT INTO issued_items (item_type, item_id, item_title, member_id, member_name, issue_date, notes, status) VALUES ('newspaper', 1, 'The New York Times', 4, 'Emma Watson', $1, 'Assigned by Admin', 'active')", [todayStr]);

    console.log('[DB] LOTUS database seeding completed successfully!');
}

initDatabase();

module.exports = pool;
