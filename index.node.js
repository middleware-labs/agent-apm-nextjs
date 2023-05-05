'use strict';
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";

export const track = (args = {}) => {

    /*if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }*/

    const config = {
        hostUrl: 'http://localhost:9319',
        projectName: "Project-" + process.pid,
        serviceName: "Service-" + process.pid,
        accountKey: "",
        target: "",
        ...args,
    };

    const resourceAttributes = {
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        ['mw_agent']: true,
        ['project.name']: config.projectName,
        ...(config.accountKey !== "" && {'mw.account_key': config.accountKey}),
    };

    if (config.target !== "") {
        config.hostUrl = config.target;
    }

    if (!!(process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== "")) {
        config.hostUrl = `http://${process.env.MW_AGENT_SERVICE}:9319`;
    }

    // const configUrl = ((config.target).toLowerCase() === "vercel") ? {} : {url: `${config.hostUrl}/v1/traces`};
    const configUrl = ((config.target).toLowerCase() === "vercel") ? {} : {url: `${config.hostUrl}`};

    const sdk = new NodeSDK({
        resource: new Resource(resourceAttributes),
        spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter(configUrl)),
    });
    sdk.start();

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => {})
            .catch((error) => console.log('Error terminating tracing', error))
            .finally(() => process.exit(0));
    });
};