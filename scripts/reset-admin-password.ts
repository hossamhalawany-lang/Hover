import { db } from '../server/db.ts';
import { hashPassword } from '../server/auth.ts';

const args = process.argv.slice(2);
const username = args[0] || 'admin';
const newPassword = args[1] || 'Admin@123456';

console.log(`\n=============================================`);
console.log(`   Emergency Password Reset Utility`);
console.log(`=============================================\n`);

try {
  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE username = ?').get(username.trim().toLowerCase()) as any;

  if (!user) {
    console.error(`❌ Error: User "${username}" not found in database.`);
    const allUsers = db.prepare('SELECT id, username, full_name, role FROM users').all() as any[];
    console.log(`\nAvailable users in the database:`);
    allUsers.forEach(u => console.log(` - ID: ${u.id}, Username: "${u.username}", Name: "${u.full_name}", Role: ${u.role}`));
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error(`❌ Error: Password must be at least 8 characters long.`);
    process.exit(1);
  }

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  console.log(`✅ Success! Password for user "${user.username}" (${user.full_name}) has been reset.`);
  console.log(`   New Password: ${newPassword}`);
  console.log(`   Role: ${user.role}`);
  console.log(`\nYou can now log in using these credentials.\n`);
} catch (error: any) {
  console.error(`❌ Failed to reset password:`, error.message);
  process.exit(1);
}
