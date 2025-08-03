
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

// In-memory user store (for demo only; use DB in production)
const users = {};
// In-memory test history store: { email: [ { date, bilirubin, location } ] }
const testHistory = {};

const app = express();
// Allow all origins and handle preflight for CORS (fixes network errors on cloud hosts)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(bodyParser.json());

// Serve static files (login.html, main.html, history.html, etc.)
app.use(express.static(__dirname));

// Always serve login.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Remove duplicate root route above

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
    const user = users[email];
    if (!user) {
        return res.status(400).json({ success: false, error: 'User not found.' });
    }
    if (!user.verified) {
        return res.status(400).json({ success: false, error: 'Account not verified.' });
    }
    if (user.password === password) {
        return res.json({ success: true });
    } else {
        return res.status(400).json({ success: false, error: 'Incorrect password.' });
    }
});

app.post('/api/register', async (req, res) => {
    const { email, password, name, sex, ageYears, ageMonths, history } = req.body;
    if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Invalid email or password.' });
    }
    if (users[email]) {
        return res.status(400).json({ error: 'User already exists.' });
    }
    // Generate unique ID
    const uniqueId = crypto.randomBytes(6).toString('hex');
    // Store user (not verified yet)
    users[email] = {
        email,
        password, // In production, hash this!
        name,
        sex,
        ageYears,
        ageMonths,
        history,
        uniqueId,
        verified: false
    };
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
    // Send verification email
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

// Account verification endpoint
app.post('/api/verify', (req, res) => {
    const { email, uniqueId } = req.body;
    const user = users[email];
    if (!user) {
        return res.status(400).json({ error: 'User not found.' });
    }
    if (user.verified) {
        return res.json({ verified: true, name: user.name });
    }
    if (user.uniqueId === uniqueId) {
        user.verified = true;
        return res.json({ verified: true, name: user.name });
    } else {
        return res.status(400).json({ error: 'Invalid verification ID.' });
    }
});

// Check if user is verified (for login)
app.post('/api/check-verified', (req, res) => {
    const { email } = req.body;
    const user = users[email];
    if (user && user.verified) {
        return res.json({ verified: true, name: user.name });
    } else {
        return res.json({ verified: false });
    }
});


// Endpoint to send test results and nearest hospital to user
app.post('/api/send-results', async (req, res) => {
    const { name, email, bilirubin, location, severity, action, ageGroup, ageYears, ageMonths } = req.body;
    if (!email || !bilirubin || !location) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Store test result in history
    if (!testHistory[email]) testHistory[email] = [];
    testHistory[email].push({
        date: new Date().toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        bilirubin,
        location
    });

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

// Endpoint to get test history for a user
app.post('/api/history', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required.' });
    const history = testHistory[email] || [];
    res.json({ success: true, history });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
