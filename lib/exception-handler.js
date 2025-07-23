"use strict";

const fs = require("fs");
const { trace, SpanStatusCode } = require("@opentelemetry/api");
const ErrorStackParser = require("error-stack-parser");

/**
 * Check if file is external (node_modules, etc.)
 * @param {string} filePath - The file path
 * @returns {boolean} True if external
 */
function isExternalFile(filePath) {
  if (filePath.startsWith("webpack-internal://")) {
    // External if node_modules, otherwise in-app
    return filePath.includes("node_modules");
  }
  if (filePath.startsWith("node:") || filePath.startsWith("internal/")) {
    return true;
  }
  if (
    filePath.includes("node_modules") ||
    filePath.includes("/usr/lib/") ||
    filePath.includes("/usr/local/lib/")
  ) {
    return true;
  }
  // If it's not an absolute path, treat as external
  if (!filePath.startsWith("/")) {
    return true;
  }
  // Otherwise, treat as in-app
  return false;
}

/**
 * Extract function body around the exception line
 * @param {string} filePath - Path to the source file
 * @param {number} lineNumber - Line number where exception occurred
 * @param {number} contextLines - Number of lines to include above and below
 * @returns {Object} Object containing function context
 */
function extractFunctionContext(filePath, lineNumber, contextLines = 10) {
  try {
    if (!fs.existsSync(filePath) || isExternalFile(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    if (lineNumber > lines.length || lineNumber < 1) {
      return null;
    }

    // Calculate context range
    const startLine = Math.max(1, lineNumber - contextLines);
    const endLine = Math.min(lines.length, lineNumber + contextLines);

    // Extract context lines
    const contextContent = [];
    for (let i = startLine - 1; i < endLine; i++) {
      contextContent.push({
        lineNumber: i + 1,
        code: lines[i] || "",
        isExceptionLine: i + 1 === lineNumber,
      });
    }

    // Try to find the containing function
    const functionInfo = findContainingFunction(lines, lineNumber - 1);

    return {
      filename: filePath,
      exceptionLine: lineNumber,
      contextLines: contextContent,
      functionName: functionInfo.name,
      functionStartLine: functionInfo.startLine,
      functionEndLine: functionInfo.endLine,
      fullFunctionBody: functionInfo.body,
    };
  } catch (error) {
    console.warn("Failed to extract function context:", error.message);
    return null;
  }
}

/**
 * Find the function containing the given line
 * @param {Array} lines - Array of code lines
 * @param {number} targetLine - Zero-based line number
 * @returns {Object} Function information
 */
function findContainingFunction(lines, targetLine) {
  // Look for function declarations around the target line
  let functionStart = -1;
  let functionEnd = -1;
  let functionName = "<anonymous>";

  // Search backwards for function start
  for (let i = targetLine; i >= 0; i--) {
    const line = lines[i];

    // Match various function patterns
    const functionMatches = [
      /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/, // function name()
      /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(/, // const name = (
      /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s*\(/, // const name = async (
      /export\s+(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, // export function
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s+)?function/, // method: function
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(.*\)\s*(?:=>|{)/, // arrow functions
    ];

    for (const pattern of functionMatches) {
      const match = line.match(pattern);
      if (match) {
        functionName = match[1] || "<anonymous>";
        functionStart = i;
        break;
      }
    }

    if (functionStart !== -1) break;
  }

  // Search forwards for function end (find matching brace)
  if (functionStart !== -1) {
    let braceCount = 0;
    let foundStart = false;

    for (let i = functionStart; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === "{") {
          braceCount++;
          foundStart = true;
        } else if (char === "}") {
          braceCount--;
          if (foundStart && braceCount === 0) {
            functionEnd = i;
            break;
          }
        }
      }

      if (functionEnd !== -1) break;
    }
  }

  // Extract function body
  let body = "";
  if (functionStart !== -1 && functionEnd !== -1) {
    body = lines.slice(functionStart, functionEnd + 1).join("\n");
  }

  return {
    name: functionName,
    startLine: functionStart + 1,
    endLine: functionEnd + 1,
    body: body,
  };
}

/**
 * Create exception span event
 * @param {Error} error - The error object
 */
function createExceptionSpanEvent(error) {
  const span = trace.getActiveSpan();

  if (!span) {
    // Create a new span if none is active
    const tracer = trace.getTracer("@middleware.io/agent-apm-nextjs");
    const newSpan = tracer.startSpan(error.name);

    addExceptionEvent(newSpan, error);

    newSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    newSpan.end();
  } else {
    addExceptionEvent(span, error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

/**
 * Add exception event to span
 * @param {Span} span - OpenTelemetry span
 * @param {Error} error - The error object
 */
function addExceptionEvent(span, error) {
  // Add function context information
  const structuredStack = jsonToString(ErrorStackParser.parse(error));

  span.setAttribute("error.structuredStack", structuredStack);

  span.addEvent("exception", {
    "exception.type": error.name,
    "exception.message": error.message,
    "exception.stacktrace": error.stack || "",
    "exception.language": "nodejs",
    "exception.framework": "nextjs",
    "exception.stack_details": structuredStack,
  });
}

function jsonToString(json) {
  let output = "";
  let error = false;
  try {
    output = JSON.stringify(json);
  } catch (ex) {
    error = true;
    // ignore error
  }

  if (error) {
    try {
      output = stringifySafe(json);
    } catch (ex) {
      // ignore error
    }
  }

  return output;
}

/**
 * Process and handle exception
 * @param {Error} error - The error object
 */
function handleException(error) {
  try {
    // Create OpenTelemetry span event
    createExceptionSpanEvent(error);
  } catch (processingError) {
    console.error("Failed to process exception:", processingError.message);
  }
}

/**
 * Setup global exception handlers
 */
function setupExceptionHandlers() {
  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    handleException(error);
    // Don't exit the process immediately for Next.js apps
    console.error("Uncaught Exception:", error);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    handleException(error);
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });

  // Handle warnings (optional)
  process.on("warning", (warning) => {
    if (
      warning.name === "DeprecationWarning" ||
      warning.name === "ExperimentalWarning"
    ) {
      return; // Skip common Next.js warnings
    }
    console.warn("Process Warning:", warning);
  });
}

module.exports = {
  setupExceptionHandlers,
  handleException,
  extractFunctionContext,
  createExceptionSpanEvent,
};
