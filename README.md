# Getting Started

### agent-apm-nextjs
Description: Agent APM for Next.js

## Prerequisites

Before proceeding with the Next.js APM setup, make sure you have the `@opentelemetry/api` package installed. If it's not already installed, run the following command:

```
npm install @opentelemetry/api@">=1.3.0 <1.5.0"
```


### Guides
You can use this APM to track your self-hosted *(other than Vercel platform)* project . Run follow steps:
1. Run `npm install @middleware.io/agent-apm-nextjs`.
2. This feature is experimental, you need to explicitly opt-in by providing below thing into your **next.config.js** file.
```
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
3. Now create a custom `instrumentation.ts` file in your project root directory, and add following code as per your choice:
- If you are using [Vercel](https://vercel.com/) platform to deploy your projects, then use the code snippet below for serverless functions: 
```
// @ts-ignore
import { track } from '@middleware.io/agent-apm-nextjs';

export function register() {
    track({
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        target: "vercel",
    });
}
```
*Note: After Deploying your project on Vercel, you need to integrate the [Middleware](https://vercel.com/integrations/middleware) from the marketplace. You can find more details [here](https://docs.middleware.io/docs/apm-configuration/next-js/vercel-integration). To get a better idea, you can clone the sample project from the [GitHub](https://github.com/middleware-labs/demo-apm/tree/master/nextjs/setup) repository.*
- If you are using [Middleware's Host-agent](https://docs.middleware.io/docs/installation) on your machine then use below code snippet:
```
// @ts-ignore
import { track } from '@middleware.io/agent-apm-nextjs';

export function register() {
    track({
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
    });
}
```
- If you want to instrument your project without installing any host then use below code snippet:
```
// @ts-ignore
import { track } from '@middleware.io/agent-apm-nextjs';

export function register() {
    track({
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        accountKey: "<ACCOUNT-KEY>",
        target: "https://<ACCOUNT-UID>.middleware.io:443"
    });
}
```
*Note: You can find these details in your [Middleware's Installation](https://docs.middleware.io/docs/nextjs-setup) page.*

That's it. 