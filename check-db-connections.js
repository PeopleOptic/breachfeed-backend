require('dotenv').config();
const { Client } = require('pg');

async function checkConnections() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!');

    // Check current connections
    const activeConnections = await client.query(`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        state,
        backend_start,
        state_change,
        NOW() - state_change as idle_time
      FROM pg_stat_activity
      WHERE datname = current_database()
      ORDER BY backend_start DESC
    `);

    console.log('\nActive connections:', activeConnections.rows.length);
    console.log('\nConnection details:');
    activeConnections.rows.forEach(conn => {
      console.log(`- PID: ${conn.pid}, User: ${conn.usename}, State: ${conn.state}, App: ${conn.application_name}, Idle: ${conn.idle_time}`);
    });

    // Check max connections
    const maxConnResult = await client.query('SHOW max_connections');
    console.log('\nMax connections allowed:', maxConnResult.rows[0].max_connections);

    // Check if there are idle connections we can terminate
    const idleConnections = activeConnections.rows.filter(conn => 
      conn.state === 'idle' && 
      conn.pid !== client.processID &&
      conn.idle_time && 
      parseFloat(conn.idle_time.minutes || 0) > 5
    );

    if (idleConnections.length > 0) {
      console.log(`\nFound ${idleConnections.length} idle connections older than 5 minutes.`);
      console.log('Would you like to terminate them? (This is safe for idle connections)');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('too many clients')) {
      console.log('\nThe database has reached its connection limit.');
      console.log('You may need to:');
      console.log('1. Wait a few minutes for connections to timeout');
      console.log('2. Contact Railway support to increase connection limits');
      console.log('3. Restart the database service from Railway dashboard');
    }
  } finally {
    await client.end();
  }
}

checkConnections().catch(console.error);