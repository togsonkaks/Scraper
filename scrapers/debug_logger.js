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

  // Save captured logs to file - simple and reliable!
  async saveLogs() {
    if (this.logs.length === 0) return;
    
    try {
      // Create filename with timestamp and domain
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const domain = this.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `session_${timestamp}_${domain}.txt`;
      
      // Format logs for file output
      const logContent = [
        `=== DEBUG LOG SESSION ===`,
        `Session ID: ${this.sessionId}`,
        `URL: ${this.url}`,
        `Hostname: ${this.hostname}`,
        `Started: ${this.sessionStartTime}`,
        `Ended: ${new Date().toISOString()}`,
        `Total Logs: ${this.logs.length}`,
        `=========================\n`
      ];
      
      // Add each log entry
      this.logs.forEach((log, index) => {
        logContent.push(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`);
        if (log.callTrace) {
          logContent.push(`  Call Trace: ${log.callTrace}`);
        }
        if (log.metadata && Object.keys(log.metadata).length > 0) {
          logContent.push(`  Metadata: ${JSON.stringify(log.metadata, null, 2)}`);
        }
        logContent.push(''); // Empty line between entries
      });
      
      const fileContent = logContent.join('\n');
      
      // Save using simple file write (Electron main process will handle this)
      if (typeof window !== 'undefined' && window.api && window.api.saveDebugFile) {
        await window.api.saveDebugFile(filename, fileContent);
        console.log(`✅ DEBUG LOGGER: Saved ${this.logs.length} logs to debug-logs/${filename}`);
      } else {
        // Fallback - just log to console if file save not available
        console.log(`📄 DEBUG LOGGER: Would save to debug-logs/${filename}`);
        console.log('📄 File content preview:');
        console.log(fileContent.slice(0, 1000) + (fileContent.length > 1000 ? '\n... (truncated)' : ''));
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
      // Try IPC first
      if (typeof window !== 'undefined' && window.api && window.api.debugQueryLogs) {
        return await window.api.debugQueryLogs(query);
      } else {
        console.warn('❌ IPC not available, falling back to fetch');
        // Fallback to fetch for testing
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