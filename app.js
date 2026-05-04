// ============================================================
// ELECTONET - QUANTUM DASHBOARD ENGINE
// ============================================================

const API = '';
let currentTab = 'overview';
let refreshInterval = null;
let isConnected = false;
let serverInfo = null;
let isMuted = localStorage.getItem('electonet_muted') === 'true';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function t(key) {
    return i18next.t(key) || key;
}

function setLanguage(lng) {
    if (typeof i18next === 'undefined' || !i18next.isInitialized) {
        // If i18next not ready, try again later
        setTimeout(() => setLanguage(lng), 200);
        return;
    }
    i18next.changeLanguage(lng, (err, t) => {
        if (err) return console.log('something went wrong loading', err);
        
        // Update all elements with data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translated;
            } else {
                el.textContent = translated;
            }
        });
        
        // Update direction
        const isRtl = lng === 'fa';
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        document.documentElement.lang = lng;
        document.body.style.direction = isRtl ? 'rtl' : 'ltr';
        
        // Update font
        document.body.style.fontFamily = isRtl ? "'Vazirmatn', sans-serif" : "'Inter', 'Segoe UI', sans-serif";
        
        localStorage.setItem('electonet_lang', lng);
        updateLangButton();
    });
}

function toggleLang() {
    const nextLng = i18next.language === 'fa' ? 'en' : 'fa';
    setLanguage(nextLng);
}

function updateLangButton() {
    const active = i18next.language || localStorage.getItem('electonet_lang') || 'fa';
    document.querySelectorAll('[data-lang-toggle]').forEach(btn => {
        btn.textContent = active === 'fa' ? '🌍 EN' : '🌍 FA';
    });
}

function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('electonet_muted', isMuted);
    const btn = document.getElementById('muteBtn');
    if (btn) btn.innerHTML = isMuted ? '🔇' : '🔊';
}

// ============================================================
// MATRIX RAIN ENGINE
// ============================================================
function initMatrixRain() {
    const canvas = document.getElementById('matrixRain');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = [];
    
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100;
    }
    
    function draw() {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
        ctx.font = fontSize + 'px monospace';
        
        for (let i = 0; i < drops.length; i++) {
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }
    
    setInterval(draw, 50);
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    function createParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const size = Math.random() * 4 + 2;
        const x = Math.random() * 100;
        const duration = Math.random() * 10 + 5;
        const delay = Math.random() * 5;
        const hue = Math.random() > 0.5 ? '236, 72, 153' : '139, 92, 246';
        
        particle.style.cssText = `
            left: ${x}%;
            width: ${size}px;
            height: ${size}px;
            background: rgba(${hue}, ${Math.random() * 0.5 + 0.3});
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
            box-shadow: 0 0 ${size * 3}px rgba(${hue}, 0.5);
        `;
        
        container.appendChild(particle);
        
        setTimeout(() => {
            particle.remove();
        }, (duration + delay) * 1000);
    }
    
    for (let i = 0; i < 30; i++) {
        setTimeout(createParticle, i * 300);
    }
    
    setInterval(createParticle, 2000);
}

// ============================================================
// CHARTING ENGINE
// ============================================================
let resourceChart = null;
const chartData = {
    labels: [],
    cpu: [],
    ram: []
};

function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js is not loaded. Skipping chart initialization.');
        return;
    }
    
    const canvas = document.getElementById('resourceChart');
    if (!canvas) return;
    
    // ★ پاک کردن ابعاد قبلی
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.removeAttribute('width');
    canvas.removeAttribute('height');
    
    // ★ گرفتن container برای محاسبه اندازه
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth || 800;
    const containerHeight = 350;
    
    // ★ تنظیم دستی ابعاد canvas
    canvas.style.width = '100%';
    canvas.style.height = containerHeight + 'px';
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    // ★ اگه نمودار قبلی هست، نابودش کن
    if (resourceChart) {
        resourceChart.destroy();
        resourceChart = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    resourceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'CPU %',
                    data: chartData.cpu,
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'RAM %',
                    data: chartData.ram,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: false,           // ★ false = اندازه دستی ما رو قبول کنه
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100, 
                    grid: { color: 'rgba(255,255,255,0.05)' } 
                },
                x: { 
                    grid: { display: false } 
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
function updateCharts(cpu, ramPct) {
    if (!resourceChart) return;
    
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    
    chartData.labels.push(timeStr);
    chartData.cpu.push(cpu);
    chartData.ram.push(ramPct);
    
    if (chartData.labels.length > 20) {
        chartData.labels.shift();
        chartData.cpu.shift();
        chartData.ram.shift();
    }
    
    resourceChart.update('none');
}

// ============================================================
// RING CHART UPDATER
// ============================================================
function updateRing(elementId, percentage, maxValue = 100) {
    const ring = document.getElementById(elementId);
    if (!ring) return;
    
    const circumference = 2 * Math.PI * 54; // 54 = radius
    const pct = Math.min(percentage / maxValue * 100, 100);
    const offset = circumference - (pct / 100) * circumference;
    
    ring.style.strokeDasharray = `${circumference - offset} ${circumference}`;
    
    // Color based on value
    if (pct > 85) {
        ring.style.stroke = '#ef4444';
        ring.style.filter = 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))';
    } else if (pct > 65) {
        ring.style.stroke = '#f59e0b';
        ring.style.filter = 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))';
    } else {
        ring.style.stroke = 'url(#gradient)';
        ring.style.filter = 'none';
    }
}

// ============================================================
// COUNTER ANIMATION
// ============================================================
function animateCounter(element, target, duration = 1000) {
    if (!element) return;
    
    const start = 0;
    const range = target - start;
    let startTime = null;
    
    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = start + (range * eased);
        
        element.textContent = target % 1 === 0 ? Math.round(current) : current.toFixed(1);
        
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }
    
    requestAnimationFrame(step);
}

