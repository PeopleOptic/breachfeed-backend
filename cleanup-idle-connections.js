require('dotenv').config();
const { Client } = require('pg');

async function cleanupIdleConnections() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    // Get idle connections
    const idleConnections = await client.query(`
      SELECT 
        pid,
        usename,
        application_name,
        state,
        state_change,
        NOW() - state_change as idle_time,
        query
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND state IN ('idle', 'idle in transaction')
        AND pid != pg_backend_pid()
      ORDER BY state_change
    `);
    
    console.log(`\nFound ${idleConnections.rows.length} idle connections:\n`);
    
    let terminated = 0;
    
    for (const conn of idleConnections.rows) {
      const idleMinutes = conn.idle_time ? parseInt(conn.idle_time.minutes || 0) : 0;
      
      console.log(`PID: ${conn.pid} | User: ${conn.usename} | State: ${conn.state} | Idle: ${idleMinutes} minutes`);
      
      // Terminate connections idle for more than 5 minutes
      if (idleMinutes > 5) {
        try {
          await client.query('SELECT pg_terminate_backend($1)', [conn.pid]);
          console.log(`  ✓ Terminated`);
          terminated++;
        } catch (err) {
          console.log(`  ✗ Failed to terminate: ${err.message}`);
        }
      }
    }
    
    console.log(`\n✅ Cleanup complete. Terminated ${terminated} idle connections.`);
    
    // Show current connection count
    const currentStats = await client.query(`
      SELECT count(*) as total_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    
    console.log(`\nCurrent total connections: ${currentStats.rows[0].total_connections}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanupIdleConnections();