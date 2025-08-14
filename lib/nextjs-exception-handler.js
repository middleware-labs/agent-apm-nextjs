'use strict';

/**
 * Next.js specific exception handler that works across different runtime environments
 */

let isEdgeRuntime = false;
let exceptionHandler = null;

// Detect runtime environment
try {
  isEdgeRuntime = typeof EdgeRuntime !== 'undefined' ||
    process.env.NEXT_RUNTIME === 'edge' ||
    typeof globalThis.EdgeRuntime !== 'undefined';
} catch (e) {
  // In edge runtime, process might not be available
  isEdgeRuntime = true;
}

/**
 * Initialize exception handling for Next.js
 * @param {Object} config - Configuration object
 */
function initializeNextJSExceptionHandling(config = {}) {
  if (isEdgeRuntime) {
    setupEdgeRuntimeExceptionHandling(config);
  } else {
    setupNodeRuntimeExceptionHandling(config);
  }
}

/**
 * Setup exception handling for Node.js runtime
 * @param {Object} config - Configuration object
 */
function setupNodeRuntimeExceptionHandling(config) {
  try {
    // Import the main exception handler (only available in Node.js runtime)
    exceptionHandler = require('./exception-handler');

    // Setup global handlers
    exceptionHandler.setupExceptionHandlers();

    // Setup Next.js specific handlers
    setupNextJSNodeHandlers(config);

    console.log('Exception handling initialized for Node.js runtime');
  } catch (error) {
    console.warn('Failed to setup Node.js exception handling:', error.message);
  }
}

/**
 * Setup Next.js specific handlers for Node.js runtime
 * @param {Object} config - Configuration object
 */
function setupNextJSNodeHandlers(config) {
  // Monkey patch Next.js server components error handling
  patchNextJSServerComponents();

  // Monkey patch API route error handling
  patchNextJSAPIRoutes();

  // Monkey patch middleware error handling
  patchNextJSMiddleware();
}

/**
 * Patch Next.js server components for error handling
 */
function patchNextJSServerComponents() {
  // Try to patch React Server Components error handling
  try {
    // This is a simplified approach - in production you might need more sophisticated patching
    const originalConsoleError = console.error;
    console.error = function (...args) {
      // Check if this looks like a React/Next.js error
      const errorMessage = args.join(' ');
      if (errorMessage.includes('Error:') ||
        errorMessage.includes('TypeError:') ||
        errorMessage.includes('ReferenceError:')) {

        // Try to extract error object
        const errorArg = args.find(arg => arg instanceof Error);
        if (errorArg && exceptionHandler) {
          exceptionHandler.handleException(errorArg);
        }
      }

      // Call original console.error
      originalConsoleError.apply(console, args);
    };
  } catch (error) {
    console.warn('Failed to patch server components:', error.message);
  }
}

/**
 * Patch Next.js API routes for error handling
 */
function patchNextJSAPIRoutes() {
  // This would require more sophisticated runtime patching
  // For now, we rely on the global exception handlers
}

/**
 * Patch Next.js middleware for error handling
 */
function patchNextJSMiddleware() {
  // Middleware error handling would be handled by global handlers
}

/**
 * Setup exception handling for Edge runtime
 * @param {Object} config - Configuration object
 */
function setupEdgeRuntimeExceptionHandling(config) {
  try {
    // In Edge runtime, we have limited capabilities
    // We'll use a simplified exception handler

    // Global error handler for Edge runtime
    globalThis.addEventListener && globalThis.addEventListener('error', (event) => {
      handleEdgeRuntimeException(event.error || new Error(event.message));
    });

    // Unhandled promise rejection handler for Edge runtime
    globalThis.addEventListener && globalThis.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      handleEdgeRuntimeException(error);
    });

    console.log('Exception handling initialized for Edge runtime');
  } catch (error) {
    console.warn('Failed to setup Edge runtime exception handling:', error.message);
  }
}

/**
 * Handle exceptions in Edge runtime (simplified)
 * @param {Error} error - The error object
 */
function handleEdgeRuntimeException(error) {
  try {
    // In Edge runtime, we have limited file system access
    // So we'll create a simplified exception event

    const exceptionData = {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      runtime: 'edge'
    };

    // Try to send to console for now
    // In a real implementation, you might want to buffer these and send via fetch
    console.error('Edge Runtime Exception:', exceptionData);

    // If OpenTelemetry API is available, create span event
    try {
      const { trace, SpanStatusCode } = require('@opentelemetry/api');
      const span = trace.getActiveSpan();

      if (span) {
        span.addEvent('exception', {
          'exception.type': error.constructor.name,
          'exception.message': error.message,
          'exception.stacktrace': error.stack,
          'exception.language': 'nodejs',
          'exception.framework': 'nextjs',
          'exception.runtime': 'edge'
        });

        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
    } catch (otelError) {
      // OpenTelemetry might not be available in Edge runtime
      console.warn('OpenTelemetry not available in Edge runtime');
    }

  } catch (processingError) {
    console.error('Failed to process edge runtime exception:', processingError.message);
  }
}

/**
 * Create a wrapper for Next.js API handlers
 * @param {Function} handler - The original API handler
 * @returns {Function} Wrapped handler
 */
function wrapNextJSAPIHandler(handler) {
  return async function wrappedHandler(req, res) {
    try {
      return await handler(req, res);
    } catch (error) {
      // Handle the exception
      if (exceptionHandler && !isEdgeRuntime) {
        exceptionHandler.handleException(error);
      } else if (isEdgeRuntime) {
        handleEdgeRuntimeException(error);
      }

      // Re-throw the error so Next.js can handle it normally
      throw error;
    }
  };
}

/**
 * Create a wrapper for Next.js middleware
 * @param {Function} middleware - The original middleware
 * @returns {Function} Wrapped middleware
 */
function wrapNextJSMiddleware(middleware) {
  return async function wrappedMiddleware(request, event) {
    try {
      return await middleware(request, event);
    } catch (error) {
      // Handle the exception
      if (exceptionHandler && !isEdgeRuntime) {
        exceptionHandler.handleException(error);
      } else if (isEdgeRuntime) {
        handleEdgeRuntimeException(error);
      }

      // Re-throw the error so Next.js can handle it normally
      throw error;
    }
  };
}

/**
 * Create a wrapper for Next.js Server Components
 * @param {Function} component - The original component
 * @returns {Function} Wrapped component
 */
function wrapNextJSServerComponent(component) {
  return function wrappedComponent(props) {
    try {
      return component(props);
    } catch (error) {
      // Handle the exception
      if (exceptionHandler && !isEdgeRuntime) {
        exceptionHandler.handleException(error);
      } else if (isEdgeRuntime) {
        handleEdgeRuntimeException(error);
      }

      // Re-throw the error so Next.js can handle it normally
      throw error;
    }
  };
}

/**
 * Manually handle an exception (for use in user code)
 * @param {Error} error - The error to handle
 */
function handleManualException(error) {
  if (exceptionHandler && !isEdgeRuntime) {
    exceptionHandler.handleException(error);
  } else if (isEdgeRuntime) {
    handleEdgeRuntimeException(error);
  } else {
    console.error('Exception handler not available:', error);
  }
}

module.exports = {
  initializeNextJSExceptionHandling,
  wrapNextJSAPIHandler,
  wrapNextJSMiddleware,
  wrapNextJSServerComponent,
  handleManualException,
  isEdgeRuntime
}; 