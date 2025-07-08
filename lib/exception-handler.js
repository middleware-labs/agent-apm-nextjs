'use strict';

const fs = require('fs');
const path = require('path');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

/**
 * Parse stack trace and extract file information
 * @param {Error} error - The error object
 * @returns {Array} Array of stack frame objects
 */
function parseStackTrace(error) {
    if (!error.stack) return [];
    
    const stackLines = error.stack.split('\n');
    const frames = [];
    
    // Skip first line (error message) and parse stack frames
    for (let i = 1; i < stackLines.length; i++) {
        const line = stackLines[i].trim();
        
        // Match patterns like:
        // at functionName (/path/to/file.js:line:column)
        // at /path/to/file.js:line:column
        const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
        
        if (match) {
            const [, functionName, filePath, lineNumber, columnNumber] = match;
            
            frames.push({
                function: functionName || '<anonymous>',
                filename: filePath,
                lineno: parseInt(lineNumber, 10),
                colno: parseInt(columnNumber, 10),
                in_app: !isExternalFile(filePath)
            });
        }
    }
    
    return frames;
}

/**
 * Check if file is external (node_modules, etc.)
 * @param {string} filePath - The file path
 * @returns {boolean} True if external
 */
function isExternalFile(filePath) {
    return filePath.includes('node_modules') || 
           filePath.includes('/usr/lib/') ||
           filePath.includes('/usr/local/lib/') ||
           !filePath.startsWith('/') ||
           filePath.startsWith('internal/');
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
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
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
                code: lines[i] || '',
                isExceptionLine: i + 1 === lineNumber
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
            fullFunctionBody: functionInfo.body
        };
    } catch (error) {
        console.warn('Failed to extract function context:', error.message);
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
    let functionName = '<anonymous>';
    
    // Search backwards for function start
    for (let i = targetLine; i >= 0; i--) {
        const line = lines[i];
        
        // Match various function patterns
        const functionMatches = [
            /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,  // function name()
            /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(/,  // const name = (
            /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s*\(/,  // const name = async (
            /export\s+(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,  // export function
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s+)?function/,  // method: function
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(.*\)\s*(?:=>|{)/,  // arrow functions
        ];
        
        for (const pattern of functionMatches) {
            const match = line.match(pattern);
            if (match) {
                functionName = match[1] || '<anonymous>';
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
                if (char === '{') {
                    braceCount++;
                    foundStart = true;
                } else if (char === '}') {
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
    let body = '';
    if (functionStart !== -1 && functionEnd !== -1) {
        body = lines.slice(functionStart, functionEnd + 1).join('\n');
    }
    
    return {
        name: functionName,
        startLine: functionStart + 1,
        endLine: functionEnd + 1,
        body: body
    };
}

/**
 * Create exception span event
 * @param {Error} error - The error object
 * @param {Array} stackFrames - Parsed stack frames
 * @param {Array} functionContexts - Function contexts for stack frames
 */
function createExceptionSpanEvent(error, stackFrames, functionContexts) {
    const span = trace.getActiveSpan();
    
    if (!span) {
        // Create a new span if none is active
        const tracer = trace.getTracer('@middleware.io/agent-apm-nextjs');
        const newSpan = tracer.startSpan('unhandled.exception');
        
        addExceptionEvent(newSpan, error, stackFrames, functionContexts);
        
        newSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        newSpan.end();
    } else {
        addExceptionEvent(span, error, stackFrames, functionContexts);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
}

/**
 * Add exception event to span
 * @param {Span} span - OpenTelemetry span
 * @param {Error} error - The error object
 * @param {Array} stackFrames - Parsed stack frames
 * @param {Array} functionContexts - Function contexts
 */
function addExceptionEvent(span, error, stackFrames, functionContexts) {
    const exceptionAttributes = {
        'exception.type': error.constructor.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack,
        'exception.language': 'nodejs',
        'exception.framework': 'nextjs'
    };
    
    // Add stack frame information
    stackFrames.forEach((frame, index) => {
        const prefix = `exception.stack.${index}`;
        exceptionAttributes[`${prefix}.filename`] = frame.filename;
        exceptionAttributes[`${prefix}.function`] = frame.function;
        exceptionAttributes[`${prefix}.lineno`] = frame.lineno;
        exceptionAttributes[`${prefix}.colno`] = frame.colno;
        exceptionAttributes[`${prefix}.is_file_external`] = !frame.in_app;
    });
    
    // Add function context information
    functionContexts.forEach((context, index) => {
        if (context) {
            const prefix = `exception.context.${index}`;
            exceptionAttributes[`${prefix}.filename`] = context.filename;
            exceptionAttributes[`${prefix}.function_name`] = context.functionName;
            exceptionAttributes[`${prefix}.function_start_line`] = context.functionStartLine;
            exceptionAttributes[`${prefix}.function_end_line`] = context.functionEndLine;
            exceptionAttributes[`${prefix}.exception_line`] = context.exceptionLine;
            exceptionAttributes[`${prefix}.function_body`] = context.fullFunctionBody;
            
            // Add context lines for debugging
            context.contextLines.forEach((line, lineIndex) => {
                const linePrefix = `${prefix}.context.${lineIndex}`;
                exceptionAttributes[`${linePrefix}.line_number`] = line.lineNumber;
                exceptionAttributes[`${linePrefix}.code`] = line.code;
                exceptionAttributes[`${linePrefix}.is_exception_line`] = line.isExceptionLine;
            });
        }
    });
    
    span.addEvent('exception', exceptionAttributes);
}

/**
 * Process and handle exception
 * @param {Error} error - The error object
 */
function handleException(error) {
    try {
        // Parse stack trace
        const stackFrames = parseStackTrace(error);
        
        // Extract function contexts for each frame
        const functionContexts = stackFrames
            .filter(frame => frame.in_app) // Only process app files
            .slice(0, 5) // Limit to first 5 frames to avoid performance issues
            .map(frame => extractFunctionContext(frame.filename, frame.lineno));
        
        // Create OpenTelemetry span event
        createExceptionSpanEvent(error, stackFrames, functionContexts);
        
        console.error('Exception captured and processed:', error.message);
    } catch (processingError) {
        console.error('Failed to process exception:', processingError.message);
    }
}

/**
 * Setup global exception handlers
 */
function setupExceptionHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        handleException(error);
        // Don't exit the process immediately for Next.js apps
        console.error('Uncaught Exception:', error);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        handleException(error);
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Handle warnings (optional)
    process.on('warning', (warning) => {
        if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
            return; // Skip common Next.js warnings
        }
        console.warn('Process Warning:', warning);
    });
}

module.exports = {
    setupExceptionHandlers,
    handleException,
    parseStackTrace,
    extractFunctionContext,
    createExceptionSpanEvent
}; 