// Automatic Debug Logger for Database Storage
// Captures all debug output during scraping operations

class DebugLogger {
  constructor() {
    this.sessionId = null;
    this.url = null;
    this.hostname = null;
    this.logs = [];
    this.isLogging = false;
    this.originalDebug = null;
    this.originalConsoleLog = null;
  }

  // Start capturing debug output for a scrape session
  startSession(url) {
    this.sessionId = this.generateSessionId();
    this.url = url;
    this.hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    this.logs = [];
    this.isLogging = true;
    
    console.log(`🎯 DEBUG LOGGER: Starting session ${this.sessionId} for ${this.hostname}`);
    
    // Intercept debug function calls
    this.interceptDebugCalls();
    
    return this.sessionId;
  }

  // Stop capturing and save all logs to database
  async endSession() {
    if (!this.isLogging) return;
    
    console.log(`💾 DEBUG LOGGER: Ending session ${this.sessionId}, saving ${this.logs.length} logs`);
    
    // Restore original debug functions
    this.restoreDebugCalls();
    
    // Save all captured logs to database
    if (this.logs.length > 0) {
      await this.saveLogs();
    }
    
    this.isLogging = false;
    this.sessionId = null;
  }

  // Intercept debug function calls to capture output
  interceptDebugCalls() {
    // Store original functions
    this.originalDebug = window.debug;
    this.originalConsoleLog = console.log;
    
    // Override debug function
    window.debug = (...args) => {
      this.captureLog('debug', args);
      if (this.originalDebug) this.originalDebug(...args);
    };
    
    // Override console.log for debug messages
    const originalLog = console.log;
    console.log = (...args) => {
      // Only capture debug-related console.logs (those with emojis/debug markers)
      const message = args.join(' ');
      if (this.isDebugMessage(message)) {
        this.captureLog('info', args);
      }
      originalLog(...args);
    };
  }

  // Restore original debug functions
  restoreDebugCalls() {
    if (this.originalDebug) {
      window.debug = this.originalDebug;
    }
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
  }

  // Check if a console message is debug-related
  isDebugMessage(message) {
    const debugMarkers = [
      '🔍', '🎯', '✅', '❌', '📉', '🖼️', '🔄', '✨', '📍', 
      '🧩', '💰', '📝', '🏷️', '📄', '🚀', '⚠️', '🔧', '💾',
      'DEBUG', 'TRACE', 'CALL TRACE', 'RELEVANCE', 'HYBRID FILTERING'
    ];
    return debugMarkers.some(marker => message.includes(marker));
  }

  // Capture a log entry
  captureLog(level, args) {
    if (!this.isLogging) return;
    
    const message = args.join(' ');
    const callTrace = this.getCallTrace();
    
    // Extract metadata from debug messages
    const metadata = this.extractMetadata(message);
    
    this.logs.push({
      level,
      message,
      callTrace,
      metadata,
      timestamp: new Date().toISOString()
    });
  }

  // Get call stack trace
  getCallTrace() {
    try {
      const stack = new Error().stack;
      return stack.split('\n').slice(3, 6).map(line => line.trim()).join(' -> ');
    } catch (e) {
      return null;
    }
  }

  // Extract structured metadata from debug messages
  extractMetadata(message) {
    const metadata = {};
    
    // Extract counts and numbers
    const countMatch = message.match(/{"inputCount":(\d+)}/);
    if (countMatch) metadata.inputCount = parseInt(countMatch[1]);
    
    const foundMatch = message.match(/found (\d+) elements/);
    if (foundMatch) metadata.elementsFound = parseInt(foundMatch[1]);
    
    // Extract scores
    const scoreMatch = message.match(/score[:\s]+(\d+)/);
    if (scoreMatch) metadata.score = parseInt(scoreMatch[1]);
    
    // Extract URLs
    const urlMatch = message.match(/(https?:\/\/[^\s)]+)/);
    if (urlMatch) metadata.extractedUrl = urlMatch[1];
    
