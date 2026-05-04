// Load .env file if exists
try {
    const envPath = require('path').join(__dirname, '.env');
    if (require('fs').existsSync(envPath)) {
        const envContent = require('fs').readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...vals] = line.split('=');
            if (key && vals.length > 0 && !key.trim().startsWith('#')) {
                process.env[key.trim()] = vals.join('=').trim();
            }
        });
    }
} catch(e) {}
const express = require('express');
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
            const mimeType = express.static.mime.lookup(path);
            res.setHeader('Content-Type', mimeType + '; charset=utf-8');
        }
    }
}));

const CONFIG_PATH = path.join(__dirname, '.credentials.json');
const LOG_PATH = path.join(__dirname, 'operations.log');
let sshConnection = null;
let connectionInfo = null;
let savedCreds = null; // Keep in memory for auto-reconnect
let commandHistory = [];
const MAX_HISTORY = 100;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e1ectoN3t';

// ===== Blocked dangerous commands =====
const BLOCKED_PATTERNS = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\binit\s+[06]\b/i,
    /\b:\(\)\s*\{\s*:\|:\s*&\s*\}/,  // fork bomb
    /\bchmod\s+-R\s+777\b/i,
    />\s*\/dev\/sd/i,
    /\bdrop\s+(database|table|schema)/i,
    /\btruncate\b/i,
];

function isCommandSafe(cmd) {
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(cmd)) return false;
    }
    return true;
}

// ===== Operation Logger =====
function logOperation(action, detail) {
    const entry = `[${new Date().toISOString()}] ${action}: ${detail}\n`;
    try { fs.appendFileSync(LOG_PATH, entry); } catch {}
    console.log('📋 ' + action + ': ' + detail);
}

// ===== Credentials =====
function xorEncrypt(str) {
    const key = ENCRYPTION_KEY;
    const buf = Buffer.from(str, 'utf8');
    const result = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
        result[i] = buf[i] ^ key.charCodeAt(i % key.length);
    }
    return result.toString('base64');
}

function xorDecrypt(encoded) {
    const key = ENCRYPTION_KEY;
    const buf = Buffer.from(encoded, 'base64');
    const result = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
        result[i] = buf[i] ^ key.charCodeAt(i % key.length);
    }
    return result.toString('utf8');
}

function saveCredentials(creds) {
    const encoded = {
        h: xorEncrypt(creds.host),
        p: xorEncrypt(String(creds.port)),
        u: xorEncrypt(creds.username),
        k: xorEncrypt(creds.password),
        m: creds.matrixToken ? xorEncrypt(creds.matrixToken) : null,
        v: 2, // version marker
        t: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(encoded, null, 2));
    logOperation('CREDS_SAVED', creds.username + '@' + creds.host);
}

function loadCredentials() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        // v2 format (XOR encrypted)
        if (data.v === 2) {
            return {
                host: xorDecrypt(data.h),
                port: parseInt(xorDecrypt(data.p)),
                username: xorDecrypt(data.u),
                password: xorDecrypt(data.k),
                matrixToken: data.m ? xorDecrypt(data.m) : null
            };
        }
        // Old v1 format (plain base64)
        if (data.host && data.username) {
            return {
                host: Buffer.from(data.host, 'base64').toString('utf8'),
                port: parseInt(Buffer.from(data.port, 'base64').toString('utf8')),
                username: Buffer.from(data.username, 'base64').toString('utf8'),
                password: Buffer.from(data.password, 'base64').toString('utf8')
            };
        }
        return null;
    } catch (e) { logOperation('CREDS_ERROR', e.message); return null; }
}

