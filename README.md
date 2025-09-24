# Getting Started

## agent-apm-nextjs
Description: Agent APM for Next.js with Advanced Exception Handling

## Before NPM Pack & Publish:
Now we have 2 types of tags: `latest` and `no-profile`.

`latest`: has all the features.

`no-profile`: has all the features except profiling, client: surface.

## Prerequisites
Make sure you have installed the latest version of Next.js or a version greater than 13.4+, as Vercel introduced their experimental feature in that release.

Before proceeding with the Next.js APM setup, make sure you have the `@opentelemetry/api` package installed. If it's not already installed, run the following command:

```bash
npm install @opentelemetry/api@">=1.3.0 <1.5.0"
```

## Features

### 🚀 Core Features
- **Distributed Tracing**: Track requests across your Next.js application
- **Logging**: Structured logging with OpenTelemetry integration
- **Profiling**: Performance profiling with Pyroscope integration
- **VCS Metadata**: Automatic Git repository information collection

### 🔥 NEW: Advanced Exception Handling
- **Automatic Exception Capture**: Captures unhandled exceptions and promise rejections
- **Function Body Extraction**: Collects source code around exception locations
- **Stack Trace Analysis**: Detailed stack frame information with context
- **Cross-Runtime Support**: Works in both Node.js and Edge runtime environments
- **VCS Integration**: Links exceptions to specific Git commits and branches

## Guides
You can use this APM to track your project, either deployed on Vercel platform or hosted on own server. Run follow steps:

### Step 1: Install Next.js APM package
Run the command below in your terminal to install Middleware's Next.js APM package:
```bash
npm install @middleware.io/agent-apm-nextjs
```

### Step 2: Modify the next.config.js file
As this feature is experimental, you need to explicitly opt-in by providing below thing into your **next.config.js** file.
```javascript
const nextConfig = {
    // ...
    // Your existing code
    
     experimental: {
         instrumentationHook: true,
         serverComponentsExternalPackages: ['@middleware.io/agent-apm-nextjs']
     }
     
    // ...
    // Your existing code
}
module.exports = nextConfig
```

