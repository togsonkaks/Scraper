// Simple API server for debug logging database operations
const http = require('http');
const { Client } = require('pg');

// Database configuration from environment variables
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (req.url === '/api/save-debug-logs') {
          await handleSaveLogs(data, res);
        } else if (req.url === '/api/query-debug-logs') {
          await handleQueryLogs(data, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
      } catch (error) {
        console.error('API Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
});

// Handle saving debug logs
async function handleSaveLogs(data, res) {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    await client.query(data.query);
    await client.end();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error('Database save error:', error);
    await client.end();
    throw error;
  }
}

// Handle querying debug logs
async function handleQueryLogs(data, res) {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    const result = await client.query(data.query);
    await client.end();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.rows));
  } catch (error) {
    console.error('Database query error:', error);
    await client.end();
    throw error;
  }
}

// Start server
const PORT = 5001; // Use different port to avoid conflicts
server.listen(PORT, () => {
  console.log(`🚀 Debug API server running on port ${PORT}`);
});

module.exports = server;