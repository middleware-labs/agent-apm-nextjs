# Getting Started

## agent-apm-nextjs
Description: Agent APM for Next.js

## Prerequisites
Make sure you have installed the latest version of Next.js or a version greater than 13.4+, as Vercel introduced their experimental feature in that release.

Before proceeding with the Next.js APM setup, make sure you have the `@opentelemetry/api` package installed. If it's not already installed, run the following command:

```bash
npm install @opentelemetry/api@">=1.3.0 <1.5.0"
```


## Guides
You can use this APM to track your project, either deployed on Vercel platform or hosted on own server. Run follow steps:

### Step 1: Install Next.js APM package
Run the command below in your terminal to install Middleware’s Next.js APM package:
```bash
npm install @middleware.io/agent-apm-nextjs
```

### Step 2: Modify the next.config.js file
As this feature is experimental, you need to explicitly opt-in by providing below thing into your **next.config.js** file.
```javascript
const nextConfig = {
     ---
     ---
     experimental: {
         instrumentationHook: true
     }
     ---
     ---
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
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        accountKey: "<ACCOUNT-KEY>",
        target: "vercel",
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
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        accountKey: "<ACCOUNT-KEY>",
    });
}
```
- If you want to instrument your project without installing any host then use below code snippet:
```javascript
// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

export function register() {
    tracker.track({
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        accountKey: "<ACCOUNT-KEY>",
        target: "https://<ACCOUNT-UID>.middleware.io:443"
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
*Note: You can find these details in your [Middleware's Installation](https://app.middleware.io/installation#apm/nextjs) page.*

That's it. 