    // Extract selectors
    const selectorMatch = message.match(/selector[:\s]+'([^']+)'/i);
    if (selectorMatch) metadata.selector = selectorMatch[1];
    
    // Mark important events
    if (message.includes('RELEVANCE GATE')) metadata.relevanceGate = true;
    if (message.includes('LOW SCORE REJECTED')) metadata.rejected = true;
    if (message.includes('HYBRID FILTERING')) metadata.filtering = true;
    if (message.includes('CALL TRACE')) metadata.trace = true;
    
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  // Save captured logs to database
  async saveLogs() {
    try {
      // Prepare batch insert
      const values = this.logs.map(log => 
        `('${this.sessionId}', '${this.url}', '${this.hostname}', '${log.level}', $Q$${log.message}$Q$, ${log.callTrace ? `$Q$${log.callTrace}$Q$` : 'NULL'}, ${log.metadata ? `'${JSON.stringify(log.metadata)}'::jsonb` : 'NULL'}, '${log.timestamp}')`
      ).join(',\n');
      
      const query = `
        INSERT INTO debug_logs (scrape_session_id, url, hostname, log_level, message, call_trace, metadata, timestamp)
        VALUES ${values}
      `;
      
      // Save to database using Node.js fetch to localhost
      const response = await fetch('http://localhost:8000/api/save-debug-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      if (response.ok) {
        console.log(`✅ DEBUG LOGGER: Saved ${this.logs.length} logs to database`);
      } else {
        console.error('❌ DEBUG LOGGER: Failed to save logs:', response.statusText);
      }
      
    } catch (error) {
      console.error('❌ DEBUG LOGGER: Error saving logs:', error);
    }
  }

  // Generate unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Query methods for retrieving logs

  // Get latest session logs
  static async getLatestSession() {
    return await this.queryLogs(`
      SELECT DISTINCT scrape_session_id, url, hostname, 
             MIN(timestamp) as started_at, 
             MAX(timestamp) as ended_at,
             COUNT(*) as log_count
      FROM debug_logs 
      GROUP BY scrape_session_id, url, hostname
      ORDER BY started_at DESC 
      LIMIT 1
    `);
  }

  // Get all logs for a session
  static async getSessionLogs(sessionId) {
    return await this.queryLogs(`
      SELECT * FROM debug_logs 
      WHERE scrape_session_id = '${sessionId}'
      ORDER BY timestamp ASC
    `);
  }

  // Search logs by pattern
  static async searchLogs(pattern, limit = 100) {
    return await this.queryLogs(`
      SELECT * FROM debug_logs 
      WHERE message ILIKE '%${pattern}%'
      ORDER BY timestamp DESC 
      LIMIT ${limit}
    `);
  }

  // Find duplicate processing patterns
  static async findDuplicateProcessing(sessionId = null) {
    const sessionFilter = sessionId ? `AND scrape_session_id = '${sessionId}'` : '';
    return await this.queryLogs(`
      SELECT message, COUNT(*) as occurrence_count,
             array_agg(DISTINCT call_trace) as call_traces,
             MIN(timestamp) as first_seen,
             MAX(timestamp) as last_seen
      FROM debug_logs 
      WHERE message LIKE '%Trying selector%' OR message LIKE '%HYBRID FILTERING%'
      ${sessionFilter}
      GROUP BY message
      HAVING COUNT(*) > 1
      ORDER BY occurrence_count DESC
    `);
  }

  // Helper method to execute database queries
  static async queryLogs(query) {
    try {
      const response = await fetch('http://localhost:8000/api/query-debug-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        console.error('❌ Failed to query debug logs:', response.statusText);
        return [];
      }
    } catch (error) {
      console.error('❌ Error querying debug logs:', error);
      return [];
    }
  }
}

// Global debug logger instance
window.debugLogger = new DebugLogger();

// Convenience functions for easy access
window.startDebugLogging = (url) => window.debugLogger.startSession(url);
window.stopDebugLogging = () => window.debugLogger.endSession();
window.getLatestLogs = () => DebugLogger.getLatestSession();
window.findDuplicates = (sessionId) => DebugLogger.findDuplicateProcessing(sessionId);
window.searchDebugLogs = (pattern) => DebugLogger.searchLogs(pattern);