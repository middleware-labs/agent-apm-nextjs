'use strict';
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
// import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";

// import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

import Pyroscope from '@pyroscope/nodejs';
import axios from 'axios';
import fs from 'fs';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

export const track = (args = {}) => {

    /*if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }*/
    const constants = {
        mwAuthUrl: 'https://app.middleware.io/api/v1/auth',
        profilingServerUrl: 'https://profiling.middleware.io',
    }

    const config = {
        hostUrl: 'http://localhost:9319',
        projectName: `Project-${process.pid}`,
        serviceName: `Service-${process.pid}`,
        accessToken: '',
        target: '',
        ...args,
    };

    // For backward compatibility
    if (args.hasOwnProperty('accountKey') && args.accountKey !== '') {
        config.accessToken = args.accountKey;
    }

    const _resourceAttributes = {
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        'mw_agent': true,
        'project.name': config.projectName,
        ...(config.accessToken && {'mw.account_key': config.accessToken}),
        ...(config.accessToken && {'accessToken': config.accessToken}),
    };

    if (config.target !== "") {
        config.hostUrl = config.target;
    }

    if (!!(process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== "")) {
        config.hostUrl = `http://${process.env.MW_AGENT_SERVICE}:9319`;
    }

    const _hostUrl = ((config.target).toLowerCase() === 'vercel') ? {} : {url: `${config.hostUrl}`};

    setupTracer(_hostUrl, _resourceAttributes);
    setupLogger(_hostUrl, _resourceAttributes);
    setupProfiling({
        authUrl: constants.mwAuthUrl,
        profilingServerUrl: constants.profilingServerUrl,
        accessToken: config.accessToken,
        serviceName: config.serviceName
    }).then(() => {});
};

const setupTracer = (hostUrl, resourceAttributes) => {
    /*const sdk = new NodeSDK({
        resource: new Resource(resourceAttributes),
        spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter(hostUrl)),
    });*/
    const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter(hostUrl),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': {
                    enabled: false,
                },
            }),
            new GrpcInstrumentation({
                ignoreGrpcMethods:["Export"]
            })
        ],
    });
    sdk.addResource(new Resource(resourceAttributes));
    sdk.start();

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .catch(error => console.log('Error terminating tracing', error))
            .finally(() => process.exit(0));
    });
};

const setupLogger = (hostUrl, resourceAttributes) => {

    // Optional and only needed to see the internal diagnostic logging (during development)
    // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

    const loggerProvider = new LoggerProvider({
        resource: new Resource(resourceAttributes)
    });

    loggerProvider.addLogRecordProcessor(
        new SimpleLogRecordProcessor(new OTLPLogExporter(hostUrl)),
    );
    logs.setGlobalLoggerProvider(loggerProvider);
};

const logger = (level, message, attributes = {}) => {
    const logger = logs.getLogger(packageJson.name, packageJson.version);

    logger.emit({
        severityNumber: SeverityNumber[level],
        severityText: level,
        body: message,
        attributes: {
            'fluent.tag': 'nextjs.app',
            'mw.app.lang': 'nextjs',
            'level': level.toLowerCase(),
            ...(typeof attributes === 'object' && Object.keys(attributes).length ? attributes : {})
        },
    });
};

const info = (message, attributes = {}) => {
    logger('INFO', message, attributes);
};

const warn = (message, attributes = {}) => {
    logger('WARN', message, attributes);
};

const debug = (message, attributes = {}) => {
    logger('DEBUG', message, attributes);
};

const error = (message, attributes = {}) => {
    logger('ERROR', message, attributes);
};

const setupProfiling = async (obj) => {
    if (obj.accessToken !== '') {
        try {
            const authUrl = process.env.MW_AUTH_URL || obj.authUrl;

            const response = await axios.post(authUrl, null, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Bearer ' + obj.accessToken,
                },
            });

            if (response.status === 200) {
                const data = response.data;
                if (data.hasOwnProperty('success') && data.success === true) {
                    const account = data.data.account;
                    if (data.hasOwnProperty('data')
                        && data.data.hasOwnProperty('account')
                        && typeof data.data.account === 'string') {

                        Pyroscope.init({
                            serverAddress: process.env.MW_PROFILING_SERVER_URL || obj.profilingServerUrl,
                            appName: obj.serviceName,
                            tenantID: account,
                        });

                        Pyroscope.start();
                    } else {
                        console.log('Failed to retrieve TenantID from API response');
                    }
                } else {
                    console.log('Failed to authenticate with Middleware API, kindly check your access token');
                }
            } else {
                console.log('Error making auth request');
            }

        } catch (e) {
            console.log('Error starting profiling:', e.message);
        }
    }
};

const tracker = {
    track,
    info,
    error,
    warn,
    debug,
};

export default tracker;