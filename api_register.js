

const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('neobilitrack.db');

// Initialize tables if not exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password TEXT,
        name TEXT,
        sex TEXT,
        ageYears INTEGER,
        ageMonths INTEGER,
        history TEXT,
        uniqueId TEXT,
        verified INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS test_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        date TEXT,
        bilirubin REAL,
        location TEXT
    )`);
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static files (login.html, main.html, history.html, etc.)
app.use(express.static(__dirname));

// Serve login.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'nikhiljoshi2024@gmail.com', // replace with your Gmail
        pass: ' tpgq njpy silu wduk'     // use App Password, not your Gmail password
    }
});

// Login endpoint to check password
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, error: 'DB error.' });
        if (!user) return res.status(400).json({ success: false, error: 'User not found.' });
        if (!user.verified) return res.status(400).json({ success: false, error: 'Account not verified.' });
        if (user.password === password) {
            return res.json({ success: true });
        } else {
            return res.status(400).json({ success: false, error: 'Incorrect password.' });
        }
    });
});

app.post('/api/register', async (req, res) => {
    const { email, password, name, sex, ageYears, ageMonths, history } = req.body;
    if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Invalid email or password.' });
    }
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'DB error.' });
        if (user) return res.status(400).json({ error: 'User already exists.' });
        const uniqueId = crypto.randomBytes(6).toString('hex');
        db.run('INSERT INTO users (email, password, name, sex, ageYears, ageMonths, history, uniqueId, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [email, password, name, sex, ageYears, ageMonths, history, uniqueId, 0], async function (err2) {
                if (err2) return res.status(500).json({ error: 'DB error.' });
                // Compose all details for email
                const detailsHtml = `
                    <h2>Welcome to NeoBiliTrack!</h2>
                    <p><strong>Your unique verification ID:</strong> ${uniqueId}</p>
                    <h3>Registration Details</h3>
                    <ul>
                        <li><strong>Name:</strong> ${name || 'N/A'}</li>
                        <li><strong>Email:</strong> ${email}</li>
                        <li><strong>Sex:</strong> ${sex || 'N/A'}</li>
                        <li><strong>Age:</strong> ${(ageYears || '0')} years ${(ageMonths || '0')} months</li>
                        <li><strong>Medical History:</strong> ${history || 'N/A'}</li>
                    </ul>
                    <p>Please use the above verification ID to complete your registration.</p>
                    <br><p>Thank you for joining NeoBiliTrack!</p>
                `;
                const mailOptions = {
                    from: '"NeoBiliTrack" <your_gmail@gmail.com>',
                    to: email,
                    subject: 'NeoBiliTrack Verification Email',
                    html: detailsHtml
                };
                try {
                    await transporter.sendMail(mailOptions);
                    res.json({ success: true });
                } catch (err) {
                    res.status(500).json({ error: 'Failed to send verification email.' });
                }
            });
    });
});

// Account verification endpoint
app.post('/api/verify', (req, res) => {
    const { email, uniqueId } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'DB error.' });
        if (!user) return res.status(400).json({ error: 'User not found.' });
        if (user.verified) return res.json({ verified: true, name: user.name });
        if (user.uniqueId === uniqueId) {
            db.run('UPDATE users SET verified = 1 WHERE email = ?', [email], (err2) => {
                if (err2) return res.status(500).json({ error: 'DB error.' });
                return res.json({ verified: true, name: user.name });
            });
        } else {
            return res.status(400).json({ error: 'Invalid verification ID.' });
        }
    });
});

// Check if user is verified (for login)
app.post('/api/check-verified', (req, res) => {
    const { email } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ verified: false });
        if (user && user.verified) {
            return res.json({ verified: true, name: user.name });
        } else {
            return res.json({ verified: false });
        }
    });
});


// Endpoint to send test results and nearest hospital to user
app.post('/api/send-results', async (req, res) => {
    const { name, email, bilirubin, location, severity, action, ageGroup, ageYears, ageMonths } = req.body;
    if (!email || !bilirubin || !location) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    const date = new Date().toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    db.run('INSERT INTO test_history (email, date, bilirubin, location) VALUES (?, ?, ?, ?)',
        [email, date, bilirubin, location], async (err2) => {
            if (err2) return res.status(500).json({ error: 'DB error.' });
            // Compose email content with severity and action
            const mailOptions = {
                from: '"NeoBiliTrack" <your_gmail@gmail.com>',
                to: email,
                subject: 'NeoBiliTrack Test Results & Nearest Hospital',
                html: `
                    <h2>NeoBiliTrack Test Results</h2>
                    <p><strong>Patient Name:</strong> ${name || 'N/A'}</p>
                    <p><strong>Patient Age:</strong> ${(ageYears || '0')} years ${(ageMonths || '0')} months</p>
                    <p><strong>Bilirubin Value:</strong> ${bilirubin} mg/dL</p>
                    <p><strong>Severity:</strong> ${severity || 'N/A'}</p>
                    <p><strong>Recommended Action:</strong> ${action || 'N/A'}</p>
                    <p><strong>Nearest Hospital Location:</strong> ${location}</p>
                    <p>
                        <a href="https://www.google.com/maps/search/hospital+near+${encodeURIComponent(location)}" target="_blank">View Hospitals on Google Maps</a>
                    </p>
                    ${severity === 'Severe/Critical' ? '<p style="color:#d8000c;"><b>Immediate medical attention is recommended.</b></p>' : ''}
                    <br><p>Thank you for using NeoBiliTrack.</p>
                `
            };
            try {
                await transporter.sendMail(mailOptions);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: 'Failed to send results email.' });
            }
        });
});

// Endpoint to get test history for a user
app.post('/api/history', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required.' });
    db.all('SELECT date, bilirubin, location FROM test_history WHERE email = ? ORDER BY id DESC', [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: 'DB error.' });
        res.json({ success: true, history: rows });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