### Step 3: Create an `Instrumentation` file
Create a custom `instrumentation.ts` file in your project root directory, and add following code as per your choice:
- If you are using [Vercel](https://vercel.com/) platform to deploy your projects, then use the code snippet below for serverless functions: 
```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

export function register() {
    tracker.track({
        serviceName: "<SERVICE-NAME>",
        accessToken: "<ACCESS-TOKEN>",
        target: "vercel",
        enableExceptionHandling: true, // Enable advanced exception handling
    });
}
```
*Note: You can find your &lt;ACCOUNT-KEY&gt; on the Installation screen for [NextJs / Vercel](https://app.middleware.io/installation#apm/nextjs).*

*Note: After Deploying your project on Vercel, you need to integrate the [Middleware](https://vercel.com/integrations/middleware) from the marketplace. You can find more details [here](https://docs.middleware.io/docs/apm-configuration/next-js/vercel-integration). To get a better idea, you can clone the sample project from the [GitHub](https://github.com/middleware-labs/demo-apm/tree/master/nextjs/setup) repository.*
- If you are using [Middleware's Host-agent](https://docs.middleware.io/docs/installation) on your machine then use below code snippet:
```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

export function register() {
    tracker.track({
        serviceName: "<SERVICE-NAME>",
        accessToken: "<ACCESS-TOKEN>",
        enableExceptionHandling: true, // Enable advanced exception handling
    });
}
```
- If you want to instrument your project without installing any host then use below code snippet:
```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

export function register() {
    tracker.track({
        serviceName: "<SERVICE-NAME>",
        accessToken: "<ACCESS-TOKEN>",
        target: "https://<ACCOUNT-UID>.middleware.io:443",
        enableExceptionHandling: true, // Enable advanced exception handling
    });
}
```

## Step 4: Enable Logging
To enable logging in your project, you need to add the following code in your file:
```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

export default async function handler(req, res) {
    // ...
    // Your existing code

    tracker.info("Info Sample");
    tracker.warn("Warn Sample", {
        "tester": "Alex",
    });
    tracker.debug("Debug Sample");
    tracker.error("Error Sample");

    // ...
    // Your existing code
}
```

## Step 5: Exception Handling Features

### Automatic Exception Capture
Exceptions are automatically captured when `enableExceptionHandling: true` is set. The system will:
- Capture unhandled exceptions and promise rejections
- Extract function source code around the exception location
- Collect stack trace information with file context
- Link exceptions to Git commit information

### Manual Exception Capture
You can manually capture exceptions with additional context:

```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

try {
    // Your code that might throw an error
    riskyOperation();
} catch (error) {
    // Manually capture the exception with custom attributes
    tracker.captureException(error, {
        userId: '12345',
        feature: 'payment-processing',
        customData: 'additional context'
    });
    
    // Handle the error as needed
    throw error;
}
```

### Wrapper Functions for Enhanced Error Tracking

#### API Route Wrapper
Wrap your API routes to automatically capture exceptions:

```javascript
// pages/api/example.js or app/api/example/route.js
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

async function handler(req, res) {
    // Your API logic here
    const data = await processData();
    res.json({ success: true, data });
}

// Wrap the handler to capture exceptions
export default tracker.wrapAPIHandler(handler);
```

#### Middleware Wrapper
Wrap your Next.js middleware:

```javascript
// middleware.js
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

async function middleware(request) {
    // Your middleware logic
    if (request.nextUrl.pathname.startsWith('/admin')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

// Wrap the middleware to capture exceptions
export default tracker.wrapMiddleware(middleware);
```

#### Server Component Wrapper
Wrap your Server Components:

```javascript
// app/components/MyComponent.tsx
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

function MyServerComponent({ data }) {
    // Your component logic
    if (!data) {
        throw new Error('Data is required');
    }
    
    return <div>{data.content}</div>;
}

// Wrap the component to capture exceptions
export default tracker.wrapServerComponent(MyServerComponent);
```

## Exception Data Collected

When an exception occurs, the following information is automatically collected:

### Basic Exception Information
- Exception type and message
- Full stack trace
- Timestamp and runtime environment
- Git commit information (if available)

### Enhanced Context (Node.js Runtime)
- **Function Body**: Source code of the function where the exception occurred
- **Context Lines**: Code lines around the exception with line numbers
- **File Information**: Filename, line number, and column number
- **Git Metadata**: Commit hash, branch, author, and repository URL
- **Stack Frames**: Detailed information for each frame in the stack trace

### Example Exception Event Structure
```json
{
    "exception.type": "TypeError",
    "exception.message": "Cannot read property 'id' of undefined",
    "exception.stacktrace": "TypeError: Cannot read property...",
    "exception.language": "nodejs",
    "exception.framework": "nextjs",
    "exception.context.0.filename": "/app/api/users.js",
    "exception.context.0.function_name": "getUserById",
    "exception.context.0.function_body": "function getUserById(id) {\n  const user = users.find(u => u.id === id);\n  return user.profile;\n}",
    "exception.context.0.exception_line": 23,
    "vcs.commit.id": "abc123...",
    "vcs.branch": "feature/user-management",
    "vcs.commit.author.name": "Developer Name"
}
```

## Configuration Options

```javascript
tracker.track({
    serviceName: "my-nextjs-app",
    accessToken: "your-access-token",
    target: "vercel", // or your custom endpoint
    
    // Exception handling configuration
    enableExceptionHandling: true,     // Enable/disable exception handling
    
    // Optional: Custom resource attributes
    customResourceAttributes: {
        "deployment.environment": "production",
        "app.version": "1.2.3"
    }
});
```

## Runtime Support

### Node.js Runtime
- ✅ Full exception handling with function body extraction
- ✅ File system access for source code reading
- ✅ Git metadata collection
- ✅ Complete stack trace analysis

### Edge Runtime
- ✅ Basic exception capture
- ✅ Stack trace logging
- ❌ Limited file system access (no function body extraction)
- ❌ Limited Git metadata collection

*Note: You can find these details in your [Middleware's Installation](https://app.middleware.io/installation#apm/nextjs) page.*

That's it. 