const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./src/db'); 

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'lotus_library_secret_key_2026';

app.use(cors());
// 100MB Payload limit to allow large Base64 PDFs and Cover Image uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

function formatDate(d = new Date()) {
    return d.toISOString().split('T')[0];
}

// ==========================================
// 1. AUTHENTICATION & PASSWORD MANAGEMENT
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        let query = 'SELECT * FROM users WHERE email = $1';
        let params = [email.trim().toLowerCase()];

        if (role) {
            query += ' AND role = $2';
            params.push(role);
        }

        const { rows } = await db.query(query, params);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (user.status === 'blocked') {
            return res.status(403).json({ success: false, message: 'Account is BLOCKED. Contact LOTUS Administrator.' });
        }

        const isValid = bcrypt.compareSync(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name, email: user.email, membership_id: user.membership_id },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: {
                id: user.id,
                membership_id: user.membership_id,
                role: user.role,
                name: user.name,
                email: user.email,
                phone: user.phone,
                status: user.status
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        if (!email || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email and new password are required' });
        }

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        const user = rows[0];
        if (!user) {
            return res.status(404).json({ success: false, message: 'User account not found' });
        }

        if (oldPassword) {
            const isValid = bcrypt.compareSync(oldPassword, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            }
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);

        res.json({ success: true, message: 'Password updated and encrypted successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/auth/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await db.query('SELECT id, membership_id, role, name, email, phone, status, created_at FROM users WHERE id = $1', [decoded.id]);
        const user = rows[0];
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token invalid or expired' });
    }
});

