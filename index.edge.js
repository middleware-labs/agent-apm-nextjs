"use strict";

const stringifySafe = require("json-stringify-safe");

// Edge runtime has limited capabilities, so we provide basic functionality
let isInitialized = false;

module.exports.track = (args = {}) => {
  if (!isInitialized) {
    setupEdgeExceptionHandling(args);
    isInitialized = true;
  }
  return true;
};

function setupEdgeExceptionHandling(config = {}) {
  // Basic exception handling for Edge runtime
  if (typeof globalThis !== "undefined") {
    // Global error handler for Edge runtime
    if (globalThis.addEventListener) {
      globalThis.addEventListener("error", (event) => {
        const error = event.error || new Error(event.message);
        handleEdgeException(error);
      });

      globalThis.addEventListener("unhandledrejection", (event) => {
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
        handleEdgeException(error);
      });
    }
  }
}

function handleEdgeException(error) {
  // Create simplified exception data for Edge runtime
  const exceptionData = {
    type: error.constructor.name,
    message: error.message,
    stack: error.stack,
    timestamp: Date.now(),
    runtime: "edge",
    framework: "nextjs",
  };

  // Log to console (primary way to capture in Edge runtime)
  console.error(
    "NextJS Edge Runtime Exception:",
    JSON.stringify(exceptionData, null, 2)
  );

  // In Edge runtime, we might not have access to full OpenTelemetry
  // but we can still try basic span events if available
  try {
    // This will only work if OpenTelemetry API is available in Edge runtime
    if (typeof require !== "undefined") {
      const { trace, SpanStatusCode } = require("@opentelemetry/api");
      const ErrorStackParser = require("error-stack-parser");
      const span = trace.getActiveSpan();

      const structuredStack = jsonToString(ErrorStackParser.parse(error));

      span.setAttribute("error.structuredStack", structuredStack);

      if (span) {
        span.addEvent("exception", {
          "exception.type": error.constructor.name,
          "exception.message": error.message,
          "exception.stacktrace": error.stack || "",
          "exception.stack_details": structuredStack,
          "exception.language": "nodejs",
          "exception.framework": "nextjs",
          "exception.runtime": "edge",
        });

        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
    }
  } catch (otelError) {
    // OpenTelemetry not available in Edge runtime, which is expected
  }
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

module.exports.info = (message, attributes = {}) => {
  console.log("INFO:", message, attributes);
  return true;
};

module.exports.warn = (message, attributes = {}) => {
  console.warn("WARN:", message, attributes);
  return true;
};

module.exports.debug = (message, attributes = {}) => {
  console.log("DEBUG:", message, attributes);
  return true;
};

module.exports.error = (message, attributes = {}) => {
  console.error("ERROR:", message, attributes);
  return true;
};

// Add manual exception handling for Edge runtime
module.exports.captureException = (error, attributes = {}) => {
  console.error("Captured Exception:", {
    message: error.message,
    type: error.constructor.name,
    stack: error.stack,
    attributes: attributes,
  });

  handleEdgeException(error);
  return true;
};

// Provide wrapper functions for Edge runtime (simplified versions)
module.exports.wrapAPIHandler = (handler) => {
  return async function wrappedHandler(req, res) {
    try {
      return await handler(req, res);
    } catch (error) {
      handleEdgeException(error);
      throw error; // Re-throw so Next.js can handle it
    }
  };
};

module.exports.wrapMiddleware = (middleware) => {
  return async function wrappedMiddleware(request, event) {
    try {
      return await middleware(request, event);
    } catch (error) {
      handleEdgeException(error);
      throw error; // Re-throw so Next.js can handle it
    }
  };
};

module.exports.wrapServerComponent = (component) => {
  return function wrappedComponent(props) {
    try {
      return component(props);
    } catch (error) {
      handleEdgeException(error);
      throw error; // Re-throw so Next.js can handle it
    }
  };
};