// ============================================================ 
// NOTIFICATION SYSTEM
// ============================================================
function showNotification(message, type = 'info') {
    const stream = document.getElementById('notifStream');
    if (!stream) return;
    
    const notif = document.createElement('div');
    notif.className = 'notif-item';
    
    const colors = {
        success: 'var(--success)',
        warning: 'var(--warning)',
        critical: 'var(--danger)',
        info: 'var(--accent)'
    };
    
    notif.style.borderLeft = `3px solid ${colors[type] || colors.info}`;
    notif.textContent = message;
    
    stream.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(100%)';
        notif.style.transition = 'all 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.orb-menu-item').forEach(m => m.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) targetTab.classList.add('active');
    
    const targetMenu = document.querySelector(`.orb-menu-item[data-tab="${tabName}"]`);
    if (targetMenu) targetMenu.classList.add('active');
    
    // ★★★ راه حل اصلی: نابود و بازسازی نمودار ★★★
    if (tabName === 'charts') {
        if (resourceChart) {
            resourceChart.destroy();
            resourceChart = null;
        }
        // یه تاخیر کوچیک برای اینکه تب کامل نمایش داده بشه
        setTimeout(() => {
            initCharts();
        }, 50);
    }
    
    // Close sidebar on mobile
    if (window.innerWidth <= 900) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }
}
// ============================================================
// DATA FETCHING & UPDATING
// ============================================================
async function fetchHealthData() {
    if (!isConnected) return;
    
    try {
        const response = await fetch(`${API}/api/health`);
        const data = await response.json();
        
        if (data.success) {
            updateDashboard(data.health, data.issues);
        }
    } catch (error) {
        console.error('Health check failed:', error);
    }
}

function updateDashboard(health, issues) {
    // CPU
    if (health.cpuLoad) {
        const cpuValue = health.cpuLoad[0];
        animateCounter(document.querySelector('#cpuValue .value-number'), cpuValue);
        updateRing('cpuRing', cpuValue, 8);
        updateBadge('cpuBadge', cpuValue, 6, 8);
    }
    
    // RAM
    if (health.ramUsed && health.ramTotal) {
        const ramValue = parseFloat(health.ramUsed);
        const ramTotal = parseFloat(health.ramTotal);
        animateCounter(document.querySelector('#ramValue .value-number'), ramValue);
        updateRing('ramRing', ramValue, ramTotal);
        updateBadge('ramBadge', ramValue / ramTotal * 100, 65, 85);
    }
    
    // Disk
    if (health.diskPercent !== null) {
        animateCounter(document.querySelector('#diskValue .value-number'), health.diskPercent);
        updateRing('diskRing', health.diskPercent, 100);
        updateBadge('diskBadge', health.diskPercent, 65, 85);
    }
    
    // PostgreSQL
    if (health.pgConnections !== null) {
        animateCounter(document.querySelector('#pgValue .value-number'), health.pgConnections);
        updateRing('pgRing', health.pgConnections, 300);
        updateBadge('pgBadge', health.pgConnections, 200, 270);
    }
    
    // Federation
    if (health.fedQueue !== null) {
        animateCounter(document.querySelector('#fedValue .value-number'), health.fedQueue);
        updateRing('fedRing', health.fedQueue, 2000);
        updateBadge('fedBadge', health.fedQueue, 800, 1500);
    }
    
    // Swap
    if (health.swapUsed && health.swapTotal) {
        const swapValue = parseFloat(health.swapUsed);
        const swapTotal = parseFloat(health.swapTotal);
        animateCounter(document.querySelector('#swapValue .value-number'), swapValue);
        updateRing('swapRing', swapValue, swapTotal);
        updateBadge('swapBadge', swapValue / swapTotal * 100, 30, 50);
    }
    
    // Detailed Stats (Interpretation)
    updateDetailedStats(health);
    
    // AI Diagnosis
    updateDiagnosis(issues);
    
    // Update Charts
    if (health.cpuLoad && health.ramUsed && health.ramTotal) {
        const cpuVal = health.cpuLoad[0];
        const ramPct = (parseFloat(health.ramUsed) / parseFloat(health.ramTotal)) * 100;
        updateCharts(cpuVal * 10, ramPct); // Scaled for visibility
    }
}

function updateDetailedStats(health) {
    const setDetail = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    if (health.ramUsed && health.ramTotal) {
        setDetail('ramDetail', `${i18next.t('stat_used')}: ${health.ramUsed} / ${health.ramTotal} GB`);
    }
    if (health.diskUsed && health.diskTotal) {
        setDetail('diskDetail', `${i18next.t('stat_used')}: ${health.diskUsed} / ${health.diskTotal}`);
    }
    if (health.cpuLoad) {
        const load = health.cpuLoad[0];
        const status = load > 8 ? i18next.t('stat_high_load') : load > 5 ? i18next.t('stat_moderate') : i18next.t('stat_stable');
        setDetail('cpuDetail', `${i18next.t('stat_load')}: ${load} (${status})`);
    }
}

function updateBadge(elementId, value, warnThreshold, dangerThreshold) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    
    badge.className = 'card-badge';
    
    if (value >= dangerThreshold) {
        badge.classList.add('danger');
        badge.textContent = i18next.t('badge_critical');
    } else if (value >= warnThreshold) {
        badge.classList.add('warning');
        badge.textContent = i18next.t('badge_warning');
    } else {
        badge.textContent = i18next.t('badge_normal');
    }
}

function updateDiagnosis(issues) {
    const container = document.getElementById('aiDiagnosis');
    if (!container) return;
    
    if (!issues || issues.length === 0) {
        container.innerHTML = `
            <div class="diagnosis-item">
                <span class="diag-icon">✅</span>
                <span>${i18next.t('diag_all_ok')}</span>
            </div>
        `;
        return;
    }
    
    container.innerHTML = issues.slice(0, 5).map(issue => {
        const icon = issue.level === 'critical' ? '🔴' : 
                     issue.level === 'warn' ? '🟡' : '🟢';
        const title = issue.i18n_key && i18next.exists(issue.i18n_key) ? 
                     i18next.t(issue.i18n_key) : (issue.title || i18next.t('unknown'));
        
        return `
            <div class="diagnosis-item">
                <span class="diag-icon">${icon}</span>
                <div>
                    <div style="font-weight:600;">${title}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${i18next.t('label_probability')}: ${issue.prob}%</div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// CONNECTION MANAGEMENT
// ============================================================
async function connectToServer(host, port, username, password, save = false) {
    try {
        const response = await fetch(`${API}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, username, password, save })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isConnected = true;
            serverInfo = { host, port, username };
            
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('connPulse').querySelector('.pulse-dot').classList.add('online');
            document.getElementById('serverInfo').textContent = `${username}@${host}:${port}`;
            
            showNotification(i18next.t('notif_conn_success'), 'success');
            
            // Start auto-refresh
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(fetchHealthData, 10000);
            fetchHealthData();
            
            return true;
        } else {
            showNotification(i18next.t('notif_conn_fail', { message: data.message }), 'critical');
            return false;
        }
    } catch (error) {
        showNotification(i18next.t('notif_conn_err', { message: error.message }), 'critical');
        return false;
    }
}

