import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { BRAND } from '@humanly/shared';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class TrackerController {
  /**
   * Serve the tracker JavaScript file
   */
  static serveTracker(req: Request, res: Response): void {
    try {
      const filename = req.params.filename || BRAND.tracker.scriptFilename;

      // Validate filename to prevent directory traversal
      const allowedFiles = [
        // New branding
        'humanly-tracker.min.js',
        'humanly-tracker.js',
        'humanly-tracker.esm.js',
        'humanly-tracker.min.js.map',
        'humanly-tracker.js.map',
        'humanly-tracker.esm.js.map',
        // Legacy support
        'humanly-tracker.min.js',
        'humanly-tracker.js',
        'humanly-tracker.esm.js',
        'humanly-tracker.min.js.map',
        'humanly-tracker.js.map',
        'humanly-tracker.esm.js.map',
        // Test files
        'test-tracker-debug.html',
        'test-tracker.html',
      ];

      if (!allowedFiles.includes(filename)) {
        res.status(404).json({
          success: false,
          error: 'File not found',
        });
        return;
      }

      // Construct path based on file type
      let filePath: string;
      if (filename.endsWith('.html')) {
        // HTML test files are in the root directory
        filePath = path.join(__dirname, '..', '..', '..', '..', filename);
      } else {
        // Tracker JS files are in tracker/dist
        filePath = path.join(
          __dirname,
          '..',
          '..',
          '..',
          'tracker',
          'dist',
          filename
        );
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        logger.warn(`File not found: ${filePath}`);
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: filename.endsWith('.html')
            ? 'Test file not found'
            : 'Please build the tracker package first: pnpm build:tracker',
        });
        return;
      }

      // Set appropriate headers
      let contentType = 'application/javascript';
      if (filename.endsWith('.map')) {
        contentType = 'application/json';
      } else if (filename.endsWith('.html')) {
        contentType = 'text/html';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for tracker

      // Send file
      res.sendFile(filePath);
    } catch (error) {
      logger.error('Error serving tracker file', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Get tracker snippet code
   */
  static getSnippet(req: Request, res: Response): void {
    const { taskToken, apiUrl, type, userIdField } = req.query;

    if (!taskToken) {
      res.status(400).json({
        success: false,
        error: 'Task token is required',
      });
      return;
    }

    // Determine base URL - prefer HTTPS for production/external integrations
    let baseUrl: string;
    if (apiUrl) {
      baseUrl = apiUrl as string;
    } else {
      const host = req.get('host') || 'localhost:3001';
      // Check if request is over HTTPS (trust proxy headers)
      const proto = req.get('x-forwarded-proto') || req.protocol;
      const isSecure = proto === 'https';
      const protocol = isSecure ? 'https' : 'http';
      baseUrl = `${protocol}://${host}`;
    }

    // Add cache-busting version parameter for latest tracker
    const trackerVersion = '20251227-v2';
    const trackerUrl = `${baseUrl}/tracker/${BRAND.tracker.scriptFilename}?v=${trackerVersion}`;
    const integrationType = (type as string)?.toLowerCase() || 'standard';

    let snippet = '';
    let instructions = '';

    if (integrationType === 'qualtrics') {
      // Qualtrics-specific integration
      snippet = `/*
 * ${BRAND.name} Tracker - Qualtrics Integration
 *
 * Instructions:
 * 1. In your Qualtrics survey editor, click "Look & Feel" (paint brush icon)
 * 2. Go to "General" tab and click "Edit" in the Header section
 * 3. Paste this entire code block
 * 4. Click "Apply" and "Save"
 *
 * OR add it to a question's JavaScript:
 * 1. Select a question in your survey
 * 2. Click the gear icon and select "Add JavaScript"
 * 3. Paste the code below in the addOnload section
 *
 * No configuration needed - works out of the box!
 */

// Debug flag - set to false to disable console logging
var DEBUG = true;

// Helper logging functions
function log(message, data) {
    if (DEBUG) {
        var timestamp = new Date().toLocaleTimeString();
        if (data !== undefined) {
            console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message, data);
        } else {
            console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message);
        }
    }
}

function logError(message, error) {
    if (DEBUG) {
        var timestamp = new Date().toLocaleTimeString();
        console.error('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message, error || '');
    }
}

function logSuccess(message) {
    if (DEBUG) {
        var timestamp = new Date().toLocaleTimeString();
        console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ✓ ' + message);
    }
}

Qualtrics.SurveyEngine.addOnload(function() {
    var self = this;

    // Intercept network requests for debugging
    if (DEBUG && typeof fetch !== 'undefined') {
        var originalFetch = window.fetch;
        window.fetch = function() {
            var url = arguments[0];
            if (typeof url === 'string' && (url.includes('/track/') || url.includes('/health'))) {
                log('📡 Network request to: ' + url);
                return originalFetch.apply(this, arguments).then(function(response) {
                    var clonedResponse = response.clone();
                    if (response.status >= 200 && response.status < 300) {
                        log('✓ Response from: ' + url + ' - Status: ' + response.status);
                    } else {
                        logError('✗ Response from: ' + url + ' - Status: ' + response.status);
                    }
                    return response;
                }).catch(function(error) {
                    logError('✗ Network request failed: ' + url, error);
                    throw error;
                });
            }
            return originalFetch.apply(this, arguments);
        };
    }

    log('🚀 ${BRAND.name} Tracker - Qualtrics Integration Starting...');
    log('Configuration:', {
        taskToken: '${taskToken}'.substring(0, 10) + '...',
        apiUrl: '${baseUrl}',
        debug: DEBUG
    });

    // Load ${BRAND.name} tracking script
    var script = document.createElement('script');
    script.src = '${trackerUrl}';
    script.async = true;

    script.onload = function() {
        logSuccess('Tracker script loaded from: ${trackerUrl}');

        // Check if tracker class is available
        if (typeof window.${BRAND.tracker.namespace}Tracker === 'undefined') {
            logError('${BRAND.tracker.namespace}Tracker class not found!');
            logError('Available objects:', Object.keys(window).filter(function(k) {
                return k.toLowerCase().includes('tracker') || k.toLowerCase().includes('${BRAND.tracker.namespace.toLowerCase()}');
            }));
            logError('Please check:');
            logError('1. The tracker script URL is correct: ${trackerUrl}');
            logError('2. The script loaded without errors (check Network tab)');
            logError('3. No JavaScript errors occurred during script loading');
            return;
        }

        log('Creating tracker instance...');

        try {
            // Initialize tracker (no userId needed - auto-generated)
            var tracker = new window.${BRAND.tracker.namespace}Tracker({
                taskToken: '${taskToken}',
                apiUrl: '${baseUrl}',
                debug: DEBUG  // Pass debug flag to tracker
            });

            logSuccess('Tracker object created');
            log('Initializing session...');

            // Start tracking
            tracker.init().then(function() {
                logSuccess('Session initialized - Session ID: ' + (tracker.sessionId ? tracker.sessionId.substring(0, 8) + '...' : 'N/A'));

                if (DEBUG) {
                    log('📊 Configuration Details:');
                    log('  - API URL: ${baseUrl}');
                    log('  - Max Batch Size: 20 events (or every 30 seconds)');
                    log('  - Debug Mode: ON');
                    console.log('  - Open DevTools (F12) to see live event tracking');
                }

                // Test connection to backend
                log('🔗 Testing backend connection...');
                fetch('${baseUrl}/health')
                    .then(function(response) {
                        return response.json();
                    })
                    .then(function(data) {
                        logSuccess('Backend health check passed');
                        log('Backend response:', data);
                    })
                    .catch(function(error) {
                        logError('Backend health check failed', error);
                        logError('Verify that ${baseUrl} is accessible from your browser');
                    });

                // IMPORTANT: Wait for Qualtrics to render fields before attaching
                log('⏳ Waiting for Qualtrics to render form fields...');
                setTimeout(function() {
                    // Check what fields are available
                    var textFields = document.querySelectorAll('input[type="text"], textarea, input:not([type]), [contenteditable="true"]');
                    log('🔍 Found ' + textFields.length + ' text field(s) on page');

                    if (textFields.length === 0) {
                        console.warn('${BRAND.tracker.consolePrefix} ⚠️ No text fields found yet. Qualtrics may still be loading...');
                        console.log('${BRAND.tracker.consolePrefix} Total inputs on page:', document.querySelectorAll('input').length);
                    }

                    // Attach to form fields
                    log('🔗 Attaching event listeners to form fields...');
                    tracker.attach();

                    // Confirm what was attached
                    setTimeout(function() {
                        var trackedFields = document.querySelectorAll('input[type="text"], textarea, input:not([type]), [contenteditable="true"]');
                        logSuccess('Ready! Monitoring ' + trackedFields.length + ' text field(s)');

                        if (DEBUG) {
                            console.log('');
                            console.log('═══════════════════════════════════════════════════════════');
                            console.log('🎯 ${BRAND.name.toUpperCase()} TRACKER IS NOW ACTIVE');
                            console.log('═══════════════════════════════════════════════════════════');
                            console.log('✓ Tracking: Keystrokes, paste, copy, cut, focus, blur');
                            console.log('✓ Events batched: Every 20 events OR 30 seconds');
                            console.log('✓ View live preview: Check your ${BRAND.name} dashboard');
                            console.log('ℹ Type in any field above to see events being tracked');
                            console.log('═══════════════════════════════════════════════════════════');
                            console.log('');
                        }
                    }, 200);
                }, 500);
            }).catch(function(error) {
                logError('Failed to initialize tracker', error);
                logError('Error details: ' + (error.message || JSON.stringify(error)));
                console.error('');
                console.error('═══════════════════════════════════════════════════════════');
                console.error('❌ ${BRAND.name.toUpperCase()} TRACKER INITIALIZATION FAILED');
                console.error('═══════════════════════════════════════════════════════════');
                console.error('Possible causes:');
                console.error('1. Invalid task token');
                console.error('2. Backend API is not accessible');
                console.error('3. CORS issues (check your API configuration)');
                console.error('4. Network connectivity problems');
                console.error('═══════════════════════════════════════════════════════════');
                console.error('');
            });

            // Store tracker globally and on question context
            self.humanlyTracker = tracker;
            window.humanlyTrackerInstance = tracker;

            if (DEBUG) {
                log('✓ Tracker stored globally as window.humanlyTrackerInstance');
            }
        } catch (error) {
            logError('Failed to create tracker instance', error);
        }
    };

    script.onerror = function() {
        logError('Failed to load ${BRAND.name} tracker script from: ${trackerUrl}');
        console.error('');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ ${BRAND.name.toUpperCase()} TRACKER SCRIPT FAILED TO LOAD');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Possible causes:');
        console.error('1. Qualtrics requires HTTPS - make sure your API URL uses https://');
        console.error('2. The tracker script is not accessible from this domain');
        console.error('3. Your server is not responding');
        console.error('4. CORS headers are not configured correctly');
        console.error('');
        console.error('Script URL attempted: ${trackerUrl}');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('');
    };

    log('Loading tracker script...');
    document.head.appendChild(script);
});

// Mark as submitted on page submit (each page in multi-page surveys)
Qualtrics.SurveyEngine.addOnPageSubmit(function() {
    if (DEBUG) {
        log('📄 Page submit detected');
    }

    var tracker = this.humanlyTracker || window.humanlyTrackerInstance;
    if (tracker) {
        if (DEBUG) {
            log('📤 Attempting to mark session as submitted...');
        }
        tracker.markSubmitted().then(function() {
            if (DEBUG) {
                logSuccess('Session marked as submitted');
            }
        }).catch(function(error) {
            logError('Failed to mark as submitted', error);
        });
    } else {
        if (DEBUG) {
            console.warn('${BRAND.tracker.consolePrefix} ⚠️ Tracker not found on page submit');
        }
    }
});

// Also handle browser unload (closing tab, navigating away, final submit)
window.addEventListener('beforeunload', function() {
    var tracker = window.humanlyTrackerInstance;
    if (tracker) {
        if (DEBUG) {
            log('🚪 Browser unload - marking session as submitted');
        }
        // Use synchronous beacon API for reliable send on unload
        // markSubmitted will be called, and the tracker's beforeunload handler will flush events
    }
});`;

      instructions = `
Qualtrics Integration Steps:

IMPORTANT - HTTPS Required:
Qualtrics requires HTTPS for external scripts. Make sure your tracker URL uses https://.

METHOD 1 - Survey Header (Recommended):
1. In Qualtrics survey editor, click "Look & Feel" (paint brush icon)
2. Go to "General" tab
3. Click "Edit" in the Header section
4. Paste the entire code snippet above
5. Click "Apply" and "Save"

METHOD 2 - JavaScript in Question:
1. Select any question in your survey
2. Click the gear icon (⚙️) and select "Add JavaScript"
3. Paste the code in the "addOnload" section
4. Save your changes

What It Does:
- Automatically tracks ALL text inputs and textareas in your survey
- Captures keystrokes, paste events, cursor movements, and timing data
- Works immediately - no configuration needed!
- Auto-generates unique anonymous user IDs
- Real-time event streaming to your dashboard

Testing:
1. Add the code to your survey
2. Open your task's "Tracking Code" page on ${env.frontendAdminUrl}
3. Click "Start Live Preview"
4. Open your Qualtrics survey in another tab
5. Type in any text field
6. Watch events appear in real-time in the Live Preview!

Debug Mode:
- Debug logging is enabled by default (DEBUG = true at top of code)
- When enabled, you'll see detailed logs in the browser console (F12)
- All logs are prefixed with timestamps and "${BRAND.tracker.consolePrefix}"
- To disable for production, change: var DEBUG = false;

What You'll See in Console:
- 🚀 Initialization messages with configuration details
- ✓ Success messages for each step
- 📡 Network requests to the backend API
- 🔗 Event listener attachment confirmations
- Detailed tracking of events being captured and sent
- Error messages with troubleshooting hints if something fails

Troubleshooting:
- Open browser console (F12) to see debug logs
- Look for "${BRAND.tracker.consolePrefix}" prefixed messages with timestamps
- If tracker fails to load, check that your API URL uses HTTPS
- If no events appear, verify the tracker initialized successfully in console
- Network tab will show POST requests to /api/v1/track/events`;

    } else if (integrationType === 'google-forms') {
      // Google Forms integration
      snippet = `/*
 * ${BRAND.name} Tracker - Google Forms Integration
 *
 * Note: Google Forms has limited JavaScript support.
 * You'll need to use Google Apps Script or embed in a custom page.
 *
 * For custom page embedding:
 */

<!-- Add to your HTML page -->
<script src="${trackerUrl}"></script>
<script>
  (function() {
    var DEBUG = true; // Set to false to disable console logging

    function log(message) {
      if (DEBUG) {
        var timestamp = new Date().toLocaleTimeString();
        console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message);
      }
    }

    // Wait for form to load
    window.addEventListener('load', function() {
      log('🚀 ${BRAND.name} Tracker starting...');

      var tracker = new ${BRAND.tracker.namespace}Tracker({
        taskToken: '${taskToken}',
        apiUrl: '${baseUrl}',
        debug: DEBUG
      });

      // Start tracking
      tracker.init().then(function() {
        log('✓ Tracker initialized successfully');
        log('✓ Monitoring form fields');
      }).catch(function(error) {
        console.error('${BRAND.tracker.consolePrefix} ✗ Initialization failed:', error);
      });

      // Listen for form submission
      var forms = document.querySelectorAll('form');
      forms.forEach(function(form) {
        form.addEventListener('submit', function() {
          log('Form submitted - marking session as complete');
          tracker.markSubmitted();
        });
      });
    });
  })();
</script>`;

      instructions = `
Google Forms Integration:

Due to Google Forms' restrictions, direct JavaScript injection is not supported.
Consider these alternatives:

1. Create a custom form page that looks like Google Forms
2. Use Google Apps Script to track submissions (server-side only)
3. Embed the Google Form in your own page with tracking

For custom implementations, use the standard HTML snippet above.`;

    } else {
      // Standard HTML integration
      snippet = `<!-- ${BRAND.name} Tracking Script -->
<script src="${trackerUrl}"></script>
<script>
  (function() {
    var DEBUG = true; // Set to false to disable console logging

    function log(message, data) {
      if (DEBUG) {
        var timestamp = new Date().toLocaleTimeString();
        if (data !== undefined) {
          console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message, data);
        } else {
          console.log('[' + timestamp + '] ${BRAND.tracker.consolePrefix} ' + message);
        }
      }
    }

    log('🚀 ${BRAND.name} Tracker starting...');

    var tracker = new ${BRAND.tracker.namespace}Tracker({
      taskToken: '${taskToken}',
      apiUrl: '${baseUrl}',
      ${userIdField ? `userIdSelector: '${userIdField}',` : ''}
      debug: DEBUG  // Enable debug mode
    });

    // Initialize and start tracking
    tracker.init().then(function() {
      log('✓ Tracker initialized successfully');
      log('✓ Session ID: ' + (tracker.sessionId ? tracker.sessionId.substring(0, 8) + '...' : 'N/A'));
      log('✓ Monitoring all text inputs and textareas');

      if (DEBUG) {
        setTimeout(function() {
          var textFields = document.querySelectorAll('input[type="text"], textarea, input:not([type])');
          log('✓ Found ' + textFields.length + ' text fields to monitor');
        }, 500);
      }
    }).catch(function(error) {
      console.error('${BRAND.tracker.consolePrefix} ✗ Failed to initialize tracker:', error);
    });

    // Optional: Mark as submitted on form submission
    var forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      log('✓ Found ' + forms.length + ' form(s) - will auto-submit on form submit');
      forms.forEach(function(form) {
        form.addEventListener('submit', function() {
          log('Form submitted - marking session as complete');
          tracker.markSubmitted();
        });
      });
    }
  })();
</script>`;

      instructions = `
Standard HTML Integration:

1. Add the script tags to your HTML page, preferably before the closing </body> tag
2. The tracker will automatically detect and track all text inputs and textareas
3. Customize the userIdSelector if you have a specific user identifier field

Debug Mode:
- Debug logging is enabled by default (DEBUG = true)
- Open browser console (F12) to see detailed logs with timestamps
- All logs are prefixed with "${BRAND.tracker.consolePrefix}"
- To disable for production, change: var DEBUG = false;

For specific element tracking, use:
  tracker.attach('.my-form input, .my-form textarea');`;
    }

    res.json({
      success: true,
      data: {
        snippet,
        instructions,
        trackerUrl,
        taskToken,
        integrationType,
      },
    });
  }
}
