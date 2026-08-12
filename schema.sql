-- ============================================================
-- LOTUS Library System Database Schema
-- Multi-Role Architecture with Item Issuing & User Password Reset
-- Compatible with MySQL / MariaDB / SQLite
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_id VARCHAR(50) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'member')),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER,
    publisher VARCHAR(255),
    rack_no VARCHAR(50) DEFAULT 'Digital Vault A-1',
    cover_image TEXT,
    is_ebook INTEGER DEFAULT 1,
    ebook_url TEXT,
    ebook_preview TEXT,
    is_visible INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS newspapers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(255) DEFAULT 'Press Issue',
    publish_date DATE NOT NULL,
    language VARCHAR(50) DEFAULT 'English',
    edition VARCHAR(100) DEFAULT 'Daily Issue',
    file_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'General Research',
    author_id INTEGER NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    author_role VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    file_url TEXT,
    file_type VARCHAR(20) DEFAULT 'none' CHECK (file_type IN ('pdf', 'image', 'none')),
    admin_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS issued_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('book', 'newspaper')),
    item_id INTEGER NOT NULL,
    item_title VARCHAR(255) NOT NULL,
    member_id INTEGER NOT NULL,
    member_name VARCHAR(100) NOT NULL,
    issue_date DATE NOT NULL,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'returned')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initial Default Settings
INSERT OR IGNORE INTO settings (key, value) VALUES
('library_name', 'LOTUS Library System'),
('contact_email', 'admin@lotus.com'),
('allow_member_notes', '1'),
('auto_approve_editor_notes', '0');