async function disconnectServer() {
    try {
        await fetch(`${API}/api/disconnect`, { method: 'POST' });
    } catch (error) {
        console.error('Disconnect error:', error);
    }
    
    isConnected = false;
    serverInfo = null;
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    document.getElementById('connPulse').querySelector('.pulse-dot').classList.remove('online');
    document.getElementById('serverInfo').textContent = i18next.t('connection_idle');
    document.getElementById('loginModal').style.display = 'flex';
    
    showNotification(i18next.t('notif_disconnected'), 'warning');
}

// ============================================================
// TERMINAL FUNCTIONALITY
// ============================================================
async function executeTerminalCommand(command) {
    const terminalBody = document.getElementById('terminalBody');
    if (!terminalBody) return;
    
    // Add command to terminal
    const cmdLine = document.createElement('div');
    cmdLine.className = 'term-line';
    cmdLine.innerHTML = `<span class="term-prompt">❯</span><span class="term-text">${escapeHtml(command)}</span>`;
    terminalBody.appendChild(cmdLine);
    
    try {
        const response = await fetch(`${API}/api/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const outputLines = (data.output || '(no output)').split('\n');
            outputLines.forEach(line => {
                const outLine = document.createElement('div');
                outLine.className = 'term-line';
                outLine.innerHTML = `<span class="term-text" style="color:#94a3b8;">${escapeHtml(line)}</span>`;
                terminalBody.appendChild(outLine);
            });
        } else {
            const errLine = document.createElement('div');
            errLine.className = 'term-line';
            errLine.innerHTML = `<span class="term-text" style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(data.message)}</span>`;
            terminalBody.appendChild(errLine);
        }
    } catch (error) {
        const errLine = document.createElement('div');
        errLine.className = 'term-line';
        errLine.innerHTML = `<span class="term-text" style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(error.message)}</span>`;
        terminalBody.appendChild(errLine);
    }
    
    // Scroll to bottom
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// OPTIMIZATION ACTIONS
// ============================================================
async function executeOptimization(action) {
    if (!isConnected) {
        showNotification(i18next.t('notif_not_connected'), 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API}/api/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(i18next.t('notif_opt_success'), 'success');
            fetchHealthData(); // Refresh data
        } else {
            showNotification(i18next.t('notif_opt_fail', { error: data.error }), 'critical');
        }
    } catch (error) {
        showNotification(i18next.t('notif_opt_err', { message: error.message }), 'critical');
    }
}

// ============================================================
// DEBUG FUNCTIONALITY
// ============================================================
async function executeDebug(service) {
    if (!isConnected) {
        showNotification(i18next.t('notif_not_connected'), 'warning');
        return;
    }
    
    const output = document.getElementById('debugOutput');
    if (!output) return;
    
    output.innerHTML = '<div class="debug-line">Running quantum analysis...</div>';
    
    try {
        const response = await fetch(`${API}/api/debug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service })
        });
        
        const data = await response.json();
        
        if (data.success) {
            output.innerHTML = `
                <div style="margin-bottom:16px; padding:12px; background:rgba(var(--primary-rgb),0.1); border-radius:8px;">
                    <strong>Diagnosis:</strong> ${escapeHtml(data.diagnosis)}
                </div>
                <div style="color:#94a3b8; white-space:pre-wrap;">${escapeHtml(data.logs || '')}</div>
            `;
        } else {
            output.innerHTML = `<div style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(data.error)}</div>`;
        }
    } catch (error) {
        output.innerHTML = `<div style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(error.message)}</div>`;
    }
}

