# Getting Started

### agent agent-apm-nextjs
Description: Agent APM for Next.js

### Prerequisites
* To monitor APM data on dashboard, [Middleware Host-agent](https://docs.middleware.io/docs/getting-started) needs to be installed, You can refer [this demo project](https://github.com/middleware-labs/demo-apm/tree/master/agent-apm-nextjs) to refer use cases of APM.

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
3. Now create a custom `instrumentation.ts` file in your project root directory, and add below code snippet:
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
That's it. 