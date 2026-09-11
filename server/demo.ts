import { db, logAudit } from './db.ts';
import { hashPassword } from './auth.ts';

export function seedDemoScenario(adminUsername: string = 'admin') {
  // Clear any existing tasks, task_history, handovers, handover_tasks
  db.exec('DELETE FROM handover_tasks;');
  db.exec('DELETE FROM handovers;');
  db.exec('DELETE FROM task_history;');
  db.exec('DELETE FROM tasks;');

  // Ensure demo users exist: ahmed (Morning op), mohamed (Mid op), karim (Night op)
  const existingAhmed = db.prepare('SELECT id FROM users WHERE username = ?').get('ahmed');
  if (!existingAhmed) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('ahmed', hashPassword('Ahmed@123456'), 'Ahmed Hassan (Morning Op)', 'USER', 'ACTIVE', new Date().toISOString(), new Date().toISOString());
  }

  const existingMohamed = db.prepare('SELECT id FROM users WHERE username = ?').get('mohamed');
  if (!existingMohamed) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mohamed', hashPassword('Mohamed@123456'), 'Mohamed Ali (Mid Op)', 'USER', 'ACTIVE', new Date().toISOString(), new Date().toISOString());
  }

  const existingKarim = db.prepare('SELECT id FROM users WHERE username = ?').get('karim');
  if (!existingKarim) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('karim', hashPassword('Karim@123456'), 'Karim Tarek (Night Op)', 'USER', 'ACTIVE', new Date().toISOString(), new Date().toISOString());
  }

  const now = new Date();
  const morningDate = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const midDate = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  // Create Morning Shift Handover
  const handoverInsert = db.prepare(`
    INSERT INTO handovers (from_shift, to_shift, shift_date, closed_by, closed_at, acknowledged_by, acknowledged_at, general_notes, tasks_completed_count, tasks_carried_over_count, tasks_blocked_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  handoverInsert.run(
    'Morning',
    'Mid',
    now.toISOString().split('T')[0],
    'ahmed',
    morningDate,
    'mohamed',
    midDate,
    'Morning shift routine completed. 5 tasks opened and handed over to Mid shift for execution and backup checks.',
    0,
    5,
    0
  );

  // Insert the 5 tasks created in Morning and worked by Mid:
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, task_code, title, description, priority, status, category,
      created_by, created_at, original_shift, current_shift, assigned_user,
      due_date, last_updated_by, last_updated_at, completed_at, completed_by,
      completion_note, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Task 1: Check application logs (Completed by Mohamed)
  insertTask.run(
    1, 'TASK-000001', 'Check application logs', 'Review core web and API error rates across cluster pods.', 'High', 'Completed', 'Monitoring',
    'ahmed', morningDate, 'Morning', 'Mid', 'mohamed', null,
    'mohamed', midDate, midDate, 'mohamed', 'All pod log error thresholds verified within normal SLA (<0.02%).', 1
  );
  insertHistory.run(1, 'TASK-000001', 'Created', 'ahmed', 'Morning', null, 'Pending', 'Initial Morning shift task creation', morningDate);
  insertHistory.run(1, 'TASK-000001', 'Status Changed', 'mohamed', 'Mid', 'Pending', 'In Progress', 'Picked up for log log-parsing analysis', midDate);
  insertHistory.run(1, 'TASK-000001', 'Completed', 'mohamed', 'Mid', 'In Progress', 'Completed', 'All pod log error thresholds verified within normal SLA (<0.02%).', midDate);

  // Task 2: Review pending incidents (Completed by Mohamed)
  insertTask.run(
    2, 'TASK-000002', 'Review pending incidents', 'Check ITSM queue for any unassigned priority 2 tickets.', 'Medium', 'Completed', 'Incident',
    'ahmed', morningDate, 'Morning', 'Mid', 'mohamed', null,
    'mohamed', midDate, midDate, 'mohamed', 'Queue cleared. Two pending tickets assigned to Tier 3 vendor support.', 1
  );
  insertHistory.run(2, 'TASK-000002', 'Created', 'ahmed', 'Morning', null, 'Pending', 'Initial Morning shift task creation', morningDate);
  insertHistory.run(2, 'TASK-000002', 'Completed', 'mohamed', 'Mid', 'Pending', 'Completed', 'Queue cleared. Two pending tickets assigned to Tier 3 vendor support.', midDate);

  // Task 3: Check MQ queues (Completed by Mohamed)
  insertTask.run(
    3, 'TASK-000003', 'Check MQ queues', 'Verify message depth on payment transaction queues.', 'Critical', 'Completed', 'Infrastructure',
    'ahmed', morningDate, 'Morning', 'Mid', 'mohamed', null,
    'mohamed', midDate, midDate, 'mohamed', 'All message queues operating with zero backlog and low latency.', 1
  );
  insertHistory.run(3, 'TASK-000003', 'Created', 'ahmed', 'Morning', null, 'Pending', 'Initial Morning shift task creation', morningDate);
  insertHistory.run(3, 'TASK-000003', 'Completed', 'mohamed', 'Mid', 'Pending', 'Completed', 'All message queues operating with zero backlog and low latency.', midDate);

  // Task 4: Verify backup status (UNRESOLVED - For Mid shift close demonstration!)
  insertTask.run(
    4, 'TASK-000004', 'Verify backup status', 'Verify overnight database snapshot replication and integrity hash.', 'High', 'Pending', 'Database',
    'ahmed', morningDate, 'Morning', 'Mid', null, null,
    'ahmed', morningDate, null, null, null, 1
  );
  insertHistory.run(4, 'TASK-000004', 'Created', 'ahmed', 'Morning', null, 'Pending', 'Initial Morning shift task creation. Handed over to Mid shift.', morningDate);

  // Task 5: Check incidents (Completed by Mohamed)
  insertTask.run(
    5, 'TASK-000005', 'Check incidents', 'Perform routine health check on customer payment gateway integration.', 'Medium', 'Completed', 'Application',
    'ahmed', morningDate, 'Morning', 'Mid', 'mohamed', null,
    'mohamed', midDate, midDate, 'mohamed', 'Gateway responses tested and 100% successful.', 1
  );
  insertHistory.run(5, 'TASK-000005', 'Created', 'ahmed', 'Morning', null, 'Pending', 'Initial Morning shift task creation', morningDate);
  insertHistory.run(5, 'TASK-000005', 'Completed', 'mohamed', 'Mid', 'Pending', 'Completed', 'Gateway responses tested and 100% successful.', midDate);

  logAudit(adminUsername, 'Demo Scenario Loaded', 'SYSTEM', null, 'Loaded required Morning -> Mid forgotten task scenario (TASK-000004 pending)');
}