async function executeLiveLogs(service) {
    const output = document.getElementById('liveLogContent');
    if (!output) return;
    
    const serviceMap = {
        'synapse': 'matrix-synapse',
        'nginx': 'nginx',
        'postgres': 'postgresql'
    };
    const realService = serviceMap[service] || service;
    
    output.innerHTML = i18next.t('stream_establishing', { service: realService });
    
    try {
        const response = await fetch(`${API}/api/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `journalctl -u ${realService} -n 100 --no-pager` })
        });
        
        const data = await response.json();
        
        if (data.success) {
            output.innerHTML = `<div style="color:#10b981; white-space:pre-wrap; font-family:monospace;">${escapeHtml(data.output || i18next.t('stream_no_logs'))}</div>`;
        } else {
            output.innerHTML = `<div style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(data.message)}</div>`;
        }
    } catch (error) {
        output.innerHTML = `<div style="color:#ef4444;">${i18next.t('label_error')}: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================
// TIME WARP CLOCK
// ============================================================
function updateTimeWarp() {
    const timeWarp = document.getElementById('timeWarp');
    if (!timeWarp) return;
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    timeWarp.textContent = `${hours}:${minutes}:${seconds}`;
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.orb-menu-item').forEach(m => m.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) targetTab.classList.add('active');
    
    const targetMenu = document.querySelector(`.orb-menu-item[data-tab="${tabName}"]`);
    if (targetMenu) targetMenu.classList.add('active');
    
    // Close sidebar on mobile
    if (window.innerWidth <= 900) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Init visual effects
    initMatrixRain();
    initParticles();
    initCharts();
    
    // Init language & mute
    const savedLng = localStorage.getItem('electonet_lang') || 'fa';
    setLanguage(savedLng);
    
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
    
    // Time warp clock
    updateTimeWarp();
    setInterval(updateTimeWarp, 1000);
    
    // Tab switching
    document.querySelectorAll('.orb-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            switchTab(item.dataset.tab);
        });
    });
    
    // Sidebar close button & overlay
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    function closeSidebar() {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const host = document.getElementById('hostInput').value;
            const port = parseInt(document.getElementById('portInput').value);
            const username = document.getElementById('userInput').value;
            const password = document.getElementById('passInput').value;
            
            await connectToServer(host, port, username, password, true);
        });
    }
    
    // Resume session
    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${API}/api/auto-connect`, { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    isConnected = true;
                    serverInfo = { host: data.host, username: data.username };
                    
                    document.getElementById('loginModal').style.display = 'none';
                    document.getElementById('connPulse').querySelector('.pulse-dot').classList.add('online');
                    document.getElementById('serverInfo').textContent = `${data.username}@${data.host}`;
                    
                    showNotification(i18next.t('notif_session_resumed'), 'success');
                    
                    if (refreshInterval) clearInterval(refreshInterval);
                    refreshInterval = setInterval(fetchHealthData, 10000);
                    fetchHealthData();
                }
            } catch (error) {
                console.error('Resume failed:', error);
            }
        });
    }
    
    // Check for saved session
    fetch(`${API}/api/saved-session`)
        .then(r => r.json())
        .then(data => {
            if (data.exists) {
                document.getElementById('resumeConnection').style.display = 'block';
            }
        })
        .catch(() => {});
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', disconnectServer);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (isConnected) {
                fetchHealthData();
                showNotification(i18next.t('notif_data_sync'), 'info');
            }
        });
    }
    
    // Terminal
    const terminalInput = document.getElementById('terminalInput');
    const termRunBtn = document.getElementById('termRunBtn');
    
    function runTerminal() {
        const command = terminalInput.value.trim();
        if (command) {
            executeTerminalCommand(command);
            terminalInput.value = '';
        }
    }
    
    if (termRunBtn) termRunBtn.addEventListener('click', runTerminal);
    if (terminalInput) {
        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runTerminal();
        });
    }
    
    // ============================================================
    // MATRIX ADMIN LOGIC
    // ============================================================
    const saveMatrixTokenBtn = document.getElementById('saveMatrixTokenBtn');
    if (saveMatrixTokenBtn) {
        saveMatrixTokenBtn.addEventListener('click', async () => {
            const token = document.getElementById('matrixTokenInput').value;
            if (!token) return showNotification(i18next.t('notif_enter_token'), 'warning');
            try {
                const res = await fetch(`${API}/api/matrix/token`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await res.json();
                if (data.success) {
                    showNotification(i18next.t('notif_token_saved_securely'), 'success');
                    document.getElementById('matrixTokenInput').value = ''; // clear for security
                } else {
                    showNotification(data.error, 'critical');
                }
            } catch (err) { showNotification(err.message, 'critical'); }
        });
    }

    const runMediaPurgeBtn = document.getElementById('runMediaPurgeBtn');
    if (runMediaPurgeBtn) {
        runMediaPurgeBtn.addEventListener('click', async () => {
            const days = parseInt(document.getElementById('mediaPurgeDays').value) || 30;
            if (!confirm(i18next.t('confirm_purge_media', { days }))) return;
            const before_ts = Date.now() - (days * 24 * 60 * 60 * 1000);
            showNotification(i18next.t('notif_purge_start'), 'info');
            try {
                const res = await fetch(`${API}/api/matrix/admin`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: 'POST', path: `/_synapse/admin/v1/purge_media_cache?before_ts=${before_ts}` })
                });
                const data = await res.json();
                if (data.success) showNotification(i18next.t('notif_purge_success'), 'success');
                else showNotification(i18next.t('label_error') + ': ' + data.error, 'critical');
            } catch (err) { showNotification(err.message, 'critical'); }
        });
    }

    const runUserDeactivateBtn = document.getElementById('runUserDeactivateBtn');
    if (runUserDeactivateBtn) {
        runUserDeactivateBtn.addEventListener('click', async () => {
            const userId = document.getElementById('matrixUserId').value;
            if (!userId || !userId.startsWith('@')) return showNotification(i18next.t('notif_invalid_user_id'), 'warning');
            if (!confirm(i18next.t('confirm_deactivate_user', { userId }))) return;
            showNotification(i18next.t('notif_deactivating_user', { userId }), 'info');
            try {
                const res = await fetch(`${API}/api/matrix/admin`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: 'POST', path: `/_synapse/admin/v1/deactivate/${userId}`, body: { erase: true } })
                });
                const data = await res.json();
                if (data.success) {
                    showNotification(i18next.t('notif_user_deactivated'), 'success');
                    document.getElementById('matrixUserId').value = '';
                } else showNotification(i18next.t('label_error') + ': ' + data.error, 'critical');
            } catch (err) { showNotification(err.message, 'critical'); }
        });
    }

    const fetchMatrixStatsBtn = document.getElementById('fetchMatrixStatsBtn');
    if (fetchMatrixStatsBtn) {
        fetchMatrixStatsBtn.addEventListener('click', async () => {
            const output = document.getElementById('matrixStatsOutput');
            output.innerHTML = i18next.t('loading_stats');
            try {
                const res = await fetch(`${API}/api/matrix/admin`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: 'GET', path: `/_synapse/admin/v1/server_version` })
                });
                const data = await res.json();
                if (data.success) {
                    output.innerHTML = JSON.stringify(data.data || JSON.parse(data.raw), null, 2);
                } else {
                    output.innerHTML = i18next.t('label_error') + ': ' + data.error;
                }
            } catch (err) { output.innerHTML = i18next.t('label_error') + ': ' + err.message; }
        });
    }
    
    // Service / Log buttons
    document.querySelectorAll('.service-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.service-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.dataset.service) {
                executeDebug(btn.dataset.service);
            } else if (btn.dataset.log) {
                executeLiveLogs(btn.dataset.log);
            }
        });
    });
    
    // Control buttons
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action) {
                if (action === 'reboot_server') {
                    if (confirm(i18next.t('confirm_reboot'))) {
                        executeOptimization(action);
                    }
                } else {
                    executeOptimization(action);
                }
            }
        });
    });
    
    // Check initial connection
    fetch(`${API}/api/status`)
        .then(r => r.json())
        .then(data => {
            if (data.connected) {
                isConnected = true;
                serverInfo = data.info;
                
                document.getElementById('loginModal').style.display = 'none';
                document.getElementById('connPulse').querySelector('.pulse-dot').classList.add('online');
                document.getElementById('serverInfo').textContent = 
                    `${data.info.username}@${data.info.host}:${data.info.port}`;
                
                showNotification(i18next.t('notif_already_conn'), 'success');
                
                if (refreshInterval) clearInterval(refreshInterval);
                refreshInterval = setInterval(fetchHealthData, 10000);
                fetchHealthData();
            }
        })
        .catch(() => {});
    
    // i18next initialization
    if (typeof i18next !== 'undefined') {
        i18next.init({
            lng: savedLng,
            fallbackLng: 'en',
            resources: {
                fa: { translation: {
                    'login_subtitle': 'سیستم مانیتورینگ هوشمند',
                    'login_btn': 'ورود به سیستم',
                    'ph_server': 'آی‌پی سرور / دامنه',
                    'ph_port': 'پورت (22)',
                    'ph_username': 'نام کاربری',
                    'ph_password': 'رمز عبور SSH',
                    'logout_btn': '🚪 خروج',
                    'sync_btn': '🔄 همگام‌سازی',
                    'connection_idle': 'اتصال کوانتومی',
                    'badge_normal': 'عادی',
                    'badge_warning': 'هشدار',
                    'badge_critical': 'بحرانی',
                    'label_error': 'خطا',
                    'label_probability': 'احتمال',
                    'diag_all_ok': 'همه سیستم‌ها عملیاتی هستند',
                    'unknown': 'نامشخص',
                    'resume_found': 'نشست قبلی پیدا شد!',
                    'label_quick_login': '⚡ ورود سریع',
                    'overview_tab': 'نمای کلی',
                    'charts_tab': '📈 نمودارها',
                    'smart_tab': 'تشخیص',
                    'problems_tab': 'مشکلات',
                    'troubleshoot_tab': '🔧 عیب‌یابی',
                    'livelogs_tab': '📺 لاگ زنده',
                    'optimize_tab': '🚀 بهینه‌سازی',
                    'debug_tab': '🐞 دیباگ هوشمند',
                    'terminal_tab': '⌨️ ترمینال',
                    'matrix_admin_tab': '⚙️ ادمین ماتریکس',
                    'theme_tab': '🎨 تم‌ساز',
                    'theme_sidebar_color': 'رنگ منو (Sidebar)',
                    'stat_used': 'استفاده شده',
                    'stat_load': 'بار پردازنده',
                    'stat_stable': 'پایدار',
                    'stat_moderate': 'متوسط',
                    'stat_high_load': 'بحرانی',
                    'stream_establishing': 'در حال برقراری اتصال زنده برای {{service}}...',
                    'stream_no_logs': 'لاگی پیدا نشد.',
                    'cpu_load': 'بار پردازنده (CPU)',
                    'ram_mem': 'حافظه موقت (RAM)',
                    'disk_space': 'فضای دیسک (Disk)',
                    'pg_conn': 'اتصالات دیتابیس',
                    'smart_diag_title': '🧠 تشخیص هوشمند',
                    'smart_diag_desc': 'بر اساس داده‌های زنده سرور، مشکلات محتمل:',
                    'diag_scanning': 'در حال اسکن الگوهای سرور...',
                    'opt_ram': '🧹 پاکسازی کش رم',
                    'opt_journal': '📝 پاکسازی ژورنال سیستم',
                    'opt_nginx_logs': '📋 پاکسازی لاگ Nginx',
                    'opt_reboot': '🔄 ریبوت سرور',
                    'opt_desc': 'نگهداری و مدیریت منابع سرور:',
                    'btn_run': 'اجرا',
                    'problems_title': '⚠️ مشکلات شناخته‌شده',
                    'prob_pg_title': '🔴 اشباع اتصالات PostgreSQL',
                    'prob_pg_desc': 'max_connections=200 گاهی پر می‌شود.',
                    'prob_pg_sol': '✅ افزایش به 300، مانیتورینگ با ربات، کاهش pool_size',
                    'prob_cpu_title': '🔴 مصرف بالای CPU',
                    'prob_cpu_desc': 'به دلیل sliding sync و 70-80 کاربر فعال.',
                    'prob_cpu_sol': '✅ کاهش sync_response_cache_duration به 30 ثانیه',
                    'prob_fed_title': '🟡 صف سنگین Federation',
                    'prob_fed_desc': 'ارسال به سرورهای مرده destination_rooms را افزایش می‌دهد.',
                    'prob_fed_sol': '✅ پاکسازی دوره‌ای',
                    'prob_log_title': '🟡 لاگ‌های حجیم',
                    'prob_log_desc': 'تا 2-3 گیگابایت.',
                    'prob_log_sol': '✅ تنظیم logrotate',
                    'trb_guide_desc': 'برای تشخیص مشکلات رایج، مراحل زیر را دنبال کنید:',
                    'trb_slow': '🐢 سرور کند',
                    'trb_conn': '🔌 مشکلات اتصال',
                    'step_load': 'بررسی بار سیستم',
                    'step_ram': 'بررسی حافظه',
                    'step_api': 'تست API',
                    'step_srv': 'وضعیت سرویس‌ها',
                    'live_synapse': 'ماتریکس (Synapse)',
                    'live_nginx': 'Nginx',
                    'live_pg': 'PostgreSQL',
                    'live_placeholder': 'یک سرویس انتخاب کنید تا لاگ زنده ببینید...',
                    'term_ready': 'اتصال برقرار. دستور خود را بنویسید...',
                    'term_placeholder': 'یک دستور بنویسید... (مانند uptime)',
                    'debug_desc': 'آخرین 50 خط لاگ را می‌خواند و خطاها را تفسیر می‌کند:',
                    'dbg_matrix': 'دیباگ ماتریکس',
                    'dbg_nginx': 'دیباگ Nginx',
                    'dbg_pg': 'دیباگ دیتابیس',
                    'dbg_placeholder': 'یک سرویس برای تحلیل عمیق انتخاب کنید...',
                    'theme_title': '🎨 تم‌ساز الکتونت',
                    'theme_desc': 'داشبورد را شخصی‌سازی کنید. تمام تنظیمات در مرورگر شما ذخیره می‌شود.',
                    'theme_presets': 'پیش‌تنظیمات سریع',
                    'theme_primary': 'رنگ اصلی',
                    'theme_accent': 'رنگ تأکیدی',
                    'theme_bg': 'رنگ پس‌زمینه',
                    'theme_card_color': 'رنگ کارت‌ها',
                    'theme_bg_img': '🖼️ تصویر پس‌زمینه (لینک)',
                    'theme_bg_img_ph': 'لینک تصویر را وارد کنید (مانند https://...)',
                    'theme_glass': '🪟 شفافیت کارت‌ها (افکت شیشه‌ای):',
                    'theme_bg_opacity': '🌫️ شفافیت تصویر پس‌زمینه:',
                    'theme_font': '🔤 فونت داشبورد',
                    'theme_save': '💾 ذخیره و اعمال',
                    'theme_reset': '🔄 بازگشت به پیش‌فرض',
                    'matrix_admin_title': '⚙️ مدیریت پیشرفته ماتریکس',
                    'matrix_admin_desc': 'ابزارهای مدیریتی مستقیم از طریق API ماتریکس (Synapse Admin API).',
                    'matrix_token_title': 'توکن دسترسی ادمین',
                    'matrix_token_desc': 'برای اجرای دستورات الزامی است. این توکن بصورت امن در بک‌اند ذخیره می‌شود.',
                    'matrix_btn_save_token': 'ذخیره توکن',
                    'matrix_media_title': '🧹 پاکسازی مدیا (Media Purge)',
                    'matrix_media_desc': 'پاک کردن تصاویر و ویدیوهای قدیمی برای آزادسازی فضای دیسک.',
                    'matrix_days_old': 'روز پیش',
                    'matrix_btn_purge': 'پاکسازی',
                    'matrix_user_title': '👤 مدیریت کاربران',
                    'matrix_user_desc': 'غیرفعال کردن کاربر و پاکسازی داده‌های وی.',
                    'matrix_btn_deactivate': 'غیرفعال‌سازی کاربر',
                    'matrix_stats_title': '📊 آمار سرور',
                    'matrix_stats_desc': 'دریافت وضعیت زنده و آمار فدراسیون از طریق API.',
                    'matrix_btn_stats': 'دریافت آمار',
                    'matrix_stats_placeholder': 'آمار در اینجا نمایش داده می‌شود...',
                    'status_online': 'آنلاین',
                    'status_offline': 'آفلاین',
                    'diag_cpu_crit': '🔴 بار CPU بحرانی',
                    'diag_cpu_warn': '🟡 بار CPU بالا',
                    'diag_disk_crit': '🔴 دیسک بحرانی',
                    'diag_disk_warn': '🟡 دیسک محدود',
                    'diag_pg_crit': '🔴 اشباع اتصالات DB',
                    'diag_pg_warn': '🟡 اتصالات DB بالا',
                    'diag_fed_crit': '🔴 صف Federation',
                    'diag_fed_warn': '🟡 صف Federation بالا',
                    'diag_svc_crit': '🔴 سرویس خاموش',
                    'diag_ok': '🟢 همه چیز عالیه',
                    'notif_conn_success': 'اتصال با موفقیت برقرار شد',
                    'notif_conn_fail': 'خطا در اتصال: {{message}}',
                    'notif_conn_err': 'خطای شبکه: {{message}}',
                    'notif_disconnected': 'اتصال قطع شد',
                    'notif_not_connected': 'به سروری متصل نیستید',
                    'notif_opt_success': 'بهینه‌سازی با موفقیت انجام شد',
                    'notif_opt_fail': 'خطا در بهینه‌سازی: {{error}}',
                    'notif_opt_err': 'خطای سیستمی: {{message}}',
                    'notif_already_conn': 'قبلاً متصل شده‌اید',
                    'notif_data_sync': 'داده‌ها همگام‌سازی شدند',
                    'notif_session_resumed': 'نشست با موفقیت بازیابی شد',
                    'notif_enter_token': 'لطفا توکن را وارد کنید',
                    'notif_token_saved_securely': '✅ توکن با موفقیت و امن ذخیره شد',
                    'confirm_purge_media': 'آیا مطمئن هستید که مدیای قدیمی‌تر از {{days}} روز پاک شود؟',
                    'notif_purge_start': '🧹 شروع پاکسازی مدیا...',
                    'notif_purge_success': '✅ پاکسازی مدیا با موفقیت انجام شد!',
                    'notif_invalid_user_id': 'شناسه کاربر نامعتبر است (باید با @ شروع شود)',
                    'confirm_deactivate_user': 'کاربر {{userId}} غیرفعال و داده‌هایش حذف شود؟ این عملیات قابل بازگشت نیست.',
                    'notif_deactivating_user': '👤 در حال غیرفعال‌سازی {{userId}}...',
                    'notif_user_deactivated': '✅ کاربر غیرفعال و داده‌ها حذف شد!',
                    'loading_stats': 'در حال دریافت آمار...',
                    'confirm_reboot': 'آیا مطمئن هستید که سرور ریبوت شود؟',
                    'notif_theme_saved': '✅ تنظیمات ذخیره شد!',
                    'notif_theme_reset': '🔄 تنظیمات به حالت اولیه برگشت',
                    'notif_preset_applied': 'پیش‌تنظیم اعمال شد: {{name}}',
                    'notif_token_saved': 'توکن با موفقیت ذخیره شد'
                }},
                en: { translation: {
                    'login_subtitle': 'Lotus Smart Monitoring System',
                    'login_btn': 'Login Now',
                    'ph_server': 'Server IP / Domain',
                    'ph_port': 'Port (22)',
                    'ph_username': 'Username',
                    'ph_password': 'SSH Password',
                    'logout_btn': '🚪 Exit',
                    'sync_btn': '🔄 Sync',
                    'connection_idle': 'Quantum Connection',
                    'badge_normal': 'Normal',
                    'badge_warning': 'Warning',
                    'badge_critical': 'Critical',
                    'label_error': 'Error',
                    'label_probability': 'Probability',
                    'diag_all_ok': 'All systems operational',
                    'unknown': 'Unknown',
                    'resume_found': 'Previous session found!',
                    'label_quick_login': '⚡ Quick Login',
                    'overview_tab': 'Overview',
                    'charts_tab': '📈 Charts',
                    'smart_tab': 'Smart Diagnosis',
                    'problems_tab': 'Problems',
                    'troubleshoot_tab': '🔧 Troubleshooting',
                    'livelogs_tab': '📺 Live Logs',
                    'optimize_tab': '🚀 Optimization',
                    'debug_tab': '🐞 Smart Debug',
                    'terminal_tab': '⌨️ Terminal',
                    'matrix_admin_tab': '⚙️ Matrix Admin',
                    'theme_tab': '🎨 Theme Builder',
                    'theme_sidebar_color': 'Sidebar Color',
                    'stat_used': 'Used',
                    'stat_load': 'Load',
                    'stat_stable': 'Stable',
                    'stat_moderate': 'Moderate',
                    'stat_high_load': 'High Load',
                    'stream_establishing': 'Establishing quantum stream for {{service}}...',
                    'stream_no_logs': 'No logs found.',
                    'cpu_load': 'CPU LOAD',
                    'ram_mem': 'RAM USAGE',
                    'disk_space': 'DISK SPACE',
                    'pg_conn': 'POSTGRES CONNS',
                    'smart_diag_title': '🧠 AI Diagnosis',
                    'smart_diag_desc': 'Based on live server data, the most probable issues are:',
                    'diag_scanning': 'Scanning quantum patterns...',
                    'opt_ram': '🧹 Clear RAM Cache',
                    'opt_journal': '📝 Clear System Journal',
                    'opt_nginx_logs': '📋 Clear Nginx Logs',
                    'opt_reboot': '🔄 Reboot Server',
                    'opt_desc': 'Server maintenance and resource management:',
                    'btn_run': 'RUN',
                    'problems_title': '⚠️ Known Issues',
                    'prob_pg_title': '🔴 PostgreSQL Connection Saturation',
                    'prob_pg_desc': 'max_connections=200 sometimes fills up.',
                    'prob_pg_sol': '✅ Increase to 300, monitor with bot, reduce pool_size',
                    'prob_cpu_title': '🔴 High CPU Usage',
                    'prob_cpu_desc': 'Due to sliding sync and 70-80 active users.',
                    'prob_cpu_sol': '✅ Reduce sync_response_cache_duration to 30s',
                    'prob_fed_title': '🟡 Heavy Federation Queue',
                    'prob_fed_desc': 'Sending to dead servers increases destination_rooms.',
                    'prob_fed_sol': '✅ Periodic cleanup',
                    'prob_log_title': '🟡 Large Logs',
                    'prob_log_desc': 'Up to 2-3 GB.',
                    'prob_log_sol': '✅ Configure logrotate',
                    'trb_guide_desc': 'Follow these steps to diagnose common issues:',
                    'trb_slow': '🐢 Slow Server',
                    'trb_conn': '🔌 Connection Issues',
                    'step_load': 'Check Load',
                    'step_ram': 'Check RAM',
                    'step_api': 'Test API',
                    'step_srv': 'Service Status',
                    'live_synapse': 'Matrix (Synapse)',
                    'live_nginx': 'Nginx',
                    'live_pg': 'PostgreSQL',
                    'live_placeholder': 'Select a service to view live logs...',
                    'term_ready': 'Connection ready. Type command...',
                    'term_placeholder': 'Type a command... (e.g., top -bn1 | head -20)',
                    'debug_desc': 'Reads last 50 log lines and interprets errors:',
                    'dbg_matrix': 'Debug Matrix',
                    'dbg_nginx': 'Debug Nginx',
                    'dbg_pg': 'Debug Database',
                    'dbg_placeholder': 'Select a service for deep analysis...',
                    'theme_title': '🎨 Electonet Theme Builder',
                    'theme_desc': 'Personalize your dashboard. All settings are saved in your browser.',
                    'theme_presets': 'Quick Presets',
                    'theme_primary': 'Primary Color',
                    'theme_accent': 'Accent Color',
                    'theme_bg': 'Background Color',
                    'theme_card_color': 'Card Color',
                    'theme_bg_img': '🖼️ Background Image (URL)',
                    'theme_bg_img_ph': 'Paste image URL (e.g., https://...)',
                    'theme_glass': '🪟 Card Transparency (Glass Effect):',
                    'theme_bg_opacity': '🌫️ Background Image Opacity:',
                    'theme_font': '🔤 Dashboard Font',
                    'theme_save': '💾 Save & Apply',
                    'theme_reset': '🔄 Reset to Default',
                    'matrix_admin_title': '⚙️ Matrix Synapse Admin',
                    'matrix_admin_desc': 'Advanced management tools directly via Synapse Admin API.',
                    'matrix_token_title': 'Admin Access Token',
                    'matrix_token_desc': 'Required for API commands. Stored securely on the backend.',
                    'matrix_btn_save_token': 'Save Token',
                    'matrix_media_title': '🧹 Media Purge',
                    'matrix_media_desc': 'Delete old cached media to free up disk space.',
                    'matrix_days_old': 'Days Old',
                    'matrix_btn_purge': 'Purge Media',
                    'matrix_user_title': '👤 User Management',
                    'matrix_user_desc': 'Deactivate a user and purge their data.',
                    'matrix_btn_deactivate': 'Deactivate User',
                    'matrix_stats_title': '📊 Server Statistics',
                    'matrix_stats_desc': 'Fetch live server and federation stats from the Admin API.',
                    'matrix_btn_stats': 'Fetch Statistics',
                    'matrix_stats_placeholder': 'Stats will appear here...',
                    'status_online': 'Online',
                    'status_offline': 'Offline',
                    'diag_cpu_crit': '🔴 Critical CPU Load',
                    'diag_cpu_warn': '🟡 High CPU Load',
                    'diag_disk_crit': '🔴 Critical Disk Space',
                    'diag_disk_warn': '🟡 Low Disk Space',
                    'diag_pg_crit': '🔴 DB Connection Saturation',
                    'diag_pg_warn': '🟡 High DB Connections',
                    'diag_fed_crit': '🔴 Federation Queue',
                    'diag_fed_warn': '🟡 High Federation Queue',
                    'diag_svc_crit': '🔴 Service Down',
                    'diag_ok': '🟢 All Systems Operational',
                    'notif_conn_success': 'Connection established successfully',
                    'notif_conn_fail': 'Connection failed: {{message}}',
                    'notif_conn_err': 'Connection error: {{message}}',
                    'notif_disconnected': 'Disconnected from server',
                    'notif_not_connected': 'Not connected to server',
                    'notif_opt_success': 'Optimization completed successfully',
                    'notif_opt_fail': 'Optimization failed: {{error}}',
                    'notif_opt_err': 'Optimization error: {{message}}',
                    'notif_already_conn': 'Already connected',
                    'notif_data_sync': 'Data synchronized',
                    'notif_session_resumed': 'Session resumed successfully',
                    'notif_enter_token': 'Please enter a token',
                    'notif_token_saved_securely': '✅ Token saved securely',
                    'confirm_purge_media': 'Are you sure you want to purge media older than {{days}} days?',
                    'notif_purge_start': '🧹 Starting media purge...',
                    'notif_purge_success': '✅ Media purged successfully!',
                    'notif_invalid_user_id': 'Invalid User ID (must start with @)',
                    'confirm_deactivate_user': 'Deactivate and purge data for {{userId}}? This cannot be undone!',
                    'notif_deactivating_user': '👤 Deactivating {{userId}}...',
                    'notif_user_deactivated': '✅ User deactivated and erased!',
                    'loading_stats': 'Fetching stats...',
                    'confirm_reboot': 'Are you sure you want to reboot the server?',
                    'notif_theme_saved': '✅ Theme saved!',
                    'notif_theme_reset': '🔄 Theme reset to default',
                    'notif_preset_applied': 'Preset applied: {{name}}',
                    'notif_token_saved': 'Token saved successfully'
                }}
            }
        }, () => {
            setLanguage(savedLng);
        });
    }

    // ============================================================
    // THEME BUILDER ENGINE
    // ============================================================
    const PRESETS = {
        electonet: { primary: '#ec4899', accent: '#8b5cf6', bg: '#0f0c29', card: '#1a153a' },
        ocean:    { primary: '#06b6d4', accent: '#3b82f6', bg: '#0c1929', card: '#132f4c' },
        forest:   { primary: '#10b981', accent: '#059669', bg: '#0a1f12', card: '#153a24' },
        sunset:   { primary: '#f97316', accent: '#ef4444', bg: '#1c0f05', card: '#3a2010' },
        midnight: { primary: '#6366f1', accent: '#a855f7', bg: '#0f0a29', card: '#1a1540' },
        cherry:   { primary: '#e11d48', accent: '#be123c', bg: '#1a0710', card: '#350e1f' }
    };

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }

    function applyThemeVars(theme) {
        const root = document.documentElement;
        if (theme.primary) {
            root.style.setProperty('--primary', theme.primary);
            const rgb = hexToRgb(theme.primary);
            root.style.setProperty('--primary-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
        }
        if (theme.accent) {
            root.style.setProperty('--accent', theme.accent);
            const rgb = hexToRgb(theme.accent);
            root.style.setProperty('--accent-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
        }
        if (theme.bg) root.style.setProperty('--bg-dark', theme.bg);
        if (theme.card) {
            const rgb = hexToRgb(theme.card);
            root.style.setProperty('--card-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
        }
        if (theme.sidebar) {
            const rgb = hexToRgb(theme.sidebar);
            root.style.setProperty('--sidebar-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
        }
        if (theme.glass != null) {
            root.style.setProperty('--glass-opacity', theme.glass / 100);
        }
        if (theme.bgImg) {
            root.style.setProperty('--bg-img-url', `url(${theme.bgImg})`);
        } else {
            root.style.setProperty('--bg-img-url', 'none');
        }
        if (theme.bgOpacity != null) {
            root.style.setProperty('--bg-img-opacity', theme.bgOpacity / 100);
        }
        if (theme.font) {
            document.body.style.fontFamily = theme.font;
        }
    }

    function populateThemeUI(theme) {
        const el = (id) => document.getElementById(id);
        if (theme.primary && el('themePrimary')) el('themePrimary').value = theme.primary;
        if (theme.accent && el('themeAccent')) el('themeAccent').value = theme.accent;
        if (theme.bg && el('themeBg')) el('themeBg').value = theme.bg;
        if (theme.card && el('themeCard')) el('themeCard').value = theme.card;
        if (theme.sidebar && el('themeSidebar')) el('themeSidebar').value = theme.sidebar;
        if (theme.bgImg && el('themeBgImg')) el('themeBgImg').value = theme.bgImg;
        if (theme.glass != null && el('themeGlass')) {
            el('themeGlass').value = theme.glass;
            if (el('glassValue')) el('glassValue').textContent = theme.glass + '%';
        }
        if (theme.bgOpacity != null && el('themeBgOpacity')) {
            el('themeBgOpacity').value = theme.bgOpacity;
            if (el('bgOpacityValue')) el('bgOpacityValue').textContent = theme.bgOpacity + '%';
        }
        if (theme.font && el('themeFont')) el('themeFont').value = theme.font;
    }

    // Load saved theme
    try {
        const saved = JSON.parse(localStorage.getItem('electonet_theme'));
        if (saved) { applyThemeVars(saved); populateThemeUI(saved); }
    } catch(e) {}

    // Live preview listeners
    ['themePrimary','themeAccent','themeBg','themeCard','themeSidebar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            const t = getCurrentThemeFromUI();
            applyThemeVars(t);
        });
    });

    const glassSlider = document.getElementById('themeGlass');
    if (glassSlider) glassSlider.addEventListener('input', () => {
        const val = glassSlider.value;
        if (document.getElementById('glassValue')) document.getElementById('glassValue').textContent = val + '%';
        applyThemeVars(getCurrentThemeFromUI());
    });

    const bgOpSlider = document.getElementById('themeBgOpacity');
    if (bgOpSlider) bgOpSlider.addEventListener('input', () => {
        const val = bgOpSlider.value;
        if (document.getElementById('bgOpacityValue')) document.getElementById('bgOpacityValue').textContent = val + '%';
        applyThemeVars(getCurrentThemeFromUI());
    });

    const bgImgInput = document.getElementById('themeBgImg');
    if (bgImgInput) bgImgInput.addEventListener('change', () => applyThemeVars(getCurrentThemeFromUI()));

    const fontSelect = document.getElementById('themeFont');
    if (fontSelect) fontSelect.addEventListener('change', () => applyThemeVars(getCurrentThemeFromUI()));

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = PRESETS[btn.dataset.preset];
            if (preset) {
                const t = { ...preset, sidebar: preset.bg, glass: 70, bgOpacity: 50, bgImg: '', font: "'Vazirmatn', 'Segoe UI', sans-serif" };
                applyThemeVars(t);
                populateThemeUI(t);
                showNotification(i18next.t('notif_preset_applied', { name: btn.dataset.preset }), 'info');
            }
        });
    });

    function getCurrentThemeFromUI() {
        return {
            primary: document.getElementById('themePrimary')?.value || '#ec4899',
            accent: document.getElementById('themeAccent')?.value || '#8b5cf6',
            bg: document.getElementById('themeBg')?.value || '#0f0c29',
            card: document.getElementById('themeCard')?.value || '#1a153a',
            sidebar: document.getElementById('themeSidebar')?.value || '#0f0c29',
            bgImg: document.getElementById('themeBgImg')?.value || '',
            glass: parseInt(document.getElementById('themeGlass')?.value || 70),
            bgOpacity: parseInt(document.getElementById('themeBgOpacity')?.value || 50),
            font: document.getElementById('themeFont')?.value || "'Vazirmatn', 'Segoe UI', sans-serif"
        };
    }

    // Save theme
    const saveBtn = document.getElementById('saveThemeBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        const t = getCurrentThemeFromUI();
        localStorage.setItem('electonet_theme', JSON.stringify(t));
        applyThemeVars(t);
        showNotification(i18next.t('notif_theme_saved'), 'success');
    });

    const resetBtn = document.getElementById('resetThemeBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        localStorage.removeItem('electonet_theme');
        const def = { ...PRESETS.electonet, sidebar: '#0f0c29', glass: 70, bgOpacity: 50, bgImg: '', font: "'Vazirmatn', sans-serif" };
        applyThemeVars(def);
        populateThemeUI(def);
        showNotification(i18next.t('notif_theme_reset'), 'info');
    });

    // Card glow mouse tracking
    document.querySelectorAll('.electonet-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
            card.style.setProperty('--mouse-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
        });
    });
});