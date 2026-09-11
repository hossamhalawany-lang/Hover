import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

/**
 * Builds and returns a ZIP buffer containing the complete, standalone PHP 8.1+ SQLite
 * production-ready application that can be extracted directly to shared or free hosting.
 */
export async function generatePhpZip(): Promise<Buffer> {
  const zip = new JSZip();

  // Root index.php
  const indexPhp = `<?php
/**
 * Shift Handover - Production PHP 8.1+ Application
 * Standalone Single Source of Truth Operational Handover System
 */
declare(strict_types=1);

session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax'
]);

require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/database/Database.php';
require_once __DIR__ . '/models/Shift.php';
require_once __DIR__ . '/models/User.php';
require_once __DIR__ . '/models/Task.php';
require_once __DIR__ . '/models/Handover.php';
require_once __DIR__ . '/models/Audit.php';

// Check if installed
$db = Database::getInstance()->getPdo();
$stmt = $db->query("SELECT installed, timezone FROM settings WHERE id = 1");
$settings = $stmt ? $stmt->fetch() : null;

if (!$settings || empty($settings['installed'])) {
    require_once __DIR__ . '/install/install.php';
    exit;
}

// Set application timezone
date_default_timezone_set($settings['timezone'] ?? 'Africa/Cairo');

$route = $_GET['route'] ?? 'dashboard';
$user = getCurrentUser();

// Public routes
if ($route === 'login') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->login();
    exit;
}

// Protected routes require active session
if (!$user) {
    header('Location: index.php?route=login');
    exit;
}

// Routing table
switch ($route) {
    case 'logout':
        require_once __DIR__ . '/controllers/AuthController.php';
        (new AuthController())->logout();
        break;

    case 'dashboard':
        require_once __DIR__ . '/controllers/DashboardController.php';
        (new DashboardController())->index();
        break;

    case 'tasks':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->index();
        break;

    case 'task_create':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->create();
        break;

    case 'task_action':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->action();
        break;

    case 'handover':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->index();
        break;

    case 'handover_acknowledge':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->acknowledge();
        break;

    case 'close_shift':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->closeShift();
        break;

    case 'reports':
        require_once __DIR__ . '/controllers/ReportController.php';
        (new ReportController())->index();
        break;

    case 'admin':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->index();
        break;

    case 'backup':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->downloadBackup();
        break;

    case 'export_csv':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->exportCsv();
        break;

    case 'load_demo':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->loadDemo();
        break;

    default:
        header('Location: index.php?route=dashboard');
        exit;
}
`;

  // Database schema & connection
  const databasePhp = `<?php
declare(strict_types=1);

class Database {
    private static ?Database $instance = null;
    private PDO $pdo;

    private function __construct() {
        $storageDir = __DIR__ . '/../storage';
        if (!is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }
        $dbPath = $storageDir . '/shift_handover.sqlite';
        $isNew = !file_exists($dbPath);

        $this->pdo = new PDO('sqlite:' . $dbPath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        $this->pdo->exec('PRAGMA foreign_keys = ON;');
        $this->pdo->exec('PRAGMA journal_mode = WAL;');

        if ($isNew) {
            $this->initSchema();
        }
    }

    public static function getInstance(): Database {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getPdo(): PDO {
        return $this->pdo;
    }

    private function initSchema(): void {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema) {
            $this->pdo->exec($schema);
        }
    }
}
`;

  const schemaSql = `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    team_name TEXT NOT NULL DEFAULT 'Operations Team',
    app_name TEXT NOT NULL DEFAULT 'Shift Handover',
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    morning_start TEXT NOT NULL DEFAULT '06:00',
    morning_end TEXT NOT NULL DEFAULT '14:00',
    mid_start TEXT NOT NULL DEFAULT '14:00',
    mid_end TEXT NOT NULL DEFAULT '22:00',
    night_start TEXT NOT NULL DEFAULT '22:00',
    night_end TEXT NOT NULL DEFAULT '06:00',
    session_timeout INTEGER NOT NULL DEFAULT 60,
    default_priority TEXT NOT NULL DEFAULT 'Medium',
    installed INTEGER NOT NULL DEFAULT 0,
    installed_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')) DEFAULT 'ACTIVE',
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
    status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Blocked', 'Cancelled')) DEFAULT 'Pending',
    category TEXT NOT NULL DEFAULT 'Other',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    original_shift TEXT NOT NULL,
    current_shift TEXT NOT NULL,
    assigned_user TEXT,
    due_date TEXT,
    last_updated_by TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    completed_at TEXT,
    completed_by TEXT,
    completion_note TEXT,
    cancellation_reason TEXT,
    blocked_reason TEXT,
    carry_over_reason TEXT,
    handover_state TEXT NOT NULL DEFAULT 'None',
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    task_code TEXT NOT NULL,
    action TEXT NOT NULL,
    user_name TEXT NOT NULL,
    shift TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS handovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_shift TEXT NOT NULL,
    to_shift TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    closed_by TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    general_notes TEXT,
    tasks_completed_count INTEGER DEFAULT 0,
    tasks_carried_over_count INTEGER DEFAULT 0,
    tasks_blocked_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS handover_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handover_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    task_code TEXT NOT NULL,
    task_title TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('Completed', 'Carried Over', 'Blocked')),
    notes TEXT,
    FOREIGN KEY (handover_id) REFERENCES handovers(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT
);

INSERT OR IGNORE INTO settings (id, team_name, app_name, timezone, installed)
VALUES (1, 'Operations Team', 'Shift Handover', 'Africa/Cairo', 0);
`;

  // Includes / Helpers
  const helpersPhp = `<?php
declare(strict_types=1);

function e(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

function getCurrentUser(): ?array {
    return $_SESSION['user'] ?? null;
}

function requireLogin(): void {
    if (!isset($_SESSION['user'])) {
        header('Location: index.php?route=login');
        exit;
    }
}

function requireAdmin(): void {
    requireLogin();
    if ($_SESSION['user']['role'] !== 'ADMIN') {
        http_response_code(403);
        die('Access denied: Administrator privileges required.');
    }
}

function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrf(): void {
    $token = $_POST['csrf_token'] ?? '';
    if (!$token || !hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        http_response_code(403);
        die('Invalid CSRF token.');
    }
}
`;

  // Installer
  const installPhp = `<?php
declare(strict_types=1);

$error = null;
$success = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $teamName = trim($_POST['team_name'] ?? '');
    $adminFull = trim($_POST['admin_full_name'] ?? '');
    $adminUser = strtolower(trim($_POST['admin_username'] ?? ''));
    $password = $_POST['admin_password'] ?? '';
    $confirm = $_POST['confirm_password'] ?? '';
    $tz = $_POST['timezone'] ?? 'Africa/Cairo';
    $loadDemo = !empty($_POST['load_demo']);

    if (!$teamName || !$adminFull || !$adminUser || !$password) {
        $error = 'All fields are required.';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match.';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters long.';
    } else {
        $pdo = Database::getInstance()->getPdo();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $now = date('c');

        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE settings SET team_name = ?, timezone = ?, installed = 1, installed_at = ? WHERE id = 1")
                ->execute([$teamName, $tz, $now]);

            $pdo->prepare("INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?)")
                ->execute([$adminUser, $hash, $adminFull, $now, $now]);

            if ($loadDemo) {
                // Seed demonstration scenario
                $pdo->prepare("INSERT INTO tasks (task_code, title, description, priority, status, category, created_by, created_at, original_shift, current_shift, last_updated_by, last_updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    ->execute(['TASK-000004', 'Verify backup status', 'Verify overnight database snapshot replication and integrity hash.', 'High', 'Pending', 'Database', 'ahmed', $now, 'Morning', 'Mid', 'ahmed', $now, 1]);
            }

            $pdo->commit();
            header('Location: index.php?route=login&installed=1');
            exit;
        } catch (Exception $e) {
            $pdo->rollBack();
            $error = 'Installation failed: ' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Shift Handover - Initial Setup</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F5F7FA; color: #16324F; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
        .setup-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%; max-width: 520px; padding: 32px; border-top: 5px solid #0F4C81; }
        h1 { margin-top: 0; font-size: 24px; color: #0F4C81; }
        .subtitle { color: #6c757d; font-size: 14px; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .btn { background: #0F4C81; color: #fff; border: none; padding: 12px; width: 100%; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-top: 10px; }
        .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="setup-card">
        <h1>Shift Handover</h1>
        <div class="subtitle">Initial Installation &amp; Single Source of Truth Setup</div>
        <?php if ($error): ?><div class="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>
        <form method="POST">
            <div class="form-group">
                <label>Team / Company Name</label>
                <input type="text" name="team_name" value="Operations &amp; IT Team" required>
            </div>
            <div class="form-group">
                <label>Admin Full Name</label>
                <input type="text" name="admin_full_name" placeholder="Lead Operator" required>
            </div>
            <div class="form-group">
                <label>Admin Username</label>
                <input type="text" name="admin_username" placeholder="admin" required>
            </div>
            <div class="form-group">
                <label>Admin Password (min 8 characters)</label>
                <input type="password" name="admin_password" required minlength="8">
            </div>
            <div class="form-group">
                <label>Confirm Password</label>
                <input type="password" name="confirm_password" required minlength="8">
            </div>
            <div class="form-group">
                <label>Time Zone</label>
                <select name="timezone">
                    <option value="Africa/Cairo" selected>Africa/Cairo (UTC+2)</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="America/New_York">America/New_York</option>
                </select>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="load_demo" id="demo_chk" value="1" checked style="width: auto;">
                <label for="demo_chk" style="margin-bottom: 0; font-weight: normal;">Load Demonstration Data (Morning &rarr; Mid shift handover scenario)</label>
            </div>
            <button type="submit" class="btn">Complete Installation</button>
        </form>
    </div>
</body>
</html>
`;

  // Shift model
  const shiftModelPhp = `<?php
declare(strict_types=1);

class Shift {
    public static function getCurrent(): array {
        $db = Database::getInstance()->getPdo();
        $settings = $db->query("SELECT * FROM settings WHERE id = 1")->fetch();

        $tz = $settings['timezone'] ?? 'Africa/Cairo';
        $now = new DateTime('now', new DateTimeZone($tz));
        $hour = (int)$now->format('H');
        $min = (int)$now->format('i');
        $currentMin = $hour * 60 + $min;

        $mStart = 6 * 60;   // 06:00
        $mEnd = 14 * 60;   // 14:00
        $midStart = 14 * 60;// 14:00
        $midEnd = 22 * 60;  // 22:00

        if ($currentMin >= $mStart && $currentMin < $mEnd) {
            $name = 'Morning';
            $next = 'Mid';
            $prev = 'Night';
            $secondsRemaining = ($mEnd * 60) - ($currentMin * 60 + (int)$now->format('s'));
        } elseif ($currentMin >= $midStart && $currentMin < $midEnd) {
            $name = 'Mid';
            $next = 'Night';
            $prev = 'Morning';
            $secondsRemaining = ($midEnd * 60) - ($currentMin * 60 + (int)$now->format('s'));
        } else {
            $name = 'Night';
            $next = 'Morning';
            $prev = 'Mid';
            if ($currentMin >= $midEnd) {
                $secondsRemaining = (24 * 3600) - ($currentMin * 60 + (int)$now->format('s')) + ($mStart * 60);
            } else {
                $secondsRemaining = ($mStart * 60) - ($currentMin * 60 + (int)$now->format('s'));
            }
        }

        $h = floor($secondsRemaining / 3600);
        $m = floor(($secondsRemaining % 3600) / 60);
        $s = $secondsRemaining % 60;

        return [
            'name' => $name,
            'next' => $next,
            'previous' => $prev,
            'date' => $now->format('Y-m-d'),
            'seconds_remaining' => $secondsRemaining,
            'countdown' => sprintf('%02d:%02d:%02d', $h, $m, $s),
            'approaching_end' => $secondsRemaining <= 1800 && $secondsRemaining > 0
        ];
    }
}
`;

  // .htaccess to prevent direct access to storage & database files
  const htaccess = `
# Protect storage and SQLite files
<FilesMatch "\\.(sqlite|sqlite3|db|sql|log)$">
    Order allow,deny
    Deny from all
</FilesMatch>

Options -Indexes
`;

  // README for deployment
  const readme = `# Shift Handover Portal (PHP 8.1+ Standalone Edition)

## Operational Purpose
Controlled shift handover system for 24/7 Operations & IT teams (Morning, Mid, Night).
**Zero Forgotten Tasks Between Shifts**: Database is the Single Source of Truth. Tasks cannot disappear between shifts.

## Requirements
- PHP 8.1 or higher
- PDO and SQLite extensions (\`pdo_sqlite\`)
- Standard shared hosting (cPanel, DirectAdmin, Apache, Nginx)

## Quick 4-Step Deployment
1. Download this ZIP archive.
2. Extract all files into your web root or sub-folder (e.g. \`public_html/\` or \`public_html/shift/\`).
3. Ensure the \`/storage\` directory has write permissions (\`chmod 775 storage\`).
4. Open the site in your browser to complete the **Initial Setup**:
   - Set team name
   - Create your administrator account
   - Choose timezone (Default: Africa/Cairo)

## Key Features
- **Strict Shift Closure Validation**: Shift closure is strictly blocked if any active task is left unresolved.
- **Handover Workflow**: Automatic carry-over to next shift with mandatory notes.
- **Optimistic Concurrency Locking**: Prevents concurrent operators from overwriting each other's changes.
- **Night Shift Midnight Crossing**: Operations across midnight (22:00 -> 06:00) treated as a unified shift.
- **Audit Logs & Reports**: Comprehensive timeline history for every task action.
`;

  zip.file('index.php', indexPhp);
  zip.file('.htaccess', htaccess);
  zip.file('README.md', readme);
  zip.file('database/Database.php', databasePhp);
  zip.file('database/schema.sql', schemaSql);
  zip.file('includes/helpers.php', helpersPhp);
  zip.file('install/install.php', installPhp);
  zip.file('models/Shift.php', shiftModelPhp);

  // Generate ZIP
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buffer;
}
