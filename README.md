# Getting Started

### agent-apm-nextjs
Description: Agent APM for Next.js

### Guides
To use this APM agent, follow below steps:
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
- If you want to instrument your project without any Host then use below code snippet:
```
// @ts-ignore
import { track } from '@middleware.io/agent-apm-nextjs';

export function register() {
    track({
        projectName: "<PROJECT-NAME>",
        serviceName: "<SERVICE-NAME>",
        accountKey: "<ACCOUNT-KEY>",
        target: "<TARGET>"
    });
}
```
*Note: You can find these details in your [Middleware's Installation](https://docs.middleware.io/docs/nextjs-setup) page.*

That's it. 