// ==========================================
// 2. E-BOOK MANAGEMENT & ADMIN VISIBILITY
// ==========================================
app.get('/api/books', async (req, res) => {
    try {
        const { q, category, role } = req.query;
        let sql = `
            SELECT b.*, c.name as category_name, c.code as category_code
            FROM books b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (role !== 'admin') {
            sql += ' AND b.is_visible = 1';
        }

        if (q) {
            const searchPattern = `%${q.trim()}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
            let pIdx = params.length - 3;
            sql += ` AND (b.title ILIKE $${pIdx} OR b.author ILIKE $${pIdx+1} OR b.isbn ILIKE $${pIdx+2} OR b.publisher ILIKE $${pIdx+3})`;
        }

        if (category) {
            params.push(category);
            sql += ` AND b.category_id = $${params.length}`;
        }

        sql += ` ORDER BY b.id DESC`;

        const { rows: books } = await db.query(sql, params);
        res.json({ success: true, count: books.length, books });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/books/:id', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT b.*, c.name as category_name 
            FROM books b 
            LEFT JOIN categories c ON b.category_id = c.id 
            WHERE b.id = $1
        `, [req.params.id]);
        
        const book = rows[0];
        if (!book) return res.status(404).json({ success: false, message: 'E-Book not found' });
        res.json({ success: true, book });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/books', async (req, res) => {
    try {
        const { title, author, isbn, category_id, publisher, rack_no, cover_image, ebook_url, ebook_preview, is_visible } = req.body;
        if (!title || !author || !isbn) {
            return res.status(400).json({ success: false, message: 'Book Title, Author, and ISBN are required' });
        }

        const { rows: existingRows } = await db.query('SELECT id FROM books WHERE isbn = $1', [isbn.trim()]);
        if (existingRows.length > 0) {
            return res.status(400).json({ success: false, message: 'An E-Book with this ISBN already exists' });
        }

        const cover = cover_image || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80';
        const pdfUrl = ebook_url || '/pdf-sample.pdf';
        const preview = ebook_preview || `CHAPTER 1: Introduction to ${title}\n\nWelcome to the digital edition of ${title} by ${author}. Read online inside LOTUS Library Vault.`;
        const visibleFlag = is_visible !== undefined ? (is_visible ? 1 : 0) : 1;

        const { rows } = await db.query(`
            INSERT INTO books (title, author, isbn, category_id, publisher, rack_no, cover_image, is_ebook, ebook_url, ebook_preview, is_visible, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, 'available') RETURNING id
        `, [title.trim(), author.trim(), isbn.trim(), category_id || null, publisher || 'LOTUS Press', rack_no || 'E-Vault A-1', cover, pdfUrl, preview, visibleFlag]);
        
        res.json({ success: true, message: 'E-Book added successfully to LOTUS Vault', bookId: rows[0].id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/books/:id/visibility', async (req, res) => {
    try {
        const { is_visible } = req.body;
        const bookId = req.params.id;
        const visibleVal = is_visible ? 1 : 0;
        await db.query('UPDATE books SET is_visible = $1 WHERE id = $2', [visibleVal, bookId]);
        res.json({
            success: true,
            message: `Book visibility updated: ${visibleVal === 1 ? 'SHOWING in catalog' : 'HIDDEN from catalog'}`,
            is_visible: visibleVal
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/books/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM books WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'E-Book removed from catalog' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 3. DAILY NEWSPAPER MODULE
// ==========================================
app.get('/api/newspapers', async (req, res) => {
    try {
        const { date, q } = req.query;
        let sql = 'SELECT * FROM newspapers WHERE 1=1';
        const params = [];

        if (date) {
            params.push(date);
            sql += ` AND publish_date = $${params.length}`;
        }

        if (q) {
            const searchPattern = `%${q.trim()}%`;
            params.push(searchPattern, searchPattern);
            let pIdx = params.length - 1;
            sql += ` AND (title ILIKE $${pIdx} OR publisher ILIKE $${pIdx+1})`;
        }

        sql += ' ORDER BY publish_date DESC, id DESC';

        const { rows: newspapers } = await db.query(sql, params);
        res.json({ success: true, count: newspapers.length, newspapers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/newspapers', async (req, res) => {
    try {
        const { title, file_url, publish_date } = req.body;
        if (!title || !file_url) {
            return res.status(400).json({ success: false, message: 'Newspaper Name and PDF file URL are required' });
        }

        const pubDate = publish_date || formatDate();

        const { rows } = await db.query(`
            INSERT INTO newspapers (title, publisher, publish_date, language, edition, file_url, description)
            VALUES ($1, 'Daily Press', $2, 'English', 'Daily Issue', $3, 'Uploaded daily newspaper issue.') RETURNING id
        `, [title.trim(), pubDate, file_url]);
        
        res.json({ success: true, message: `Newspaper '${title}' uploaded successfully for ${pubDate}`, id: rows[0].id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/newspapers/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM newspapers WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Newspaper entry removed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 4. NOTES & RESEARCH MODULE
// ==========================================
app.get('/api/notes', async (req, res) => {
    try {
        const { status, author_id, role } = req.query;
        let sql = 'SELECT n.*, u.name as author_full_name FROM notes n JOIN users u ON n.author_id = u.id WHERE 1=1';
        const params = [];

        if (role === 'admin') {
            if (status) {
                params.push(status);
                sql += ` AND n.status = $${params.length}`;
            }
        } else {
            if (author_id) {
                params.push(author_id);
                sql += ` AND (n.status = 'approved' OR n.author_id = $${params.length})`;
            } else {
                sql += " AND n.status = 'approved'";
            }
        }

        sql += ' ORDER BY n.id DESC';

        const { rows: notes } = await db.query(sql, params);
        res.json({ success: true, count: notes.length, notes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { title, content, category, author_id, file_url, file_type } = req.body;
        if (!title || !content || !author_id) {
            return res.status(400).json({ success: false, message: 'Title, Content, and Author are required' });
        }

        const { rows: authorRows } = await db.query('SELECT id, name, role FROM users WHERE id = $1', [author_id]);
        const author = authorRows[0];
        if (!author) return res.status(404).json({ success: false, message: 'Author user not found' });

        const noteStatus = author.role === 'admin' ? 'approved' : 'pending';
        const fUrl = file_url || null;
        const fType = file_type || (file_url ? 'pdf' : 'none');

        const { rows } = await db.query(`
            INSERT INTO notes (title, content, category, author_id, author_name, author_role, status, file_url, file_type, admin_feedback)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
        `, [title.trim(), content.trim(), category || 'General Research', author.id, author.name, author.role, noteStatus, fUrl, fType, noteStatus === 'approved' ? 'Auto-published by Admin' : null]);

        const msg = noteStatus === 'approved'
            ? 'Note published successfully!'
            : 'Note submitted successfully! It is currently PENDING review by LOTUS Admin before being published.';

        res.json({ success: true, message: msg, noteId: rows[0].id, status: noteStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/notes/:id/status', async (req, res) => {
    try {
        const { status, admin_feedback } = req.body;
        const noteId = req.params.id;

        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid note status' });
        }

        const { rows: noteRows } = await db.query('SELECT * FROM notes WHERE id = $1', [noteId]);
        if (noteRows.length === 0) return res.status(404).json({ success: false, message: 'Note not found' });

        await db.query(`
            UPDATE notes SET status = $1, admin_feedback = $2
            WHERE id = $3
        `, [status, admin_feedback || `Status updated to ${status.toUpperCase()} by Admin`, noteId]);

        res.json({ success: true, message: `Note status updated to ${status.toUpperCase()}`, status });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Note deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 5. MEMBER DIRECTORY, EDIT & ADMIN PASSWORD RESET
// ==========================================
app.get('/api/members', async (req, res) => {
    try {
        const { q, role, status } = req.query;
        let sql = `
            SELECT u.id, u.membership_id, u.role, u.name, u.email, u.phone, u.address, u.status, u.created_at,
                   (SELECT COUNT(*) FROM notes WHERE author_id = u.id) as total_notes,
                   (SELECT COUNT(*) FROM issued_items WHERE member_id = u.id AND status = 'active') as active_issues
            FROM users u
            WHERE 1=1
        `;
        const params = [];

        if (q) {
            const searchPattern = `%${q.trim()}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
            let pIdx = params.length - 3;
            sql += ` AND (u.name ILIKE $${pIdx} OR u.email ILIKE $${pIdx+1} OR u.membership_id ILIKE $${pIdx+2} OR u.phone ILIKE $${pIdx+3})`;
        }

        if (role) {
            params.push(role);
            sql += ` AND u.role = $${params.length}`;
        }

        if (status) {
            params.push(status);
            sql += ` AND u.status = $${params.length}`;
        }

        sql += ` ORDER BY u.id DESC`;

        const { rows: members } = await db.query(sql, params);
        res.json({ success: true, members });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/members/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, membership_id, role, name, email, phone, address, status, created_at FROM users WHERE id = $1', [req.params.id]);
        const member = rows[0];
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
        res.json({ success: true, member });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/members', async (req, res) => {
    try {
        const { name, email, phone, address, role, password } = req.body;
        if (!name || !email || !phone || !address) {
            return res.status(400).json({ success: false, message: 'Name, Email, Phone, and Address are required' });
        }

        const { rows: countRows } = await db.query('SELECT COUNT(*) as count FROM users');
        const count = parseInt(countRows[0].count, 10);
        const prefix = role === 'admin' ? 'LOTUS-ADM' : (role === 'editor' ? 'LOTUS-EDT' : 'LOTUS-MEM');
        const membershipId = `${prefix}-${String(count + 101).padStart(3, '0')}`;

        const passHash = bcrypt.hashSync(password || 'member123', 10);
        const userRole = role || 'member';

        const { rows } = await db.query(`
            INSERT INTO users (membership_id, role, name, email, phone, address, password_hash, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id
        `, [membershipId, userRole, name.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(), passHash]);

        res.json({
            success: true,
            message: 'User registered successfully',
            member: { id: rows[0].id, membership_id: membershipId, name, email, role: userRole }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: 'Email or Membership ID already exists' });
    }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        const { name, email, phone, address, role, status } = req.body;
        const memberId = req.params.id;

        if (!name || !email || !phone || !address) {
            return res.status(400).json({ success: false, message: 'Name, Email, Phone, and Address are required' });
        }

        await db.query(`
            UPDATE users SET name = $1, email = $2, phone = $3, address = $4, role = $5, status = $6
            WHERE id = $7
        `, [name.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(), role || 'member', status || 'active', memberId]);

        res.json({ success: true, message: 'Member details updated successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.post('/api/members/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        const memberId = req.params.id;

        if (!newPassword || newPassword.trim().length < 4) {
            return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
        }

        const { rows: userRows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [memberId]);
        const user = userRows[0];
        if (!user) return res.status(404).json({ success: false, message: 'User account not found' });

        const newHash = bcrypt.hashSync(newPassword.trim(), 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, memberId]);

        res.json({ success: true, message: `Password for ${user.name} reset and encrypted successfully!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/members/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'blocked'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true, message: `Member account status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/members/:id', async (req, res) => {
    try {
        const { rows: userRows } = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
        const user = userRows[0];
        if (user && user.role === 'admin') {
            return res.status(400).json({ success: false, message: 'Cannot delete primary Admin account' });
        }

        await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Member account deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/users/:id/profile', async (req, res) => {
    try {
        const { phone, address, profile_photo } = req.body;
        const userId = req.params.id;

        const { rows: userRows } = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

        const updates = [];
        const vals = [];
        let i = 1;
        if (phone !== undefined) { updates.push(`phone = $${i++}`); vals.push(phone); }
        if (address !== undefined) { updates.push(`address = $${i++}`); vals.push(address); }
        if (profile_photo !== undefined) { updates.push(`profile_photo = $${i++}`); vals.push(profile_photo); }
        
        if (updates.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });

        vals.push(userId);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, vals);

        const { rows: updatedRows } = await db.query('SELECT id, name, email, phone, address, role, membership_id, status, profile_photo FROM users WHERE id = $1', [userId]);
        res.json({ success: true, message: 'Profile updated successfully!', user: updatedRows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 6. ITEM ISSUING SYSTEM (BOOK & NEWSPAPER ALLOCATION)
// ==========================================
app.get('/api/issued-items', async (req, res) => {
    try {
        const { member_id, status } = req.query;
        let sql = 'SELECT * FROM issued_items WHERE 1=1';
        const params = [];

        if (member_id) {
            params.push(member_id);
            sql += ` AND member_id = $${params.length}`;
        }

        if (status) {
            params.push(status);
            sql += ` AND status = $${params.length}`;
        }

        sql += ' ORDER BY id DESC';

        const { rows: items } = await db.query(sql, params);
        res.json({ success: true, count: items.length, items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/issued-items', async (req, res) => {
    try {
        const { item_type, item_id, member_id, issue_date, notes } = req.body;
        if (!item_type || !item_id || !member_id) {
            return res.status(400).json({ success: false, message: 'Item Type, Item, and Member are required' });
        }

        const { rows: memberRows } = await db.query('SELECT id, name FROM users WHERE id = $1', [member_id]);
        const member = memberRows[0];
        if (!member) return res.status(404).json({ success: false, message: 'Target Member not found' });

        let itemTitle = '';
        if (item_type === 'book') {
            const { rows: bookRows } = await db.query('SELECT title FROM books WHERE id = $1', [item_id]);
            const book = bookRows[0];
            if (!book) return res.status(404).json({ success: false, message: 'Target E-Book not found' });
            itemTitle = book.title;
        } else {
            const { rows: paperRows } = await db.query('SELECT title FROM newspapers WHERE id = $1', [item_id]);
            const paper = paperRows[0];
            if (!paper) return res.status(404).json({ success: false, message: 'Target Newspaper not found' });
            itemTitle = paper.title;
        }

        const issDate = issue_date || formatDate();

        const { rows } = await db.query(`
            INSERT INTO issued_items (item_type, item_id, item_title, member_id, member_name, issue_date, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id
        `, [item_type, item_id, itemTitle, member.id, member.name, issDate, notes || 'Issued by Admin']);

        res.json({
            success: true,
            message: `Successfully issued '${itemTitle}' to ${member.name}`,
            issueId: rows[0].id
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/issued-items/:id/return', async (req, res) => {
    try {
        await db.query("UPDATE issued_items SET status = 'returned' WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: 'Item marked as returned' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 7. CATEGORIES & REPORTS
// ==========================================
app.get('/api/categories', async (req, res) => {
    try {
        const { rows: categories } = await db.query(`
            SELECT c.*, COUNT(b.id) as book_count 
            FROM categories c 
            LEFT JOIN books b ON b.category_id = c.id 
            GROUP BY c.id 
            ORDER BY c.name ASC
        `);
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { name, code, description } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category Name is required' });
        }

        const catName = name.trim();
        const catCode = code && code.trim() !== '' 
            ? code.trim().toUpperCase() 
            : catName.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20);

        const { rows: existing } = await db.query('SELECT id FROM categories WHERE UPPER(code) = $1 OR UPPER(name) = $2', [catCode, catName.toUpperCase()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: `Category '${catName}' already exists` });
        }

        const { rows } = await db.query('INSERT INTO categories (name, code, description) VALUES ($1, $2, $3) RETURNING id', [catName, catCode, description ? description.trim() : 'Book category']);
        res.json({ 
            success: true, 
            message: `Category '${catName}' added successfully`, 
            category: { id: rows[0].id, name: catName, code: catCode } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        const { rows: countRows } = await db.query('SELECT COUNT(*) as count FROM books WHERE category_id = $1', [req.params.id]);
        const count = parseInt(countRows[0].count, 10);
        if (count > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete category. ${count} E-Books are currently assigned to it.` });
        }
        await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/reports/dashboard', async (req, res) => {
    try {
        const totalEbooks = parseInt((await db.query('SELECT COUNT(*) as count FROM books WHERE is_visible = 1')).rows[0].count, 10) || 0;
        const hiddenEbooks = parseInt((await db.query('SELECT COUNT(*) as count FROM books WHERE is_visible = 0')).rows[0].count, 10) || 0;
        const todayStr = formatDate();
        const todayNewspapers = parseInt((await db.query("SELECT COUNT(*) as count FROM newspapers WHERE publish_date = $1", [todayStr])).rows[0].count, 10) || 0;
        const totalNotes = parseInt((await db.query("SELECT COUNT(*) as count FROM notes WHERE status = 'approved'")).rows[0].count, 10) || 0;
        const pendingNotes = parseInt((await db.query("SELECT COUNT(*) as count FROM notes WHERE status = 'pending'")).rows[0].count, 10) || 0;
        const totalMembers = parseInt((await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'member'")).rows[0].count, 10) || 0;

        const { rows: recentBooks } = await db.query('SELECT * FROM books WHERE is_visible = 1 ORDER BY id DESC LIMIT 4');
        const { rows: todayPaperList } = await db.query('SELECT * FROM newspapers WHERE publish_date = $1 ORDER BY id DESC LIMIT 5', [todayStr]);
        const { rows: recentPendingNotes } = await db.query("SELECT * FROM notes WHERE status = 'pending' ORDER BY id DESC LIMIT 5");
        const { rows: activeIssuedItems } = await db.query("SELECT * FROM issued_items WHERE status = 'active' ORDER BY id DESC LIMIT 5");

        res.json({
            success: true,
            stats: {
                totalEbooks,
                hiddenEbooks,
                todayNewspapers,
                totalNotes,
                pendingNotes,
                totalMembers
            },
            recentBooks,
            todayPaperList,
            recentPendingNotes,
            activeIssuedItems
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT key, value FROM settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, String(value)]);
        }
        res.json({ success: true, message: 'LOTUS system configurations saved' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ success: false, message: 'API Endpoint Not Found' });
    }
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🌺 LOTUS Library System Server Running!`);
    console.log(`🌐 Application URL: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});
