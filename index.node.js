'use strict';
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import process from 'process';

export const track = (args = {}) => {

    /*if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }*/

    const config = {
        hostUrl: 'http://localhost:9320',
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
        config.hostUrl = `http://${process.env.MW_AGENT_SERVICE}:9320`;
    }

    const configUrl = ((config.target).toLowerCase() === "vercel") ? {} : {url: `${config.hostUrl}/v1/traces`};

    const provider = new NodeTracerProvider({
        resource: new Resource(resourceAttributes),
    });

    provider.register();

    provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter(configUrl)));

    return provider;

};