// ===== SSH Execution =====
function execSSH(command, timeout = 15000) {
    return new Promise((resolve, reject) => {
        if (!sshConnection) return reject(new Error('اتصال SSH برقرار نیست'));
        let output = '', stderr = '';
        let timer = setTimeout(() => reject(new Error('Timeout')), timeout);
        sshConnection.exec(command, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err); }
            stream.on('data', d => {
                const s = d.toString();
                if (s.toLowerCase().includes('[sudo] password')) {
                    if (savedCreds && savedCreds.password) stream.write(savedCreds.password + '\n');
                } else {
                    output += s;
                }
            });
            stream.stderr.on('data', d => {
                const s = d.toString();
                if (s.toLowerCase().includes('[sudo] password')) {
                    if (savedCreds && savedCreds.password) stream.write(savedCreds.password + '\n');
                } else {
                    stderr += s;
                }
            });
            stream.on('close', code => { clearTimeout(timer); resolve({ output: output.trim(), stderr: stderr.trim(), exitCode: code }); });
        });
    });
}

// Helper: run a command with sudo password pre-piped via /bin/bash -c
function execSudoSSH(sudoArgs, timeout = 15000) {
    if (!savedCreds || !savedCreds.password) return execSSH(`sudo -S ${sudoArgs}`, timeout);
    // Use printf to avoid echo newline issues; wrap in bash to handle pipes properly
    const escaped = savedCreds.password.replace(/"/g, '\\"');
    const wrapped = `printf '%s\\n' "${escaped}" | sudo -S -p '' ${sudoArgs}`;
    return execSSH(wrapped, timeout);
}

// Helper: run psql query with multiple fallback methods
async function execPsql(query, dbname = '', timeout = 15000) {
    const db = dbname ? `-d ${dbname}` : '';
    const methods = [
        // Method 1: pgbouncer port (no auth needed for local)
        `psql -U synapse -h 127.0.0.1 -p 6432 ${db} -t -A -c "${query}" 2>/dev/null`,
        // Method 2: direct postgres via sudo with printf pipe
        savedCreds ? `printf '%s\\n' "${(savedCreds.password||'').replace(/"/g,'\\"')}" | sudo -S -p '' -u postgres psql -p 5432 ${db} -t -A -c "${query}" 2>/dev/null` : null,
        // Method 3: psql on postgres port via PGPASSWORD env (for synapse user)
        `PGPASSWORD='' psql -U synapse -h 127.0.0.1 -p 5432 ${db} -t -A -c "${query}" 2>/dev/null`,
        // Method 4: psql socket (if kim has pg access)
        `psql -U postgres -p 5432 ${db} -t -A -c "${query}" 2>/dev/null`,
    ].filter(Boolean);

    for (const cmd of methods) {
        try {
            const result = await execSSH(cmd, timeout);
            const out = result.output || result.stderr || '';
            // If we got a number, success!
            if (/^\s*\d+/.test(out)) return result;
            // If error mentions auth fail, try next method
            if (out.includes('password authentication failed') || out.includes('permission denied') || out.includes('a password is required')) continue;
            // If we got something useful, return it
            if (out && !out.includes('error') && !out.includes('Error')) return result;
        } catch {}
    }
    return { output: '', stderr: 'all psql methods failed', exitCode: 1 };
}

// ===== SSH Connect with auto-reconnect =====
function connectSSH(creds) {
    return new Promise((resolve, reject) => {
        if (sshConnection) { try { sshConnection.end(); } catch {} sshConnection = null; }
        const conn = new Client();
        conn.on('ready', () => {
            sshConnection = conn;
            connectionInfo = { host: creds.host, port: creds.port, username: creds.username };
            savedCreds = creds;
            logOperation('SSH_CONNECTED', creds.username + '@' + creds.host + ':' + creds.port);
            resolve({ success: true });
        });
        conn.on('error', err => {
            sshConnection = null;
            logOperation('SSH_ERROR', err.message);
            reject(err);
        });
        conn.on('close', () => {
            sshConnection = null;
            logOperation('SSH_CLOSED', 'Connection closed');
            // Auto-reconnect after 5s
            if (savedCreds) {
                setTimeout(() => {
                    if (!sshConnection && savedCreds) {
                        logOperation('SSH_RECONNECT', 'Attempting auto-reconnect...');
                        connectSSH(savedCreds).catch(() => {});
                    }
                }, 5000);
            }
        });
        conn.connect({
            host: creds.host, port: parseInt(creds.port) || 22,
            username: creds.username, password: creds.password,
            readyTimeout: 10000, keepaliveInterval: 20000, keepaliveCountMax: 3,
            algorithms: {
                kex: ['ecdh-sha2-nistp256','ecdh-sha2-nistp384','ecdh-sha2-nistp521','diffie-hellman-group-exchange-sha256','diffie-hellman-group14-sha256','diffie-hellman-group14-sha1'],
                cipher: ['aes128-ctr','aes192-ctr','aes256-ctr','aes128-gcm@openssh.com','aes256-gcm@openssh.com'],
            }
        });
    });
}

// ===== Helper: Get User Permissions =====
async function getUserPermissions() {
    if (!sshConnection || !connectionInfo) return { role: 'Unknown', details: '' };
    if (connectionInfo.username === 'root') return { role: 'Root Admin', details: 'ALL' };
    if (connectionInfo.permissions) return connectionInfo.permissions; // cached
    
    try {
        const result = await execSudoSSH('-l', 10000);
        const out = (result.output || result.stderr || '').replace(savedCreds.password, '***');
        if (out.includes('not allowed to run sudo') || out.includes('may not run sudo')) {
            connectionInfo.permissions = { role: 'Limited User', details: 'No sudo access' };
        } else if (out.includes('(ALL : ALL) ALL') || out.includes('(ALL) NOPASSWD: ALL') || out.includes('(ALL) ALL')) {
            connectionInfo.permissions = { role: 'Admin', details: 'Full sudo access' };
        } else {
            const lines = out.split('\n');
            const perms = [];
            let capture = false;
            for (const line of lines) {
                if (line.includes('may run the following commands')) { capture = true; continue; }
                if (capture && line.trim() && !line.startsWith('User ')) perms.push(line.trim());
            }
            if (perms.length > 0) {
                connectionInfo.permissions = { role: 'Partial Admin', details: perms.join(', ') };
            } else {
                connectionInfo.permissions = { role: 'Limited User', details: 'Unknown sudo output' };
            }
        }
    } catch {
        connectionInfo.permissions = { role: 'Limited User', details: 'Error checking permissions' };
    }
    return connectionInfo.permissions;
}

// ===== Interpretations =====
function getInterpretation(cmd, out) {
    if (cmd.includes('uptime')) {
        const m = out.match(/load average:\s*([\d.]+)/);
        if (!m) return '❓';
        const la = parseFloat(m[1]);
        if (la > 8) return '🔴 ' + la + '/8 (Critical)';
        if (la > 6) return '🟡 ' + la + '/8 (High)';
        return '🟢 ' + la + '/8 (Normal)';
    }
    if (cmd.includes('free')) {
        const m = out.match(/Mem:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
        if (!m) return '❓';
        const avail = m[6]; const n = parseFloat(avail);
        if (avail.includes('Mi') && n < 1000) return '🔴 ' + avail + ' (Critical)';
        if (avail.includes('Gi') && n < 2) return '🟡 ' + avail + ' (Low)';
        return '🟢 ' + avail + ' (OK)';
    }
    if (cmd.includes('df ')) {
        const m = out.match(/(\d+)%\s+\/$/m);
        if (!m) return '❓';
        const p = parseInt(m[1]);
        if (p > 80) return '🔴 ' + p + '% (Critical)';
        if (p > 65) return '🟡 ' + p + '% (Warning)';
        return '🟢 ' + p + '% (OK)';
    }
    if (cmd.includes('pg_stat_activity')) {
        const m = out.match(/(\d+)/); if (!m) return '❓';
        const c = parseInt(m[1]);
        if (c > 180) return '🔴 ' + c + '/200 (Saturation)';
        if (c > 140) return '🟡 ' + c + '/200 (High)';
        return '🟢 ' + c + '/200 (Normal)';
    }
    if (cmd.includes('destination_rooms')) {
        const m = out.match(/(\d+)/); if (!m) return '❓';
        const c = parseInt(m[1]);
        if (c > 2000) return '🔴 ' + c + ' (Heavy Queue)';
        if (c > 800) return '🟡 ' + c + ' (High Queue)';
        return '🟢 ' + c + ' (Normal)';
    }
    if (cmd.includes('systemctl status')) {
        const down = (out.match(/inactive|failed|dead/gi) || []).length;
        if (down > 0) return '🔴 ' + down + ' Down';
        return '🟢 All Active';
    }
    if (cmd.includes('journalctl') || cmd.includes('log')) {
        const errs = (out.match(/error|ERROR|FATAL|Exception/gi) || []).length;
        if (errs > 0) return '🔴 ' + errs + ' Errors';
        return '🟢 Clean';
    }
    return out.includes('ERROR') || out.includes('FATAL') ? '🔴 Error' : '🟢 OK';
}

// ===== API: Connect =====
app.post('/api/connect', async (req, res) => {
    const creds = req.body;
    try {
        await connectSSH(creds);
        if (req.body.save) saveCredentials(creds);
        
        const perms = await getUserPermissions();
        res.json({ success: true, host: creds.host, username: creds.username, permissions: perms });
    } catch (err) {
        res.status(401).json({ success: false, message: 'اتصال شکست خورد: ' + err.message });
    }
});

// ===== API: Auto-connect =====
app.post('/api/auto-connect', async (req, res) => {
    const creds = loadCredentials();
    if (!creds) return res.json({ success: false, message: 'اطلاعات ذخیره‌شده‌ای نیست' });
    try {
        await connectSSH(creds);
        res.json({ success: true, host: creds.host, username: creds.username });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/saved-session', (req, res) => {
    const creds = loadCredentials();
    res.json(creds ? { exists: true, host: creds.host, port: creds.port, username: creds.username } : { exists: false });
});

// ===== API: Execute (safe) =====
app.post('/api/exec', async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ success: false, message: 'دستور خالی' });
    if (!sshConnection) return res.status(400).json({ success: false, message: 'SSH قطعه. دوباره وصل شو.' });
    if (!isCommandSafe(command)) {
        logOperation('BLOCKED_CMD', command);
        return res.status(403).json({ success: false, message: '🚫 این دستور خطرناکه و بلاک شده! برای اجرا با Server Ops هماهنگ کن.' });
    }
    try {
        logOperation('EXEC', command);
        const result = await execSSH(command);
        const output = result.output || result.stderr || '(خروجی خالی)';
        const interpretation = getInterpretation(command, output);
        // Save to history
        commandHistory.unshift({ cmd: command, output: output.substring(0, 500), interpretation, time: new Date().toISOString(), exitCode: result.exitCode });
        if (commandHistory.length > MAX_HISTORY) commandHistory.pop();
        res.json({ success: true, output, stderr: result.stderr, exitCode: result.exitCode, interpretation });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== API: Health =====
app.get('/api/health', async (req, res) => {
    if (!sshConnection) return res.status(400).json({ success: false, message: 'SSH قطع' });
    try {
        // Run ALL commands in a single SSH channel to avoid MaxSessions limit
        // Each section separated by a unique delimiter
        const pass = (savedCreds.password || '').replace(/'/g, "'\\''");
        const bigCmd = [
            'uptime',
            'free -h',
            'df -h /',
            // Try pgbouncer first, then direct postgres socket. Use sudo if needed.
            `psql -w -U synapse -h 127.0.0.1 -p 6432 -t -A -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || psql -w -U synapse -h 127.0.0.1 -p 5432 -t -A -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || printf '%s\\n' '${pass}' | sudo -S -u postgres psql -p 5432 -t -A -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || echo "PG_FAIL"`,
            `psql -w -U synapse -h 127.0.0.1 -p 6432 -d synapse -t -A -c "SELECT COUNT(*) FROM destination_rooms;" 2>/dev/null || psql -w -U synapse -h 127.0.0.1 -p 5432 -d synapse -t -A -c "SELECT COUNT(*) FROM destination_rooms;" 2>/dev/null || printf '%s\\n' '${pass}' | sudo -S -u postgres psql -d synapse -p 5432 -t -A -c "SELECT COUNT(*) FROM destination_rooms;" 2>/dev/null || echo "FED_FAIL"`,
            `systemctl is-active matrix-synapse nginx postgresql pgbouncer redis-server 2>/dev/null | tr '\\n' ','`,
        ].map((cmd, i) => `echo "---SEC${i}---"; ${cmd}`).join('; ');

        console.log('HEALTH API: Executing combined SSH command...');
        const combined = await execSSH(`bash -c '${bigCmd.replace(/'/g, "'\\''")}' 2>/dev/null`, 30000);
        console.log('HEALTH API: Combined SSH command finished. Output length:', (combined.output||'').length);
        const raw = combined.output || combined.stderr || '';

        // Parse sections
        function getSection(idx) {
            const marker = `---SEC${idx}---`;
            const next = `---SEC${idx + 1}---`;
            const start = raw.indexOf(marker);
            if (start === -1) return '';
            const end = raw.indexOf(next, start);
            return (end === -1 ? raw.slice(start + marker.length) : raw.slice(start + marker.length, end)).trim();
        }

        const uptimeOut = getSection(0);
        const freeOut   = getSection(1);
        const dfOut     = getSection(2);
        const pgOut     = getSection(3);
        const fedOut    = getSection(4);
        const svcOut    = getSection(5);

        const uptime    = { output: uptimeOut };
        const free      = { output: freeOut };
        const df        = { output: dfOut };
        const pgConn    = { output: pgOut.includes('PG_FAIL') ? '' : pgOut };
        const fedQ      = { output: fedOut.includes('FED_FAIL') ? '' : fedOut };
        const svcStatus = { output: svcOut };

        const loadM = uptime.output.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        const diskM = df.output.match(/(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+\/$/m);
        const pgM = pgConn.output.match(/(\d+)/);
        const fedM = fedQ.output.match(/(\d+)/);
        const freeM = free.output.match(/Mem:\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+\S+\s+(\S+)/);
        const swapM = free.output.match(/Swap:\s+(\S+)\s+(\S+)/);
        // systemctl is-active returns "active" or "inactive" per line, joined with comma
        const svcParts = svcStatus.output.split(',').map(s => s.trim()).filter(Boolean);
        const svcUp = svcParts.filter(s => s === 'active').length;
        const svcDown = svcParts.filter(s => s === 'inactive' || s === 'failed' || s === 'dead').length;

        const health = {
            cpuLoad: loadM ? [parseFloat(loadM[1]), parseFloat(loadM[2]), parseFloat(loadM[3])] : null,
            diskTotal: diskM ? diskM[1] : null,
            diskUsed: diskM ? diskM[2] : null,
            diskPercent: diskM ? parseInt(diskM[4]) : null,
            pgConnections: pgM ? parseInt(pgM[1]) : null,
            fedQueue: fedM ? parseInt(fedM[1]) : null,
            ramTotal: freeM ? freeM[1] : null,
            ramUsed: freeM ? freeM[2] : null,
            ramAvail: freeM ? freeM[3] : null,
            swapTotal: swapM ? swapM[1] : null,
            swapUsed: swapM ? swapM[2] : null,
            servicesUp: svcUp, servicesDown: svcDown,
            raw: { uptime: uptime.output, free: free.output, df: df.output, pg: pgConn.output, fed: fedQ.output, svc: svcStatus.output }
        };

        // Diagnosis
        const issues = [];
        const la = health.cpuLoad ? health.cpuLoad[0] : 0;
        if (la > 8) issues.push({ level: 'critical', i18n_key: 'diag_cpu_crit', i18n_detail_key: 'diag_cpu_crit_det', title: '🔴 بار CPU بحرانی', detail: 'Load: ' + la + ' - سناریو ۱ فعال. sync_workerها بررسی شوند.', prob: 95, action: 'top -bn1 | head -20' });
        else if (la > 6) issues.push({ level: 'warn', i18n_key: 'diag_cpu_warn', title: '🟡 بار CPU بالا', detail: 'Load: ' + la, prob: 60, action: 'ps aux --sort=-%cpu | head -10' });

        if (health.diskPercent > 80) issues.push({ level: 'critical', i18n_key: 'diag_disk_crit', i18n_detail_key: 'diag_disk_crit_det', title: '🔴 دیسک بحرانی', detail: health.diskPercent + '٪ - سناریو ۶', prob: 90, action: 'sudo du -sh /var/log/* | sort -hr | head -5' });
        else if (health.diskPercent > 65) issues.push({ level: 'warn', i18n_key: 'diag_disk_warn', title: '🟡 دیسک محدود', detail: health.diskPercent + '٪', prob: 40, action: 'df -h /' });

        if (health.pgConnections > 180) issues.push({ level: 'critical', i18n_key: 'diag_pg_crit', i18n_detail_key: 'diag_pg_crit_det', title: '🔴 اشباع اتصالات DB', detail: health.pgConnections + '/200 - سناریو ۳', prob: 95, action: 'sudo -u postgres psql -p 5432 -c "SELECT usename, state, count(*) FROM pg_stat_activity GROUP BY 1,2;"' });
        else if (health.pgConnections > 140) issues.push({ level: 'warn', i18n_key: 'diag_pg_warn', title: '🟡 اتصالات DB بالا', detail: health.pgConnections + '/200', prob: 55 });

        if (health.fedQueue > 2000) issues.push({ level: 'critical', i18n_key: 'diag_fed_crit', i18n_detail_key: 'diag_fed_crit_det', title: '🔴 صف Federation', detail: health.fedQueue + ' ردیف - سناریو ۴', prob: 80, action: 'درخواست DELETE FROM destination_rooms' });
        else if (health.fedQueue > 800) issues.push({ level: 'warn', i18n_key: 'diag_fed_warn', title: '🟡 صف Federation بالا', detail: health.fedQueue + ' ردیف', prob: 35 });

        if (health.servicesDown > 0) issues.push({ level: 'critical', i18n_key: 'diag_svc_crit', i18n_detail_key: 'diag_svc_crit_det', title: '🔴 سرویس خاموش!', detail: health.servicesDown + ' سرویس down - سناریو ۵', prob: 99, action: 'systemctl status matrix-synapse --no-pager' });

        if (issues.length === 0) issues.push({ level: 'ok', i18n_key: 'diag_ok', i18n_detail_key: 'diag_ok_det', title: '🟢 همه چیز عالیه! 🌸', detail: 'سرور سالمه', prob: 0 });
        issues.sort((a, b) => b.prob - a.prob);

        logOperation('HEALTH_CHECK', 'CPU:' + la + ' Disk:' + health.diskPercent + '% PG:' + health.pgConnections + ' Fed:' + health.fedQueue);
        res.json({ success: true, health, issues });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== API: Ping (connection check) =====
app.get('/api/ping', async (req, res) => {
    if (!sshConnection) return res.json({ alive: false });
    try {
        await execSSH('echo ok', 5000);
        res.json({ alive: true, info: connectionInfo });
    } catch {
        res.json({ alive: false });
    }
});

// ===== API: Command History =====
app.get('/api/history', (req, res) => {
    res.json({ history: commandHistory.slice(0, 30) });
});

// ===== API: Status =====
app.get('/api/status', async (req, res) => {
    if (!sshConnection) return res.json({ connected: false, info: null });
    const perms = await getUserPermissions();
    res.json({ connected: true, info: { ...connectionInfo, permissions: perms } });
});

// ===== API: Disconnect =====
app.post('/api/disconnect', (req, res) => {
    savedCreds = null; // Disable auto-reconnect
    if (sshConnection) { sshConnection.end(); sshConnection = null; connectionInfo = null; }
    logOperation('DISCONNECTED', 'Manual disconnect');
    res.json({ success: true });
});

// ===== API: Logs =====
app.get('/api/logs', (req, res) => {
    try {
        const logs = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).slice(-50) : [];
        res.json({ logs });
    } catch { res.json({ logs: [] }); }
});

// ===== API: Live Server Logs =====
app.post('/api/logs/live', async (req, res) => {
    if (!sshConnection) return res.status(401).json({ error: 'عدم اتصال SSH' });
    const { service, lines } = req.body;
    const n = lines || 20;
    let cmd = '';
    
    if (service === 'synapse') cmd = `sudo -S journalctl --no-pager -n ${n} -u "matrix-synapse-worker@*"`;
    else if (service === 'nginx') cmd = `sudo -S tail -n ${n} /var/log/nginx/access.log`;
    else if (service === 'postgres') cmd = `sudo -S tail -n ${n} /var/log/postgresql/postgresql-14-main.log`;
    else return res.status(400).json({ error: 'سرویس نامعتبر' });
    
    try {
        const result = await execSSH(cmd);
        res.json({ success: true, logs: result.output || result.stderr || '(خروجی خالی)' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== API: Service Action =====
app.post('/api/service/action', async (req, res) => {
    if (!sshConnection) return res.status(401).json({ error: 'عدم اتصال SSH' });
    const { service, action } = req.body;
    if (!['matrix-synapse', 'nginx', 'postgresql', 'redis-server'].includes(service)) return res.status(400).json({ error: 'سرویس نامعتبر' });
    if (!['restart', 'stop', 'start'].includes(action)) return res.status(400).json({ error: 'عملیات نامعتبر' });
    
    logOperation('SERVICE_' + action.toUpperCase(), service);
    try {
        const result = await execSudoSSH(`systemctl ${action} ${service}`);
        res.json({ success: true, output: result.output || result.stderr || 'با موفقیت انجام شد ✨' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
// ===== API: Optimize =====
app.post('/api/optimize', async (req, res) => {
    if (!sshConnection) return res.status(401).json({ error: 'عدم اتصال SSH' });
    const { action } = req.body;
    let cmd = '';

    if (action === 'clear_nginx') cmd = `bash -c 'echo "" > /var/log/nginx/access.log && echo "" > /var/log/nginx/error.log'`;
    else if (action === 'clear_postgres') cmd = `bash -c 'echo "" > /var/log/postgresql/postgresql-14-main.log'`;
    else if (action === 'clear_synapse') cmd = `bash -c 'find /var/log/matrix-synapse/ -name "*.log.*" -delete'`;
    else if (action === 'clear_journal') cmd = `journalctl --vacuum-time=3d`;
    else if (action === 'clear_ram') cmd = `sysctl -w vm.drop_caches=3`;
    else if (action === 'set_runflare_mirror') cmd = `bash -c 'sed -i "s/archive.ubuntu.com/mirror.runflare.com/g" /etc/apt/sources.list && sed -i "s/security.ubuntu.com/mirror.runflare.com/g" /etc/apt/sources.list && apt update'`;
    else if (action === 'reboot_server') cmd = `reboot`;
    else return res.status(400).json({ error: 'عملیات نامعتبر' });

    logOperation('OPTIMIZE', action);
    try {
        const result = await execSudoSSH(cmd, 20000);
        res.json({ success: true, output: result.output || result.stderr || 'با موفقیت انجام شد ✨' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== API: Smart Debug =====
app.post('/api/debug', async (req, res) => {
    if (!sshConnection) return res.status(401).json({ error: 'عدم اتصال SSH' });
    const { service } = req.body;
    let logCmd = '';

    if (service === 'synapse') logCmd = `journalctl --no-pager -n 50 -u "matrix-synapse-worker@*"`;
    else if (service === 'nginx') logCmd = `tail -n 50 /var/log/nginx/error.log`;
    else if (service === 'postgres') logCmd = `tail -n 50 /var/log/postgresql/postgresql-14-main.log`;
    else return res.status(400).json({ error: 'سرویس نامعتبر برای دیباگ' });

    logOperation('DEBUG', service);
    try {
        const result = await execSudoSSH(logCmd);
        const logs = (result.output || result.stderr || '').toLowerCase();
        let diagnosis = '🟢 Clean';
        let i18n_key = 'dbg_clean';
        
        if (logs.includes('sorry, user') && logs.includes('not allowed')) {
            diagnosis = '🔴 Permission denied! Sudo not allowed.';
            i18n_key = 'dbg_sudo_denied';
        } else if (logs.includes('permission denied')) {
            diagnosis = '🔴 Permission denied! Need root/sudo.';
            i18n_key = 'dbg_perm_denied';
        } else if (service === 'synapse') {
            if (logs.includes('out of memory') || logs.includes('memoryerror')) { diagnosis = '🔴 Out of memory!'; i18n_key = 'dbg_syn_oom'; }
            else if (logs.includes('database is locked') || logs.includes('psycopg2.operationalerror')) { diagnosis = '🔴 DB connection error!'; i18n_key = 'dbg_syn_db'; }
            else if (logs.includes('certificate verify failed') || logs.includes('ssl')) { diagnosis = '🟡 SSL/Federation error.'; i18n_key = 'dbg_syn_ssl'; }
            else if (logs.includes('timeout')) { diagnosis = '🟡 Network timeout.'; i18n_key = 'dbg_syn_timeout'; }
            else if (logs.includes('error')) { diagnosis = '🟡 General errors found.'; i18n_key = 'dbg_syn_err'; }
        } else if (service === 'nginx') {
            if (logs.includes('no live upstreams')) { diagnosis = '🔴 Nginx cannot connect to Synapse!'; i18n_key = 'dbg_ng_conn'; }
            else if (logs.includes('ssl_error')) { diagnosis = '🔴 SSL Certificate error!'; i18n_key = 'dbg_ng_ssl'; }
            else if (logs.includes('permission denied')) { diagnosis = '🔴 Permission denied for Nginx.'; i18n_key = 'dbg_ng_perm'; }
        } else if (service === 'postgres') {
            if (logs.includes('too many clients')) { diagnosis = '🔴 Too many clients!'; i18n_key = 'dbg_pg_clients'; }
            else if (logs.includes('no space left on device')) { diagnosis = '🔴 No space left on disk!'; i18n_key = 'dbg_pg_disk'; }
            else if (logs.includes('fatal')) { diagnosis = '🔴 Fatal DB error.'; i18n_key = 'dbg_pg_fatal'; }
        }

        res.json({ success: true, diagnosis, i18n_key, logs: result.output || result.stderr });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== API: Matrix Token Setup =====
app.post('/api/matrix/token', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token missing' });
    if (!savedCreds) return res.status(400).json({ error: 'No saved credentials' });
    
    savedCreds.matrixToken = token;
    saveCredentials(savedCreds);
    logOperation('MATRIX_TOKEN', 'Admin token saved');
    res.json({ success: true });
});

// ===== API: Matrix Admin Proxy =====
app.post('/api/matrix/admin', async (req, res) => {
    if (!sshConnection) return res.status(401).json({ error: 'SSH disconnected' });
    const { method, path, body } = req.body;
    if (!savedCreds || !savedCreds.matrixToken) return res.status(401).json({ error: 'Matrix Admin Token not configured' });
    
    // Construct safe curl command
    const safePath = path.replace(/"/g, ''); // prevent injection
    let cmd = `curl -s -X ${method || 'GET'} -H "Authorization: Bearer ${savedCreds.matrixToken}" "http://localhost:8008${safePath}"`;
    
    if (body && Object.keys(body).length > 0) {
        const jsonBody = JSON.stringify(body).replace(/'/g, "'\\''"); // Escape single quotes for bash
        cmd += ` -H "Content-Type: application/json" -d '${jsonBody}'`;
    }
    
    logOperation('MATRIX_ADMIN', `${method || 'GET'} ${safePath}`);
    try {
        const result = await execSSH(cmd, 30000); // 30s timeout for heavy queries
        let outputData = result.output || result.stderr || '{}';
        
        // Attempt to parse JSON response
        try {
            const parsed = JSON.parse(outputData);
            res.json({ success: true, data: parsed, exitCode: result.exitCode });
        } catch(e) {
            res.json({ success: true, raw: outputData, exitCode: result.exitCode });
        }
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
    console.log('\n  💜 ══════════════════════════════════════ 💜');
    console.log('  🌸  Electonet Monitoring Dashboard v2.0');
    console.log('  🔗  http://localhost:' + PORT);
    console.log('  💜 ══════════════════════════════════════ 💜\n');
    const saved = loadCredentials();
    if (saved) console.log('  📁 ذخیره‌شده: ' + saved.username + '@' + saved.host + '\n');
});
